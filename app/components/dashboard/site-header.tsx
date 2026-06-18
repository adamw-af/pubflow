import { useQuery } from "convex/react";
import { Clock } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Separator } from "~/components/ui/separator";
import { SidebarTrigger } from "~/components/ui/sidebar";

/** Trial countdown shown in the dashboard chrome while a Workspace is on Trial. */
function TrialBadge() {
  const access = useQuery(api.subscriptions.getWorkspaceAccess, {});
  if (access?.state !== "trial" || access.trialDaysRemaining === undefined) {
    return null;
  }

  const days = access.trialDaysRemaining;
  const label = days <= 0 ? "Trial ends today" : `${days} day${days === 1 ? "" : "s"} left in trial`;

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 gap-2 px-2"
      render={<a href="/pricing" />}
    >
      <Clock className="size-4 text-muted-foreground" />
      <Badge variant={days <= 2 ? "destructive" : "secondary"} className="font-medium">
        {label}
      </Badge>
    </Button>
  );
}

export function SiteHeader() {
  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        <div className="ml-auto flex items-center gap-2">
          <TrialBadge />
          <Button
            variant="ghost"
            size="sm"
            className="hidden sm:flex dark:text-foreground"
            render={
              <a
                href="https://github.com/michaelshimeles/react-starter-kit"
                rel="noopener noreferrer"
                target="_blank"
              />
            }
          >
            GitHub
          </Button>
        </div>
      </div>
    </header>
  );
}
