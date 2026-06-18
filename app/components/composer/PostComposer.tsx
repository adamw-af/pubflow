"use client";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useNavigate, useSearchParams } from "react-router";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Switch } from "~/components/ui/switch";
import { Label } from "~/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { Calendar } from "~/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { Badge } from "~/components/ui/badge";
import { Separator } from "~/components/ui/separator";
import { VariantEditor } from "./VariantEditor";
import {
  getPlatformMetadata,
  PLATFORM_METADATA,
} from "../../../convex/platforms/metadata";
import { validateAgainstCapability } from "../../../convex/platforms/capabilityValidation";
import type { TikTokVariantOptions } from "../../../convex/platforms/types";
import { platformIcon, platformBrandColor } from "~/lib/platform-icons";
import { CalendarIcon, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

/**
 * A platform's icon in its brand-coloured chip, derived entirely from the
 * registry (icon key + `--ch-<id>` token) so every connected Platform renders
 * consistently — no per-platform maps that silently miss new platforms.
 */
function PlatformBubble({
  platform,
  className = "size-4",
}: {
  platform: string;
  className?: string;
}) {
  const iconKey = PLATFORM_METADATA[platform as keyof typeof PLATFORM_METADATA]?.icon ?? platform;
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full text-white shrink-0 ${className}`}
      style={{ background: platformBrandColor(platform) }}
    >
      {platformIcon(iconKey, "size-2.5")}
    </span>
  );
}

type VariantContent = {
  caption: string;
  mediaItemIds: Id<"mediaItems">[];
  tiktokOptions?: TikTokVariantOptions;
};

export function PostComposer() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editPostId = searchParams.get("edit") as Id<"posts"> | null;

  const accounts = (useQuery(api.socialAccounts.listForCurrentWorkspace) ?? []) as Doc<"socialAccounts">[];
  const mediaItems = (useQuery(api.media.listForCurrentWorkspace) ?? []) as (Doc<"mediaItems"> & { url: string })[];
  const hashtagSets = (useQuery(api.socialAccounts.listHashtagSetsForCurrentWorkspace) ?? []) as Doc<"hashtagSets">[];
  const workspace = useQuery(api.workspaces.getMyWorkspace);
  const existingPost = useQuery(
    api.posts.getPostWithVariants,
    editPostId ? { postId: editPostId } : "skip"
  );
  const createPost = useMutation(api.posts.createPost);
  const updatePost = useMutation(api.posts.updatePost);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [variants, setVariants] = useState<Record<string, VariantContent>>({});
  const [syncContent, setSyncContent] = useState(true);
  const [activeTab, setActiveTab] = useState<string>("");
  const [scheduleDate, setScheduleDate] = useState<Date | undefined>();
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const timezone = workspace?.timezone ?? "UTC";

  // Pre-populate for edit mode
  useEffect(() => {
    if (!editPostId || loaded || existingPost === undefined) return;
    if (!existingPost) return;

    const { post, variants: existingVariants } = existingPost;

    // Select accounts that have variants
    const accountIds = existingVariants.map((v) => v.socialAccountId as string);
    setSelectedIds(new Set(accountIds));

    // Set variant content
    const variantMap: Record<string, VariantContent> = {};
    for (const v of existingVariants) {
      variantMap[v.socialAccountId as string] = {
        caption: v.caption ?? "",
        mediaItemIds: (v.mediaItemIds ?? []) as Id<"mediaItems">[],
        tiktokOptions: v.tiktokOptions ?? undefined,
      };
    }
    setVariants(variantMap);
    setActiveTab(accountIds[0] ?? "");
    setSyncContent(false); // existing posts likely have custom content per variant

    if (post.scheduledAt) {
      const d = new Date(post.scheduledAt);
      setScheduleDate(d);
      setScheduleTime(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
    }

    setLoaded(true);
  }, [existingPost, editPostId, loaded]);

  const activeAccounts = accounts.filter(
    (a) => selectedIds.has(a._id) && a.status === "active"
  );

  // Whether each media item is a video — the one fact the Capability rules need
  // beyond what the composer already holds.
  const isVideoById = new Map(
    mediaItems.map((m) => [m._id as string, m.mimeType.startsWith("video/")])
  );

  // Per-Platform Capability errors, computed through the same canonical
  // validator the backend uses at schedule time, so the inline warning and the
  // server's decision can never disagree.
  function errorsForAccount(account: Doc<"socialAccounts">) {
    const content = variants[account._id];
    const media = (content?.mediaItemIds ?? []).map((id) => ({
      isVideo: isVideoById.get(id as string) ?? false,
    }));
    return validateAgainstCapability(
      getPlatformMetadata(account.platform).capability,
      { caption: content?.caption ?? "", media }
    );
  }

  const variantErrors: Record<string, ReturnType<typeof errorsForAccount>> =
    Object.fromEntries(activeAccounts.map((a) => [a._id, errorsForAccount(a)]));

  function toggleAccount(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        if (activeTab === id) {
          const remaining = activeAccounts.filter((a) => a._id !== id);
          setActiveTab(remaining[0]?._id ?? "");
        }
      } else {
        next.add(id);
        if (!activeTab) setActiveTab(id);
        setVariants((v) => ({
          ...v,
          [id]: v[id] ?? { caption: "", mediaItemIds: [] },
        }));
      }
      return next;
    });
  }

  function updateCaption(accountId: string, caption: string) {
    if (syncContent) {
      setVariants((prev) => {
        const next = { ...prev };
        for (const id of selectedIds) {
          next[id] = { ...(next[id] ?? { mediaItemIds: [] }), caption };
        }
        return next;
      });
    } else {
      setVariants((prev) => ({
        ...prev,
        [accountId]: { ...(prev[accountId] ?? { mediaItemIds: [] }), caption },
      }));
    }
  }

  function updateMedia(accountId: string, mediaItemIds: Id<"mediaItems">[]) {
    setVariants((prev) => ({
      ...prev,
      [accountId]: { ...(prev[accountId] ?? { caption: "" }), mediaItemIds },
    }));
  }

  function updateTikTokOptions(accountId: string, tiktokOptions: TikTokVariantOptions) {
    setVariants((prev) => ({
      ...prev,
      [accountId]: {
        ...(prev[accountId] ?? { caption: "", mediaItemIds: [] }),
        tiktokOptions,
      },
    }));
  }

  function buildScheduledAt(): number | undefined {
    if (!scheduleDate) return undefined;
    const [hh, mm] = scheduleTime.split(":").map(Number);
    const d = new Date(scheduleDate);
    d.setHours(hh, mm, 0, 0);
    return d.getTime();
  }

  function blockedPlatforms(): string[] {
    return activeAccounts
      .filter((acc) => variantErrors[acc._id]?.length > 0)
      .map((acc) => getPlatformMetadata(acc.platform).displayName);
  }

  async function handleSubmit(asDraft: boolean) {
    if (selectedIds.size === 0) { toast.error("Select at least one social account"); return; }
    if (!asDraft && !scheduleDate) { toast.error("Pick a date to schedule, or save as draft"); return; }
    const blocked = blockedPlatforms();
    if (!asDraft && blocked.length > 0) {
      toast.error(`Fix ${blocked.join(", ")} before scheduling, or drop ${blocked.length > 1 ? "them" : "it"}`);
      return;
    }

    const scheduledAt = asDraft ? undefined : buildScheduledAt();
    const variantArgs = activeAccounts.map((acc) => ({
      socialAccountId: acc._id,
      caption: variants[acc._id]?.caption || undefined,
      mediaItemIds: variants[acc._id]?.mediaItemIds ?? [],
      tiktokOptions: variants[acc._id]?.tiktokOptions,
    }));

    setIsSubmitting(true);
    try {
      if (editPostId) {
        await updatePost({ postId: editPostId, scheduledAt, variants: variantArgs });
        toast.success(asDraft ? "Draft saved" : "Post updated");
      } else {
        await createPost({ scheduledAt, variants: variantArgs });
        toast.success(asDraft ? "Draft saved" : "Post scheduled");
      }
      navigate("/dashboard/queue");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save post");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (accounts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <p className="text-muted-foreground">No social accounts connected yet.</p>
        <Button variant="outline" render={<a href="/dashboard/settings" />}>
          Connect an account
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto py-8 px-4">
      <div>
        <h1 className="text-2xl font-semibold">
          {editPostId ? "Edit post" : "New post"}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Select accounts, write your captions, then schedule.
        </p>
      </div>

      {/* Account selector */}
      <div className="flex flex-col gap-3">
        <Label className="text-sm font-medium">Post to</Label>
        <div className="flex flex-wrap gap-2">
          {accounts
            .filter((a) => a.status === "active")
            .map((account) => {
              const selected = selectedIds.has(account._id);
              return (
                <button
                  key={account._id}
                  onClick={() => toggleAccount(account._id)}
                  className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background hover:bg-muted"
                  }`}
                >
                  <PlatformBubble platform={account.platform} />
                  @{account.platformUsername}
                </button>
              );
            })}
        </div>
      </div>

      {selectedIds.size > 1 && (
        <div className="flex items-center gap-2">
          <Switch id="sync" checked={syncContent} onCheckedChange={setSyncContent} />
          <Label htmlFor="sync" className="text-sm cursor-pointer">
            Same content for all platforms
          </Label>
        </div>
      )}

      {/* Variant editors */}
      {activeAccounts.length > 0 && (
        <div className="rounded-lg border">
          {activeAccounts.length === 1 ? (
            <div className="p-4">
              <VariantEditor
                platform={activeAccounts[0].platform}
                accountUsername={activeAccounts[0].platformUsername}
                caption={variants[activeAccounts[0]._id]?.caption ?? ""}
                mediaItemIds={variants[activeAccounts[0]._id]?.mediaItemIds ?? []}
                hashtagSets={hashtagSets}
                errors={variantErrors[activeAccounts[0]._id] ?? []}
                tiktokOptions={variants[activeAccounts[0]._id]?.tiktokOptions}
                onChange={(c) => updateCaption(activeAccounts[0]._id, c)}
                onMediaChange={(ids) => updateMedia(activeAccounts[0]._id, ids)}
                onTikTokOptionsChange={(o) => updateTikTokOptions(activeAccounts[0]._id, o)}
              />
            </div>
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="w-full rounded-none rounded-t-lg border-b bg-muted/30">
                {activeAccounts.map((acc) => (
                  <TabsTrigger key={acc._id} value={acc._id} className="flex items-center gap-1.5">
                    <PlatformBubble platform={acc.platform} className="size-3.5" />
                    @{acc.platformUsername}
                    {(variantErrors[acc._id]?.length ?? 0) > 0 && (
                      <Badge variant="destructive" className="ml-1 h-4 text-[10px]">!</Badge>
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>
              {activeAccounts.map((acc) => (
                <TabsContent key={acc._id} value={acc._id} className="p-4 mt-0">
                  <VariantEditor
                    platform={acc.platform}
                    accountUsername={acc.platformUsername}
                    caption={variants[acc._id]?.caption ?? ""}
                    mediaItemIds={variants[acc._id]?.mediaItemIds ?? []}
                    hashtagSets={hashtagSets}
                    errors={variantErrors[acc._id] ?? []}
                    tiktokOptions={variants[acc._id]?.tiktokOptions}
                    onChange={(c) => updateCaption(acc._id, c)}
                    onMediaChange={(ids) => updateMedia(acc._id, ids)}
                    onTikTokOptionsChange={(o) => updateTikTokOptions(acc._id, o)}
                  />
                </TabsContent>
              ))}
            </Tabs>
          )}
        </div>
      )}

      <Separator />

      {/* Schedule picker */}
      <div className="flex flex-col gap-3">
        <Label className="text-sm font-medium">Schedule</Label>
        <div className="flex items-center gap-3 flex-wrap">
          <Popover>
            <PopoverTrigger
              render={<Button variant="outline" className="w-44 justify-start" />}
            >
              <CalendarIcon className="size-4 mr-2 opacity-50" />
              {scheduleDate ? format(scheduleDate, "d MMM yyyy") : "Pick a date"}
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={scheduleDate}
                onSelect={setScheduleDate}
                disabled={(d) => d < new Date(Date.now() - 86400000)}
              />
            </PopoverContent>
          </Popover>
          <Input
            type="time"
            value={scheduleTime}
            onChange={(e) => setScheduleTime(e.target.value)}
            className="w-auto"
          />
          {timezone !== "UTC" && (
            <span className="text-xs text-muted-foreground">{timezone}</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Button
          onClick={() => handleSubmit(false)}
          disabled={
            isSubmitting ||
            selectedIds.size === 0 ||
            !scheduleDate ||
            blockedPlatforms().length > 0
          }
        >
          {isSubmitting ? <Loader2 className="size-4 mr-2 animate-spin" /> : null}
          {editPostId ? "Update post" : "Schedule post"}
        </Button>
        <Button
          variant="outline"
          onClick={() => handleSubmit(true)}
          disabled={isSubmitting || selectedIds.size === 0}
        >
          Save as draft
        </Button>
        <Button variant="ghost" onClick={() => navigate(-1)} disabled={isSubmitting}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
