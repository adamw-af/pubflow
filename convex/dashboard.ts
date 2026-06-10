import { query } from "./_generated/server";

export const getMetrics = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.subject))
      .unique();
    if (!user?.workspaceId) return null;

    const workspaceId = user.workspaceId;

    // This month window
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    const [allPosts, accounts, publications] = await Promise.all([
      ctx.db
        .query("posts")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
        .collect(),
      ctx.db
        .query("socialAccounts")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
        .collect(),
      ctx.db
        .query("publications")
        .collect(), // we'll filter in JS
    ]);

    const thisMonthPosts = allPosts.filter((p) => p.createdAt >= monthStart);

    const scheduled = thisMonthPosts.filter((p) => p.status === "scheduled").length;
    const published = thisMonthPosts.filter((p) => p.status === "published").length;
    const failed = thisMonthPosts.filter((p) => p.status === "failed").length;
    const partial = thisMonthPosts.filter((p) => p.status === "partial").length;
    const drafts = thisMonthPosts.filter((p) => p.status === "draft").length;

    const connectedAccounts = accounts.filter((a) => a.status === "active").length;
    const expiredAccounts = accounts.filter((a) => a.status === "expired").length;

    // Publication success rate (all time)
    const settledPubs = publications.filter(
      (p) => p.status === "published" || p.status === "failed"
    );
    const successRate =
      settledPubs.length > 0
        ? Math.round(
            (settledPubs.filter((p) => p.status === "published").length /
              settledPubs.length) *
              100
          )
        : 100;

    // Posts by day for the last 30 days (for chart)
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recentPosts = allPosts.filter((p) => p.createdAt >= thirtyDaysAgo);

    const byDay: Record<string, { scheduled: number; published: number }> = {};
    for (const post of recentPosts) {
      const day = new Date(post.createdAt).toISOString().slice(0, 10);
      if (!byDay[day]) byDay[day] = { scheduled: 0, published: 0 };
      if (post.status === "scheduled" || post.status === "draft") byDay[day].scheduled++;
      if (post.status === "published" || post.status === "partial") byDay[day].published++;
    }

    const chartData = Object.entries(byDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, counts]) => ({ date, ...counts }));

    return {
      thisMonth: { scheduled, published, failed, partial, drafts, total: thisMonthPosts.length },
      accounts: { connected: connectedAccounts, expired: expiredAccounts },
      successRate,
      chartData,
    };
  },
});
