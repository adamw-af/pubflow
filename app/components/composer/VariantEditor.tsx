"use client";
import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Textarea } from "~/components/ui/textarea";
import { Button, buttonVariants } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { CharacterCounter } from "./CharacterCounter";
import { getPlatformMetadata, type PlatformId } from "../../../convex/platforms/metadata";
import type { CapabilityError } from "../../../convex/platforms/capabilityValidation";
import { MediaPicker } from "~/components/media/MediaPicker";
import { cn } from "~/lib/utils";
import { Sparkles, Hash, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface HashtagSet {
  _id: Id<"hashtagSets">;
  name: string;
  hashtags: string[];
}

interface VariantEditorProps {
  platform: PlatformId;
  accountUsername: string;
  caption: string;
  mediaItemIds: Id<"mediaItems">[];
  hashtagSets: HashtagSet[];
  /** Per-Platform Capability errors for this variant, surfaced inline. */
  errors?: CapabilityError[];
  onChange: (caption: string) => void;
  onMediaChange: (ids: Id<"mediaItems">[]) => void;
}

export function VariantEditor({
  platform,
  accountUsername,
  caption,
  mediaItemIds,
  hashtagSets,
  errors = [],
  onChange,
  onMediaChange,
}: VariantEditorProps) {
  const [aiPrompt, setAiPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [showAiInput, setShowAiInput] = useState(false);
  const generateCaption = useAction(api.ai.generateCaption);

  const isOverLimit = errors.some((e) => e.code === "caption_too_long");

  async function handleGenerate(mode: "write" | "adapt") {
    if (mode === "write" && !aiPrompt.trim()) {
      toast.error("Enter a topic or brief for the caption");
      return;
    }
    setIsGenerating(true);
    try {
      const result = await generateCaption({
        platform,
        prompt: aiPrompt || "Write an engaging caption",
        existingCaption: mode === "adapt" ? caption : undefined,
      });
      onChange(result);
      setShowAiInput(false);
      setAiPrompt("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI generation failed");
    } finally {
      setIsGenerating(false);
    }
  }

  function insertHashtagSet(set: HashtagSet) {
    const hashtags = set.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ");
    const separator = caption && !caption.endsWith("\n") ? "\n\n" : "";
    onChange(caption + separator + hashtags);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="text-sm text-muted-foreground">
        @{accountUsername} · {platform}
      </div>

      <div className="relative">
        <Textarea
          placeholder={`Write your ${platform} caption…`}
          value={caption}
          onChange={(e) => onChange(e.target.value)}
          rows={6}
          className={isOverLimit ? "border-destructive focus-visible:ring-destructive" : ""}
        />
        {isOverLimit && (
          <div className="absolute top-2 right-2 text-destructive">
            <AlertTriangle className="size-4" />
          </div>
        )}
      </div>

      {errors.length > 0 && (
        <ul className="flex flex-col gap-1">
          {errors.map((e) => (
            <li
              key={e.code}
              className="flex items-start gap-1.5 text-sm text-destructive"
            >
              <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
              <span>{e.message}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {/* AI assist */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowAiInput((v) => !v)}
            disabled={isGenerating}
          >
            <Sparkles className="size-3.5 mr-1.5" />
            AI assist
          </Button>

          {/* Hashtag sets */}
          {hashtagSets.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger className={cn(buttonVariants({ size: "sm", variant: "outline" }))}>
                <Hash className="size-3.5 mr-1.5" />
                Hashtags
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {hashtagSets.map((set) => (
                  <DropdownMenuItem
                    key={set._id}
                    onSelect={() => insertHashtagSet(set)}
                  >
                    {set.name}
                    <span className="ml-2 text-muted-foreground text-xs">
                      {set.hashtags.length} tags
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <CharacterCounter platform={platform} count={caption.length} />
      </div>

      <MediaPicker
        selectedIds={mediaItemIds}
        onChange={onMediaChange}
        maxItems={getPlatformMetadata(platform).capability.maxMediaCount}
      />

      {showAiInput && (
        <div className="rounded-lg border bg-muted/40 p-3 flex flex-col gap-2">
          <Textarea
            placeholder="Describe what you want to post about…"
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            rows={2}
            className="bg-background"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => handleGenerate("write")}
              disabled={isGenerating}
            >
              {isGenerating ? "Generating…" : "Write caption"}
            </Button>
            {caption && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleGenerate("adapt")}
                disabled={isGenerating}
              >
                Adapt existing
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowAiInput(false)}
              disabled={isGenerating}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
