import { Polar } from "@polar-sh/sdk";
import { v } from "convex/values";
import { Webhook, WebhookVerificationError } from "standardwebhooks";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  action,
  httpAction,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";

const TIER_ACCOUNT_LIMITS: Record<string, number> = {
  base: 25,
  pro: 50,
  premium: Infinity,
};

export const getTierAccountLimit = (tier: string): number =>
  TIER_ACCOUNT_LIMITS[tier] ?? 25;

// ---------------------------------------------------------------------------
// Workspace access — the single source of truth for the Trial funnel.
//
// Every consumer (dashboard gate, connect-another-account check, Trial
// countdown, paywall copy) derives from this one decision instead of
// scattering `status === "active"` checks. Mirrors how `validateAgainst
// capability` is the single composer/schedule gate. See ADR 0008.
// ---------------------------------------------------------------------------

export const TRIAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
// Free limit during the Trial: exactly ONE connected Social Account (US#30).
// Distinct from the paid tier caps in TIER_ACCOUNT_LIMITS — don't conflate them.
const TRIAL_ACCOUNT_LIMIT = 1;
const DAY_MS = 24 * 60 * 60 * 1000;

export type WorkspaceAccess = {
  state: "trial" | "active" | "expired";
  // Present only while `state === "trial"`.
  trialDaysRemaining?: number;
  // The free Trial limit is ONE Social Account; paid tiers use the tier cap.
  canConnectAnotherAccount: boolean;
  // Why the paywall, so the copy can explain it.
  reason?: "trial_expired" | "account_limit";
};

/**
 * Decide a Workspace's access state from its Subscription + Trial window.
 *
 * Resolution order:
 *  1. Active Subscription  → `active`, paid tier cap applies.
 *  2. `now < trialEndsAt`  → `trial`, free limit of one Social Account.
 *  3. otherwise            → `expired` (this also covers the back-compat case
 *     of a row with no `trialEndsAt`, so old workspaces don't crash the gate).
 *
 * A `revoked` (disconnected) Social Account does not count toward either limit.
 */
export async function computeWorkspaceAccess(
  ctx: QueryCtx | MutationCtx,
  workspaceId: Id<"workspaces">,
  now: number = Date.now()
): Promise<WorkspaceAccess> {
  const workspace = await ctx.db.get(workspaceId);
  if (!workspace) {
    return { state: "expired", canConnectAnotherAccount: false, reason: "trial_expired" };
  }

  const subscription = await ctx.db
    .query("subscriptions")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .first();

  const accounts = await ctx.db
    .query("socialAccounts")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .collect();
  const connectedCount = accounts.filter((a) => a.status !== "revoked").length;

  if (subscription?.status === "active") {
    const canConnect = connectedCount < getTierAccountLimit(workspace.tier);
    return {
      state: "active",
      canConnectAnotherAccount: canConnect,
      reason: canConnect ? undefined : "account_limit",
    };
  }

  const onTrial = workspace.trialEndsAt !== undefined && now < workspace.trialEndsAt;
  if (onTrial) {
    const canConnect = connectedCount < TRIAL_ACCOUNT_LIMIT;
    return {
      state: "trial",
      trialDaysRemaining: Math.max(0, Math.ceil((workspace.trialEndsAt! - now) / DAY_MS)),
      canConnectAnotherAccount: canConnect,
      reason: canConnect ? undefined : "account_limit",
    };
  }

  return { state: "expired", canConnectAnotherAccount: false, reason: "trial_expired" };
}

export const getWorkspaceAccess = query({
  args: {},
  handler: async (ctx): Promise<WorkspaceAccess | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.subject))
      .unique();
    if (!user?.workspaceId) return null;

    return computeWorkspaceAccess(ctx, user.workspaceId);
  },
});

const createCheckout = async ({
  customerEmail,
  productPriceId,
  successUrl,
  metadata,
}: {
  customerEmail: string;
  productPriceId: string;
  successUrl: string;
  metadata?: Record<string, string>;
}) => {
  if (!process.env.POLAR_ACCESS_TOKEN) {
    throw new Error("POLAR_ACCESS_TOKEN is not configured");
  }

  const polar = new Polar({
    server: (process.env.POLAR_SERVER as "sandbox" | "production") || "sandbox",
    accessToken: process.env.POLAR_ACCESS_TOKEN,
  });

  const { result: productsResult } = await polar.products.list({
    organizationId: process.env.POLAR_ORGANIZATION_ID,
    isArchived: false,
  });

  let productId = null;
  for (const product of productsResult.items) {
    const hasPrice = product.prices.some(
      (price: any) => price.id === productPriceId
    );
    if (hasPrice) {
      productId = product.id;
      break;
    }
  }

  if (!productId) {
    throw new Error(`Product not found for price ID: ${productPriceId}`);
  }

  const result = await polar.checkouts.create({
    products: [productId],
    successUrl,
    customerEmail,
    metadata: { ...metadata, priceId: productPriceId },
  });
  return result;
};

