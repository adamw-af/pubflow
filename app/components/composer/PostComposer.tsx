"use client";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useNavigate, useSearchParams } from "react-router";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import { Button } from "~/components/ui/button";
import { Switch } from "~/components/ui/switch";
import { Label } from "~/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { Calendar } from "~/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { Badge } from "~/components/ui/badge";
import { Separator } from "~/components/ui/separator";
import { VariantEditor } from "./VariantEditor";
import { PLATFORM_LIMITS } from "./CharacterCounter";
import { CalendarIcon, Linkedin, Instagram, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

const PLATFORM_ICONS: Record<string, React.ReactNode> = {
  linkedin: <Linkedin className="size-3.5" />,
  instagram: <Instagram className="size-3.5" />,
  x: <span className="font-bold text-xs leading-none">𝕏</span>,
};

const PLATFORM_COLORS: Record<string, string> = {
  linkedin: "bg-blue-600",
  instagram: "bg-gradient-to-br from-purple-500 to-pink-500",
  x: "bg-black",
};

type VariantContent = {
  caption: string;
  mediaItemIds: Id<"mediaItems">[];
};

export function PostComposer() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editPostId = searchParams.get("edit") as Id<"posts"> | null;

  const accounts = (useQuery(api.socialAccounts.listForCurrentWorkspace) ?? []) as Doc<"socialAccounts">[];
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

  function buildScheduledAt(): number | undefined {
    if (!scheduleDate) return undefined;
    const [hh, mm] = scheduleTime.split(":").map(Number);
    const d = new Date(scheduleDate);
    d.setHours(hh, mm, 0, 0);
    return d.getTime();
  }

  function hasOverLimitVariant(): boolean {
    return activeAccounts.some((acc) => {
      const caption = variants[acc._id]?.caption ?? "";
      const limit = PLATFORM_LIMITS[acc.platform] ?? Infinity;
      return caption.length > limit;
    });
  }

  async function handleSubmit(asDraft: boolean) {
    if (selectedIds.size === 0) { toast.error("Select at least one social account"); return; }
    if (!asDraft && !scheduleDate) { toast.error("Pick a date to schedule, or save as draft"); return; }
    if (hasOverLimitVariant()) { toast.error("One or more captions exceed the platform character limit"); return; }

    const scheduledAt = asDraft ? undefined : buildScheduledAt();
    const variantArgs = activeAccounts.map((acc) => ({
      socialAccountId: acc._id,
      caption: variants[acc._id]?.caption || undefined,
      mediaItemIds: variants[acc._id]?.mediaItemIds ?? [],
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
                  <span className={`size-4 rounded-full flex items-center justify-center text-white ${PLATFORM_COLORS[account.platform]}`}>
                    {PLATFORM_ICONS[account.platform]}
                  </span>
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
                onChange={(c) => updateCaption(activeAccounts[0]._id, c)}
                onMediaChange={(ids) => updateMedia(activeAccounts[0]._id, ids)}
              />
            </div>
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="w-full rounded-none rounded-t-lg border-b bg-muted/30">
                {activeAccounts.map((acc) => (
                  <TabsTrigger key={acc._id} value={acc._id} className="flex items-center gap-1.5">
                    {PLATFORM_ICONS[acc.platform]}
                    @{acc.platformUsername}
                    {(variants[acc._id]?.caption?.length ?? 0) > (PLATFORM_LIMITS[acc.platform] ?? Infinity) && (
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
                    onChange={(c) => updateCaption(acc._id, c)}
                    onMediaChange={(ids) => updateMedia(acc._id, ids)}
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
          <input
            type="time"
            value={scheduleTime}
            onChange={(e) => setScheduleTime(e.target.value)}
            className="rounded-md border px-3 py-2 text-sm bg-background"
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
          disabled={isSubmitting || selectedIds.size === 0 || !scheduleDate}
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
