import { getAuth } from "@clerk/react-router/server";
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
  const workspace = useQuery(api.workspaces.getMyWorkspace);
  const subscriptionStatus = useQuery(api.subscriptions.checkUserSubscriptionStatus, {});

  const needsOnboarding =
    workspace !== undefined && !workspace?.onboardingCompletedAt;

  // Client-side subscription guard — Convex enforces auth at the data layer
  if (subscriptionStatus !== undefined && !subscriptionStatus?.hasActiveSubscription) {
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
