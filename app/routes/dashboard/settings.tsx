"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import SubscriptionStatus from "~/components/subscription-status";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Switch } from "~/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Separator } from "~/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Loader2, Trash2, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import {
  platformMetadata,
  PLATFORM_METADATA,
  type PlatformId,
} from "../../../convex/platforms/metadata";
import { platformIcon } from "~/lib/platform-icons";
import { CredentialConnectDialog } from "~/components/connect/CredentialConnectDialog";

// Common IANA timezones grouped for readability
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

/** Display name for a platform id from the registry, tolerant of unknown ids. */
function platformLabel(id: string): string {
  return PLATFORM_METADATA[id as PlatformId]?.displayName ?? id;
}

export default function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const workspace = useQuery(api.workspaces.getMyWorkspace);
  const accounts = useQuery(api.socialAccounts.listForCurrentWorkspace) ?? [];
  const updateWorkspace = useMutation(api.workspaces.updateWorkspace);
  const disconnectAccount = useMutation(api.socialAccounts.disconnectSocialAccount);
  const beginOAuth = useAction(api.oauth.beginOAuthFlow);

  const [workspaceName, setWorkspaceName] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [emailOnFailure, setEmailOnFailure] = useState(true);
  const [savingWorkspace, setSavingWorkspace] = useState(false);
  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(null);

  // Sync form state when workspace loads
  useEffect(() => {
    if (workspace) {
      setWorkspaceName(workspace.name);
      setTimezone(workspace.timezone);
      setEmailOnFailure(workspace.emailNotifications?.publicationFailed ?? true);
    }
  }, [workspace]);

  // Handle OAuth redirect feedback
  useEffect(() => {
    const connected = searchParams.get("connected");
    const oauthError = searchParams.get("oauth_error");

    if (connected) {
      toast.success(`${platformLabel(connected)} connected successfully`);
      setSearchParams({}, { replace: true });
    }
    if (oauthError) {
      const messages: Record<string, string> = {
        missing_code: "Authorization was cancelled or failed.",
        invalid_state: "Invalid session. Please try again.",
        state_expired: "Connection timed out. Please try again.",
        token_exchange_failed: "Could not retrieve access token. Please try again.",
      };
      toast.error(messages[oauthError] ?? "Connection failed. Please try again.");
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  async function handleSaveWorkspace() {
    setSavingWorkspace(true);
    try {
      await updateWorkspace({
        name: workspaceName.trim() || undefined,
        timezone,
        emailNotifications: { publicationFailed: emailOnFailure },
      });
      toast.success("Settings saved");
    } catch (err) {
      toast.error("Failed to save settings");
    } finally {
      setSavingWorkspace(false);
    }
  }

  async function handleConnect(platform: PlatformId) {
    setConnectingPlatform(platform);
    try {
      const url = await beginOAuth({ platform });
      window.location.href = url;
    } catch (err) {
      toast.error("Failed to start connection. Please try again.");
      setConnectingPlatform(null);
    }
  }

  async function handleDisconnect(id: Id<"socialAccounts">, username: string) {
    try {
      await disconnectAccount({ socialAccountId: id });
      toast.success(`@${username} disconnected`);
    } catch (err) {
      toast.error("Failed to disconnect account");
    }
  }

  const connectedPlatforms = new Set(
    accounts.filter((a) => a.status === "active").map((a) => a.platform)
  );

  return (
    <div className="flex flex-col gap-6 py-6 px-4 lg:px-6 max-w-2xl">
      <h1 className="text-2xl font-semibold">Settings</h1>

      {/* Social Accounts */}
      <Card>
        <CardHeader>
          <CardTitle>Social accounts</CardTitle>
          <CardDescription>
            Connect the accounts you want to publish to.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* Connected accounts */}
          {accounts.length > 0 && (
            <div className="flex flex-col gap-2">
              {accounts.map((account) => (
                <div
                  key={account._id}
                  className="flex items-center justify-between rounded-lg border px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground">
                      {platformIcon(PLATFORM_METADATA[account.platform]?.icon ?? account.platform)}
                    </span>
                    <div>
                      <p className="text-sm font-medium">@{account.platformUsername}</p>
                      <p className="text-xs text-muted-foreground">
                        {platformLabel(account.platform)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {account.status === "active" ? (
                      <CheckCircle className="size-4 text-green-500" />
                    ) : (
                      <Badge variant="destructive" className="text-xs">
                        {account.status}
                      </Badge>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDisconnect(account._id, account.platformUsername)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Connect buttons */}
          <div className="flex flex-wrap gap-2">
            {platformMetadata.map((platform) => {
              const { id, displayName, icon } = platform;
              const isConnected = connectedPlatforms.has(id);
              const isConnecting = connectingPlatform === id;

              if (platform.authKind === "credentials") {
                return (
                  <CredentialConnectDialog
                    key={id}
                    platform={platform}
                    isConnected={isConnected}
                    disabled={!!connectingPlatform}
                  />
                );
              }

              return (
                <Button
                  key={id}
                  variant={isConnected ? "outline" : "default"}
                  size="sm"
                  disabled={isConnecting || !!connectingPlatform}
                  onClick={() => handleConnect(id)}
                >
                  {isConnecting ? (
                    <Loader2 className="size-4 mr-2 animate-spin" />
                  ) : (
                    <span className="mr-2">{platformIcon(icon)}</span>
                  )}
                  {isConnected
                    ? `Add another ${displayName}`
                    : `Connect ${displayName}`}
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Workspace */}
      <Card>
        <CardHeader>
          <CardTitle>Workspace</CardTitle>
          <CardDescription>
            Name and timezone used for all scheduled posts.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="workspace-name">Workspace name</Label>
            <Input
              id="workspace-name"
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              placeholder="My Workspace"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="timezone">Timezone</Label>
            <Select value={timezone} onValueChange={(v) => v && setTimezone(v)}>
              <SelectTrigger id="timezone">
                <SelectValue placeholder="Select timezone" />
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
              All scheduled times are interpreted in this timezone.
            </p>
          </div>

          <Separator />

          {/* Notifications */}
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="notify-failure" className="cursor-pointer">
                Email on publish failure
              </Label>
              <p className="text-xs text-muted-foreground">
                Get notified by email when a post fails to publish.
              </p>
            </div>
            <Switch
              id="notify-failure"
              checked={emailOnFailure}
              onCheckedChange={setEmailOnFailure}
            />
          </div>

          <Button
            onClick={handleSaveWorkspace}
            disabled={savingWorkspace}
            className="self-start"
          >
            {savingWorkspace ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" />
                Saving…
              </>
            ) : (
              "Save changes"
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Billing */}
      <SubscriptionStatus />
    </div>
  );
}
