import { getAuth } from "@clerk/react-router/server";
import { useAuth } from "@clerk/react-router";
import { redirect, useLoaderData } from "react-router";
import { AppSidebar } from "~/components/dashboard/app-sidebar";
import { SiteHeader } from "~/components/dashboard/site-header";
import { SidebarInset, SidebarProvider } from "~/components/ui/sidebar";
import { api } from "../../../convex/_generated/api";
import type { Route } from "./+types/layout";
import { createClerkClient } from "@clerk/react-router/api.server";
import { Outlet } from "react-router";
import { useQuery } from "convex/react";
import { OnboardingWizard } from "~/components/onboarding/OnboardingWizard";

export async function loader(args: Route.LoaderArgs) {
  const { userId } = await getAuth(args);

  if (!userId) {
    throw redirect("/sign-in");
  }

  const user = await createClerkClient({
    secretKey: process.env.CLERK_SECRET_KEY,
  }).users.getUser(userId);

  return { user };
}

export default function DashboardLayout() {
  const { user } = useLoaderData();
  const { isSignedIn } = useAuth();

  // Hooks must run unconditionally and in a stable order — keep every useQuery
  // above the early returns below.
  const workspace = useQuery(api.workspaces.getMyWorkspace);
  const access = useQuery(api.subscriptions.getWorkspaceAccess, {});

  // Auth is clearing (sign-out in progress) — render nothing to prevent flash
  if (isSignedIn === false) return null;

  const needsOnboarding =
    isSignedIn === true && (workspace === undefined || !workspace?.onboardingCompletedAt);

  // Access gate — value-first funnel: a Workspace on Trial or with an active
  // Subscription gets the full dashboard. Only an expired Trial (no active
  // Subscription) is sent to the paywall. `access` is null while there's no
  // Workspace yet (onboarding), so brand-new users are never bounced here.
  if (isSignedIn && access?.state === "expired") {
    if (typeof window !== "undefined") {
      window.location.href = "/subscription-required";
    }
    return null;
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" user={user} />
      <SidebarInset>
        <SiteHeader />
        <Outlet />
      </SidebarInset>
      {needsOnboarding && <OnboardingWizard />}
    </SidebarProvider>
  );
}
