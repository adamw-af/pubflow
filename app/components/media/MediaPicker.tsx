"use client";
import { useRef, useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Checkbox } from "~/components/ui/checkbox";
import { ImagePlus, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

interface MediaPickerProps {
  selectedIds: Id<"mediaItems">[];
  onChange: (ids: Id<"mediaItems">[]) => void;
  maxItems?: number;
}

export function MediaPicker({ selectedIds, onChange, maxItems = 10 }: MediaPickerProps) {
  const [open, setOpen] = useState(false);
  const mediaItems = useQuery(api.media.listForCurrentWorkspace) ?? [];
  const getUploadUrl = useAction(api.media.getUploadUrl);
  const recordUpload = useMutation(api.media.recordUpload);
  const deleteItem = useMutation(api.media.deleteMediaItem);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const selectedItems = mediaItems.filter((m) => selectedIds.includes(m._id));

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    setUploading(true);
    try {
      for (const file of files) {
        const { uploadUrl, r2Key } = await getUploadUrl({
          filename: file.name,
          contentType: file.type,
          sizeBytes: file.size,
        });

        const uploadRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });

        if (!uploadRes.ok) throw new Error(`Upload failed for ${file.name}`);

        await recordUpload({
          r2Key,
          filename: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        });
      }
      toast.success(`${files.length} file${files.length > 1 ? "s" : ""} uploaded`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function toggleItem(id: Id<"mediaItems">) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((s) => s !== id));
    } else if (selectedIds.length < maxItems) {
      onChange([...selectedIds, id]);
    } else {
      toast.error(`Max ${maxItems} media items per post`);
    }
  }

  return (
    <>
      {/* Thumbnail strip */}
      <div className="flex flex-wrap gap-2 items-center">
        {selectedItems.map((item) => (
          <div key={item._id} className="relative size-16 rounded-md overflow-hidden border bg-muted">
            {item.mimeType.startsWith("video/") ? (
              <video src={item.url} className="size-full object-cover" muted />
            ) : (
              <img src={item.url} alt={item.filename} className="size-full object-cover" />
            )}
            <button
              onClick={() => onChange(selectedIds.filter((s) => s !== item._id))}
              className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 flex items-center justify-center transition-opacity"
            >
              <Trash2 className="size-4 text-white" />
            </button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="size-16 flex-col gap-1"
          onClick={() => setOpen(true)}
        >
          <ImagePlus className="size-5" />
          <span className="text-xs">Media</span>
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Media library</DialogTitle>
          </DialogHeader>

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {selectedIds.length}/{maxItems} selected
            </p>
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                multiple
                className="hidden"
                onChange={handleFileChange}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <Loader2 className="size-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="size-4 mr-2" />
                )}
                Upload
              </Button>
            </div>
          </div>

          <ScrollArea className="h-80">
            {mediaItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-12">
                <ImagePlus className="size-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No media yet. Upload your first file.</p>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2 p-1">
                {mediaItems.map((item) => {
                  const isSelected = selectedIds.includes(item._id);
                  return (
                    <button
                      key={item._id}
                      onClick={() => toggleItem(item._id)}
                      className={`relative aspect-square rounded-md overflow-hidden border-2 transition-colors ${
                        isSelected ? "border-primary" : "border-transparent"
                      }`}
                    >
                      {item.mimeType.startsWith("video/") ? (
                        <video src={item.url} className="size-full object-cover" muted />
                      ) : (
                        <img src={item.url} alt={item.filename} className="size-full object-cover" />
                      )}
                      {isSelected && (
                        <div className="absolute top-1 right-1 size-5 rounded-full bg-primary flex items-center justify-center">
                          <Checkbox checked className="size-3 border-0" />
                        </div>
                      )}
                      <div className="absolute bottom-0 inset-x-0 bg-black/50 px-1 py-0.5">
                        <p className="text-white text-[10px] truncate">{item.filename}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>

          <div className="flex justify-end">
            <Button onClick={() => setOpen(false)}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
