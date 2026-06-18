"use client";
import { useQuery } from "convex/react";
import { Link } from "react-router";
import { api } from "../../../convex/_generated/api";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { format } from "date-fns";
import { PenSquare } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  draft: "secondary",
  scheduled: "default",
  publishing: "secondary",
  published: "default",
  failed: "destructive",
  partial: "secondary",
} as const;

// Friendlier label for the async video in-progress state (ADR 0007).
const STATUS_LABELS: Record<string, string> = {
  publishing: "in progress",
};

export default function QueuePage() {
  const posts = useQuery(api.posts.listPostsForCurrentWorkspace, {}) ?? [];

  if (posts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <p className="text-muted-foreground">No posts yet.</p>
        <Button render={<Link to="/dashboard/compose" />}>
          <PenSquare className="size-4 mr-2" />
          Create your first post
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 py-6 px-4 lg:px-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Queue</h1>
        <Button size="sm" render={<Link to="/dashboard/compose" />}>
          <PenSquare className="size-4 mr-2" />
          New post
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        {posts.map((post) => (
          <div
            key={post._id}
            className="flex items-center justify-between rounded-lg border px-4 py-3 bg-card"
          >
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Badge variant={STATUS_COLORS[post.status] as any}>
                  {STATUS_LABELS[post.status] ?? post.status}
                </Badge>
                {post.scheduledAt && (
                  <span className="text-sm text-muted-foreground">
                    {format(new Date(post.scheduledAt), "d MMM yyyy 'at' HH:mm")}
                  </span>
                )}
              </div>
              {!post.scheduledAt && post.status === "draft" && (
                <span className="text-xs text-muted-foreground">Draft — not scheduled</span>
              )}
            </div>
            <Button
              size="sm"
              variant="ghost"
              render={<Link to={`/dashboard/compose?edit=${post._id}`} />}
            >
              Edit
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