export const getAvailablePlansQuery = query({
  handler: async (ctx) => {
    const polar = new Polar({
      server: (process.env.POLAR_SERVER as "sandbox" | "production") || "sandbox",
      accessToken: process.env.POLAR_ACCESS_TOKEN,
    });

    const { result } = await polar.products.list({
      organizationId: process.env.POLAR_ORGANIZATION_ID,
      isArchived: false,
    });

    const cleanedItems = result.items.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      isRecurring: item.isRecurring,
      prices: item.prices.map((price: any) => ({
        id: price.id,
        amount: price.priceAmount,
        currency: price.priceCurrency,
        interval: price.recurringInterval,
      })),
    }));

    return { items: cleanedItems, pagination: result.pagination };
  },
});

export const getAvailablePlans = action({
  handler: async (ctx) => {
    const polar = new Polar({
      server: (process.env.POLAR_SERVER as "sandbox" | "production") || "sandbox",
      accessToken: process.env.POLAR_ACCESS_TOKEN,
    });

    const { result } = await polar.products.list({
      organizationId: process.env.POLAR_ORGANIZATION_ID,
      isArchived: false,
    });

    const cleanedItems = result.items.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      isRecurring: item.isRecurring,
      prices: item.prices.map((price: any) => ({
        id: price.id,
        amount: price.priceAmount,
        currency: price.priceCurrency,
        interval: price.recurringInterval,
      })),
    }));

    return { items: cleanedItems, pagination: result.pagination };
  },
});

export const createCheckoutSession = action({
  args: {
    priceId: v.string(),
    // "base" | "pro" | "premium" — passed from the pricing page so the webhook knows which tier
    tier: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    let user = await ctx.runQuery(api.users.findUserByToken, {
      tokenIdentifier: identity.subject,
    });

    if (!user) {
      user = await ctx.runMutation(api.users.upsertUser);
      if (!user) throw new Error("Failed to create user");
    }

    if (!user.workspaceId) throw new Error("User has no workspace");

    const checkout = await createCheckout({
      customerEmail: user.email!,
      productPriceId: args.priceId,
      successUrl: `${process.env.FRONTEND_URL}/success`,
      metadata: {
        workspaceId: user.workspaceId,
        tier: args.tier ?? "base",
      },
    });

    return checkout.url;
  },
});

export const checkUserSubscriptionStatus = query({
  args: {
    userId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let tokenIdentifier: string;

    if (args.userId) {
      tokenIdentifier = args.userId;
    } else {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) return { hasActiveSubscription: false };
      tokenIdentifier = identity.subject;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", tokenIdentifier))
      .unique();

    if (!user?.workspaceId) return { hasActiveSubscription: false };

    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", user.workspaceId))
      .first();

    return { hasActiveSubscription: subscription?.status === "active" };
  },
});

export const fetchUserSubscription = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.subject))
      .unique();

    if (!user?.workspaceId) return null;

    return await ctx.db
      .query("subscriptions")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", user.workspaceId))
      .first();
  },
});

