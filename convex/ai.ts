import { v } from "convex/values";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";

const DAILY_LIMIT = 50;

const PLATFORM_GUIDELINES: Record<string, string> = {
  linkedin: "Professional, thought-leadership tone. Up to 3000 chars. Paragraphs work well. 2-3 relevant hashtags max.",
  instagram: "Engaging, conversational, can use emojis. Up to 2200 chars. Relevant hashtags encouraged (5-15).",
  x: "Concise and punchy. Hard limit: 280 chars total. 1-2 hashtags max. Every word must earn its place.",
};

export const generateCaption = action({
  args: {
    platform: v.union(v.literal("linkedin"), v.literal("instagram"), v.literal("x")),
    prompt: v.string(),
    existingCaption: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.runQuery(internal.ai.getUserWithWorkspace, {
      tokenIdentifier: identity.subject,
    });
    if (!user?.workspaceId) throw new Error("Workspace not found");

    const since = Date.now() - 24 * 60 * 60 * 1000;
    const usageCount = await ctx.runQuery(internal.ai.getUsageCount, {
      workspaceId: user.workspaceId,
      since,
    });
    if (usageCount >= DAILY_LIMIT) {
      throw new Error(`Daily AI limit reached (${DAILY_LIMIT}/day). Resets in 24 hours.`);
    }

    const guidelines = PLATFORM_GUIDELINES[args.platform];
    const system = `You are a social media copywriter specialising in ${args.platform}. Guidelines: ${guidelines}. Return ONLY the caption text — no commentary, no quotes around it.`;

    const prompt = args.existingCaption
      ? `Adapt this caption for ${args.platform}:\n\n${args.existingCaption}\n\nAdditional instructions: ${args.prompt}`
      : args.prompt;

    const { text } = await generateText({
      model: openai("gpt-4o-mini"),
      system,
      prompt,
      maxOutputTokens: 600,
    });

    await ctx.runMutation(internal.ai.recordUsage, {
      workspaceId: user.workspaceId,
      userTokenIdentifier: identity.subject,
    });

    return text.trim();
  },
});

export const getUserWithWorkspace = internalQuery({
  args: { tokenIdentifier: v.string() },
  handler: async (ctx, { tokenIdentifier }) => {
    return ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", tokenIdentifier))
      .unique();
  },
});

export const getUsageCount = internalQuery({
  args: { workspaceId: v.id("workspaces"), since: v.number() },
  handler: async (ctx, { workspaceId, since }) => {
    const records = await ctx.db
      .query("aiUsage")
      .withIndex("by_workspace_created", (q) =>
        q.eq("workspaceId", workspaceId).gte("createdAt", since)
      )
      .collect();
    return records.length;
  },
});

export const recordUsage = internalMutation({
  args: { workspaceId: v.id("workspaces"), userTokenIdentifier: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.insert("aiUsage", {
      workspaceId: args.workspaceId,
      userTokenIdentifier: args.userTokenIdentifier,
      type: "caption_generation",
      createdAt: Date.now(),
    });
  },
});
