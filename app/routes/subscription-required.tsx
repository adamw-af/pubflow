"use client";
import { useQuery } from "convex/react";
import { ArrowRight, CreditCard, Lock } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";

// Paywall copy is driven by *why* access is gated, from getWorkspaceAccess.reason.
const COPY = {
  trial_expired: {
    title: "Your trial has ended",
    description:
      "Your free 7-day trial is over. Subscribe to keep scheduling and publishing your posts.",
    detailTitle: "Pick up where you left off",
    detail:
      "Your connected accounts and scheduled posts are saved. Choose a plan to unlock the dashboard again.",
  },
  account_limit: {
    title: "Subscribe to add another account",
    description:
      "Your trial includes one connected social account. Subscribe to connect more and publish everywhere at once.",
    detailTitle: "More accounts, more reach",
    detail:
      "Paid plans raise your connected-account limit — base includes 25, with more on higher tiers.",
  },
  default: {
    title: "Subscription Required",
    description: "You need an active subscription to access the dashboard.",
    detailTitle: "Choose Your Plan",
    detail:
      "Select a subscription plan to unlock full access to your dashboard, analytics, and all premium features.",
  },
} as const;

export default function SubscriptionRequired() {
  const access = useQuery(api.subscriptions.getWorkspaceAccess, {});
  const reason = access?.reason;
  const copy =
    reason === "trial_expired"
      ? COPY.trial_expired
      : reason === "account_limit"
        ? COPY.account_limit
        : COPY.default;

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="max-w-lg w-full text-center">
        <CardHeader className="pb-6">
          <div className="mx-auto mb-4">
            <Lock className="h-16 w-16 text-orange-500" />
          </div>
          <CardTitle className="text-2xl font-bold">{copy.title}</CardTitle>
          <CardDescription className="text-lg">{copy.description}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="bg-muted rounded-lg p-6">
            <div className="flex items-center justify-center gap-2 mb-3">
              <CreditCard className="h-5 w-5 text-muted-foreground" />
              <span className="font-medium">{copy.detailTitle}</span>
            </div>
            <p className="text-sm text-muted-foreground">{copy.detail}</p>
          </div>

          <div className="space-y-3">
            <Button className="w-full" size="lg" render={<a href="/pricing" />}>
              View Pricing Plans
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>

            <Button variant="outline" className="w-full" render={<a href="/" />}>
              Back to Home
            </Button>
          </div>

          <div className="pt-4 border-t">
            <p className="text-xs text-muted-foreground">
              Already subscribed? It may take a few moments for your
              subscription to activate. Try refreshing the page.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