export const handleWebhookEvent = mutation({
  args: { body: v.any() },
  handler: async (ctx, args) => {
    const eventType = args.body.type;

    await ctx.db.insert("webhookEvents", {
      type: eventType,
      polarEventId: args.body.data.id,
      createdAt: args.body.data.created_at,
      modifiedAt: args.body.data.modified_at || args.body.data.created_at,
      data: args.body.data,
    });

    switch (eventType) {
      case "subscription.created":
        await ctx.db.insert("subscriptions", {
          polarId: args.body.data.id,
          polarPriceId: args.body.data.price_id,
          currency: args.body.data.currency,
          interval: args.body.data.recurring_interval,
          workspaceId: args.body.data.metadata.workspaceId,
          userId: args.body.data.metadata.workspaceId, // kept for compat
          status: args.body.data.status,
          currentPeriodStart: new Date(args.body.data.current_period_start).getTime(),
          currentPeriodEnd: new Date(args.body.data.current_period_end).getTime(),
          cancelAtPeriodEnd: args.body.data.cancel_at_period_end,
          amount: args.body.data.amount,
          startedAt: new Date(args.body.data.started_at).getTime(),
          endedAt: args.body.data.ended_at ? new Date(args.body.data.ended_at).getTime() : undefined,
          canceledAt: args.body.data.canceled_at ? new Date(args.body.data.canceled_at).getTime() : undefined,
          customerCancellationReason: args.body.data.customer_cancellation_reason || undefined,
          customerCancellationComment: args.body.data.customer_cancellation_comment || undefined,
          metadata: args.body.data.metadata || {},
          customFieldData: args.body.data.custom_field_data || {},
          customerId: args.body.data.customer_id,
        });
        break;

      case "subscription.active": {
        const activeSub = await ctx.db
          .query("subscriptions")
          .withIndex("polarId", (q) => q.eq("polarId", args.body.data.id))
          .first();

        if (activeSub) {
          await ctx.db.patch(activeSub._id, {
            status: args.body.data.status,
            startedAt: new Date(args.body.data.started_at).getTime(),
          });

          // Upgrade workspace tier
          const tier = args.body.data.metadata?.tier as string | undefined;
          if (tier && activeSub.workspaceId) {
            await ctx.db.patch(activeSub.workspaceId, { tier: tier as any });
          }
        }
        break;
      }

      case "subscription.updated": {
        const existingSub = await ctx.db
          .query("subscriptions")
          .withIndex("polarId", (q) => q.eq("polarId", args.body.data.id))
          .first();

        if (existingSub) {
          await ctx.db.patch(existingSub._id, {
            amount: args.body.data.amount,
            status: args.body.data.status,
            currentPeriodStart: new Date(args.body.data.current_period_start).getTime(),
            currentPeriodEnd: new Date(args.body.data.current_period_end).getTime(),
            cancelAtPeriodEnd: args.body.data.cancel_at_period_end,
            metadata: args.body.data.metadata || {},
            customFieldData: args.body.data.custom_field_data || {},
          });
        }
        break;
      }

      case "subscription.canceled": {
        const canceledSub = await ctx.db
          .query("subscriptions")
          .withIndex("polarId", (q) => q.eq("polarId", args.body.data.id))
          .first();

        if (canceledSub) {
          await ctx.db.patch(canceledSub._id, {
            status: args.body.data.status,
            canceledAt: args.body.data.canceled_at
              ? new Date(args.body.data.canceled_at).getTime()
              : undefined,
            customerCancellationReason: args.body.data.customer_cancellation_reason || undefined,
            customerCancellationComment: args.body.data.customer_cancellation_comment || undefined,
          });
        }
        break;
      }

      case "subscription.uncanceled": {
        const uncanceledSub = await ctx.db
          .query("subscriptions")
          .withIndex("polarId", (q) => q.eq("polarId", args.body.data.id))
          .first();

        if (uncanceledSub) {
          await ctx.db.patch(uncanceledSub._id, {
            status: args.body.data.status,
            cancelAtPeriodEnd: false,
            canceledAt: undefined,
            customerCancellationReason: undefined,
            customerCancellationComment: undefined,
          });
        }
        break;
      }

      case "subscription.revoked": {
        const revokedSub = await ctx.db
          .query("subscriptions")
          .withIndex("polarId", (q) => q.eq("polarId", args.body.data.id))
          .first();

        if (revokedSub) {
          await ctx.db.patch(revokedSub._id, {
            status: "revoked",
            endedAt: args.body.data.ended_at
              ? new Date(args.body.data.ended_at).getTime()
              : undefined,
          });

          // Downgrade workspace to base
          if (revokedSub.workspaceId) {
            await ctx.db.patch(revokedSub.workspaceId, { tier: "base" });
          }
        }
        break;
      }

      case "order.created":
        break;

      default:
        console.log(`Unhandled event type: ${eventType}`);
    }
  },
});

const validateEvent = (
  body: string | Buffer,
  headers: Record<string, string>,
  secret: string
) => {
  const base64Secret = btoa(secret);
  const webhook = new Webhook(base64Secret);
  webhook.verify(body, headers);
};

export const paymentWebhook = httpAction(async (ctx, request) => {
  try {
    const rawBody = await request.text();
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => { headers[key] = value; });

    if (!process.env.POLAR_WEBHOOK_SECRET) {
      throw new Error("POLAR_WEBHOOK_SECRET environment variable is not configured");
    }
    validateEvent(rawBody, headers, process.env.POLAR_WEBHOOK_SECRET);

    const body = JSON.parse(rawBody);
    await ctx.runMutation(api.subscriptions.handleWebhookEvent, { body });

    return new Response(JSON.stringify({ message: "Webhook received!" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      return new Response(JSON.stringify({ message: "Webhook verification failed" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ message: "Webhook failed" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
});

export const createCustomerPortalUrl = action({
  handler: async (ctx, args: { customerId: string }) => {
    const polar = new Polar({
      server: (process.env.POLAR_SERVER as "sandbox" | "production") ?? "sandbox",
      accessToken: process.env.POLAR_ACCESS_TOKEN,
    });

    try {
      const result = await polar.customerSessions.create({
        customerId: args.customerId,
      });
      return { url: result.customerPortalUrl };
    } catch (error) {
      console.error("Error creating customer session:", error);
      throw new Error("Failed to create customer session");
    }
  },
});
