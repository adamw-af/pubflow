"use client";
import { useState } from "react";
import { useAction } from "convex/react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { PlatformMetadata } from "../../../convex/platforms/metadata";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { platformIcon } from "~/lib/platform-icons";

/**
 * Connect button + dialog for credential-auth platforms (e.g. Bluesky). Renders
 * the form from the Platform's declarative `credentialFields` and submits them
 * to `connectWithCredentials`. OAuth platforms use the redirect flow instead.
 */
export function CredentialConnectDialog({
  platform,
  isConnected,
  disabled,
  onConnected,
  trigger,
}: {
  platform: PlatformMetadata;
  isConnected: boolean;
  disabled?: boolean;
  onConnected?: () => void;
  /** Custom trigger element (rendered in place of the default Button). */
  trigger?: React.ReactElement;
}) {
  const connect = useAction(api.oauth.connectWithCredentials);
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const fields = platform.credentialFields ?? [];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await connect({ platform: platform.id, credentials: values });
      toast.success(`${platform.displayName} connected successfully`);
      setOpen(false);
      setValues({});
      onConnected?.();
    } catch {
      toast.error(
        `Could not connect ${platform.displayName}. Check your details and try again.`
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          trigger ?? (
            <Button variant={isConnected ? "outline" : "default"} size="sm" disabled={disabled}>
              <span className="mr-2">{platformIcon(platform.icon)}</span>
              {isConnected
                ? `Add another ${platform.displayName}`
                : `Connect ${platform.displayName}`}
            </Button>
          )
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect {platform.displayName}</DialogTitle>
          <DialogDescription>
            Enter your {platform.displayName} details. Create an app password in your{" "}
            {platform.displayName} settings — don&apos;t use your main account password.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {fields.map((field) => (
            <div key={field.name} className="flex flex-col gap-2">
              <Label htmlFor={field.name}>{field.label}</Label>
              <Input
                id={field.name}
                type={field.type}
                placeholder={field.placeholder}
                value={values[field.name] ?? ""}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [field.name]: e.target.value }))
                }
                required
                autoComplete="off"
              />
            </div>
          ))}
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="size-4 mr-2 animate-spin" />}
              Connect {platform.displayName}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
