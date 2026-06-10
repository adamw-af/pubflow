"use client";
import { useQuery } from "convex/react";
import { Link } from "react-router";
import { api } from "../../../convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Skeleton } from "~/components/ui/skeleton";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  CalendarClock,
  CheckCircle2,
  Link2,
  PenSquare,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";
import { format } from "date-fns";

export default function DashboardPage() {
  const metrics = useQuery(api.dashboard.getMetrics);

  if (metrics === undefined) {
    return (
      <div className="flex flex-col gap-4 py-6 px-4 lg:px-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!metrics) return null;

  const { thisMonth, accounts, successRate, chartData } = metrics;

  const statCards = [
    {
      title: "Scheduled",
      value: thisMonth.scheduled,
      icon: <CalendarClock className="size-4 text-muted-foreground" />,
      sub: "this month",
    },
    {
      title: "Published",
      value: thisMonth.published,
      icon: <CheckCircle2 className="size-4 text-muted-foreground" />,
      sub: "this month",
    },
    {
      title: "Success rate",
      value: `${successRate}%`,
      icon: <TrendingUp className="size-4 text-muted-foreground" />,
      sub: "all time",
    },
    {
      title: "Connected accounts",
      value: accounts.connected,
      icon: <Link2 className="size-4 text-muted-foreground" />,
      sub: accounts.expired > 0
        ? `${accounts.expired} expired`
        : "all active",
      subVariant: accounts.expired > 0 ? "destructive" : "secondary",
    },
  ];

  return (
    <div className="flex flex-col gap-6 py-6 px-4 lg:px-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <Button size="sm" render={<Link to="/dashboard/compose" />}>
          <PenSquare className="size-4 mr-2" />
          New post
        </Button>
      </div>

      {/* Expired accounts warning */}
      {accounts.expired > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertTriangle className="size-4 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800">
            {accounts.expired} social account{accounts.expired > 1 ? "s have" : " has"} an
            expired token.{" "}
            <Link to="/dashboard/settings" className="font-medium underline">
              Reconnect in Settings.
            </Link>
          </p>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.title}
              </CardTitle>
              {card.icon}
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{card.value}</p>
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                {card.subVariant === "destructive" ? (
                  <Badge variant="destructive" className="text-[10px] h-4">{card.sub}</Badge>
                ) : (
                  card.sub
                )}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Chart */}
      {chartData.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Posts — last 30 days</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="scheduled" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="published" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => format(new Date(v), "d MMM")}
                />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  labelFormatter={(v) => format(new Date(v as string), "d MMM yyyy")}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="scheduled"
                  stroke="#6366f1"
                  fill="url(#scheduled)"
                  strokeWidth={2}
                  name="Scheduled"
                />
                <Area
                  type="monotone"
                  dataKey="published"
                  stroke="#22c55e"
                  fill="url(#published)"
                  strokeWidth={2}
                  name="Published"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <CalendarClock className="size-10 text-muted-foreground" />
            <p className="text-muted-foreground text-sm">
              No posts yet this month.
            </p>
            <Button size="sm" variant="outline" render={<Link to="/dashboard/compose" />}>
              Create your first post
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
