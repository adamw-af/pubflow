import { v } from "convex/values";
import { action, mutation, query } from "./_generated/server";
import { getPresignedUploadUrl } from "./lib/r2";

async function getAuthorizedWorkspaceId(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");
  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q: any) => q.eq("tokenIdentifier", identity.subject))
    .unique();
  if (!user?.workspaceId) throw new Error("Workspace not found");
  return { workspaceId: user.workspaceId, tokenIdentifier: identity.subject };
}

export const getUploadUrl = action({
  args: {
    filename: v.string(),
    contentType: v.string(),
    sizeBytes: v.number(),
  },
  handler: async (ctx, { filename, contentType, sizeBytes }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    // Generate a unique R2 key
    const ext = filename.includes(".") ? filename.split(".").pop() : "";
    const key = `media/${identity.subject}/${Date.now()}-${Math.random().toString(36).slice(2)}${ext ? `.${ext}` : ""}`;

    const uploadUrl = await getPresignedUploadUrl(key, contentType);
    return { uploadUrl, r2Key: key };
  },
});

export const recordUpload = mutation({
  args: {
    r2Key: v.string(),
    filename: v.string(),
    mimeType: v.string(),
    sizeBytes: v.number(),
  },
  handler: async (ctx, args) => {
    const { workspaceId, tokenIdentifier } = await getAuthorizedWorkspaceId(ctx);
    return ctx.db.insert("mediaItems", {
      workspaceId,
      uploadedByTokenIdentifier: tokenIdentifier,
      r2Key: args.r2Key,
      filename: args.filename,
      mimeType: args.mimeType,
      sizeBytes: args.sizeBytes,
      createdAt: Date.now(),
    });
  },
});

export const listForCurrentWorkspace = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.subject))
      .unique();
    if (!user?.workspaceId) return [];

    const items = await ctx.db
      .query("mediaItems")
      .withIndex("by_workspace_created", (q) =>
        q.eq("workspaceId", user.workspaceId!)
      )
      .order("desc")
      .take(200);

    const publicUrl = process.env.R2_PUBLIC_URL ?? "";
    return items.map((item) => ({
      ...item,
      url: `${publicUrl}/${item.r2Key}`,
    }));
  },
});

export const deleteMediaItem = mutation({
  args: { mediaItemId: v.id("mediaItems") },
  handler: async (ctx, { mediaItemId }) => {
    const { workspaceId } = await getAuthorizedWorkspaceId(ctx);
    const item = await ctx.db.get(mediaItemId);
    if (!item || item.workspaceId !== workspaceId) throw new Error("Not found");
    await ctx.db.delete(mediaItemId);
    // Note: R2 object deletion requires a separate API call — handled client-side or via a separate action
  },
});
