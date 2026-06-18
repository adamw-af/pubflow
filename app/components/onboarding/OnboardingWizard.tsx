"use client";
import { useEffect, useState } from "react";
import { useMutation, useAction, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Loader2, CheckCircle, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { platformMetadata, type PlatformId } from "../../../convex/platforms/metadata";
import { platformIcon } from "~/lib/platform-icons";

const TIMEZONES = [
  { value: "UTC", label: "UTC" },
  { value: "Europe/London", label: "London (GMT/BST)" },
  { value: "Europe/Paris", label: "Paris (CET/CEST)" },
  { value: "Europe/Berlin", label: "Berlin (CET/CEST)" },
  { value: "Europe/Amsterdam", label: "Amsterdam (CET/CEST)" },
  { value: "Europe/Dublin", label: "Dublin (GMT/IST)" },
  { value: "America/New_York", label: "New York (ET)" },
  { value: "America/Chicago", label: "Chicago (CT)" },
  { value: "America/Denver", label: "Denver (MT)" },
  { value: "America/Los_Angeles", label: "Los Angeles (PT)" },
  { value: "America/Toronto", label: "Toronto (ET)" },
  { value: "America/Vancouver", label: "Vancouver (PT)" },
  { value: "America/Sao_Paulo", label: "São Paulo (BRT)" },
  { value: "Asia/Dubai", label: "Dubai (GST)" },
  { value: "Asia/Kolkata", label: "India (IST)" },
  { value: "Asia/Singapore", label: "Singapore (SGT)" },
  { value: "Asia/Tokyo", label: "Tokyo (JST)" },
  { value: "Asia/Seoul", label: "Seoul (KST)" },
  { value: "Asia/Shanghai", label: "Shanghai (CST)" },
  { value: "Australia/Sydney", label: "Sydney (AEST/AEDT)" },
  { value: "Australia/Melbourne", label: "Melbourne (AEST/AEDT)" },
  { value: "Pacific/Auckland", label: "Auckland (NZST/NZDT)" },
];

const STEPS = ["Workspace", "Connect", "Ready"];

export function OnboardingWizard() {
  const workspace = useQuery(api.workspaces.getMyWorkspace);
  const accounts = useQuery(api.socialAccounts.listForCurrentWorkspace) ?? [];
  const updateWorkspace = useMutation(api.workspaces.updateWorkspace);
  const completeOnboarding = useMutation(api.workspaces.completeOnboarding);
  const beginOAuth = useAction(api.oauth.beginOAuthFlow);

  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [saving, setSaving] = useState(false);
  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(null);

  // Pre-fill from workspace + browser timezone, and advance step if workspace already saved
  useEffect(() => {
    if (workspace) {
      setName(workspace.name);
      setTimezone(workspace.timezone !== "UTC"
        ? workspace.timezone
        : Intl.DateTimeFormat().resolvedOptions().timeZone
      );
      // If workspace name is already set, skip past step 0
      if (workspace.name && step === 0) {
        setStep(1);
      }
    }
  }, [workspace]);

  const hasConnectedAccount = accounts.some((a) => a.status === "active");

  async function handleSaveWorkspace() {
    if (!name.trim()) {
      toast.error("Please enter a workspace name");
      return;
    }
    setSaving(true);
    try {
      await updateWorkspace({ name: name.trim(), timezone });
      setStep(1);
    } catch {
      toast.error("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleConnect(platform: PlatformId) {
    setConnectingPlatform(platform);
    try {
      const url = await beginOAuth({ platform });
      window.location.href = url;
    } catch {
      toast.error("Failed to start connection. Please try again.");
      setConnectingPlatform(null);
    }
  }

  async function handleComplete() {
    setSaving(true);
    try {
      await completeOnboarding();
    } catch {
      // Non-fatal — dismiss anyway
    } finally {
      setSaving(false);
    }
  }

  if (workspace === undefined) return (
    <div className="fixed inset-0 z-50 bg-background flex items-center justify-center">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md flex flex-col gap-8">
        {/* Logo / brand */}
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">PubFlow</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Let's get you set up in a minute.
          </p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-0">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center flex-1 last:flex-none">
              <div className="flex items-center gap-2">
                <div
                  className={`size-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                    i < step
                      ? "bg-primary text-primary-foreground"
                      : i === step
                        ? "border-2 border-primary text-primary"
                        : "border-2 border-muted text-muted-foreground"
                  }`}
                >
                  {i < step ? <CheckCircle className="size-4" /> : i + 1}
                </div>
                <span
                  className={`text-sm ${i === step ? "font-medium" : "text-muted-foreground"}`}
                >
                  {label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 mx-3 h-px ${i < step ? "bg-primary" : "bg-muted"}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="flex flex-col gap-6">
          {step === 0 && (
            <>
              <div>
                <h2 className="text-xl font-semibold">Set up your workspace</h2>
                <p className="text-muted-foreground text-sm mt-1">
                  Give it a name and confirm your timezone — this is used for all scheduled posts.
                </p>
              </div>

              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="ws-name">Workspace name</Label>
                  <Input
                    id="ws-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="My Workspace"
                    onKeyDown={(e) => e.key === "Enter" && handleSaveWorkspace()}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="ws-tz">Your timezone</Label>
                  <Select value={timezone} onValueChange={(v) => v && setTimezone(v)}>
                    <SelectTrigger id="ws-tz">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMEZONES.map((tz) => (
                        <SelectItem key={tz.value} value={tz.value}>
                          {tz.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Detected from your browser. Change if incorrect.
                  </p>
                </div>
              </div>

              <Button onClick={handleSaveWorkspace} disabled={saving}>
                {saving ? <Loader2 className="size-4 mr-2 animate-spin" /> : null}
                Continue
                <ArrowRight className="size-4 ml-2" />
              </Button>
            </>
          )}

          {step === 1 && (
            <>
              <div>
                <h2 className="text-xl font-semibold">Connect a social account</h2>
                <p className="text-muted-foreground text-sm mt-1">
                  Connect at least one account to start scheduling posts.
                </p>
              </div>

              <div className="flex flex-col gap-3">
                {platformMetadata.map((platform) => {
                  const connected = accounts.some(
                    (a) => a.platform === platform.id && a.status === "active"
                  );
                  const isConnecting = connectingPlatform === platform.id;

                  return (
                    <button
                      key={platform.id}
                      disabled={isConnecting || !!connectingPlatform}
                      onClick={() => !connected && handleConnect(platform.id)}
                      className={`flex items-center gap-4 rounded-lg border px-4 py-3 text-left transition-colors ${
                        connected
                          ? "border-primary bg-primary/5 cursor-default"
                          : "hover:bg-muted cursor-pointer"
                      } disabled:opacity-50`}
                    >
                      <span className="size-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                        {isConnecting ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          platformIcon(platform.icon, "size-5")
                        )}
                      </span>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{platform.displayName}</p>
                        <p className="text-xs text-muted-foreground">
                          {platform.description}
                        </p>
                      </div>
                      {connected ? (
                        <CheckCircle className="size-5 text-primary shrink-0" />
                      ) : (
                        <ArrowRight className="size-4 text-muted-foreground shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={() => setStep(2)}
                  disabled={!hasConnectedAccount}
                >
                  Continue
                  <ArrowRight className="size-4 ml-2" />
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setStep(2)}
                >
                  Skip for now
                </Button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="text-center flex flex-col items-center gap-3">
                <div className="size-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <CheckCircle className="size-8 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold">You're all set!</h2>
                  <p className="text-muted-foreground text-sm mt-1">
                    {hasConnectedAccount
                      ? "Your workspace is ready. Start scheduling your first post."
                      : "Your workspace is ready. Connect a social account in Settings when you're ready."}
                  </p>
                </div>
              </div>

              <Button onClick={handleComplete} disabled={saving}>
                {saving ? <Loader2 className="size-4 mr-2 animate-spin" /> : null}
                {hasConnectedAccount ? "Start scheduling" : "Go to dashboard"}
                <ArrowRight className="size-4 ml-2" />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
