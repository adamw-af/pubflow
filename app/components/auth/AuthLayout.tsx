import { CalendarClock, Rocket, Sparkles } from "lucide-react";

const HIGHLIGHTS = [
  {
    icon: Rocket,
    title: "Start free, no card",
    description: "A 7-day trial with full access — connect an account and schedule your first post.",
  },
  {
    icon: CalendarClock,
    title: "Schedule everywhere",
    description: "Plan and publish across every platform from one composer, in your timezone.",
  },
  {
    icon: Sparkles,
    title: "Built to grow",
    description: "Upgrade only when you're ready to connect more accounts and unlock every tier.",
  },
];

/**
 * Split-screen shell for the branded auth pages: a Flow Green brand panel
 * (hidden on small screens) beside the themed Clerk widget.
 */
export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-[#0a5b46] p-12 text-white lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            background:
              "radial-gradient(60rem 60rem at 110% -10%, #1ea27c 0%, transparent 55%), radial-gradient(40rem 40rem at -10% 110%, #0e8e6a 0%, transparent 55%)",
          }}
        />
        <div className="relative z-10 flex items-center gap-2">
          <span className="font-display text-2xl font-bold tracking-tight">PubFlow</span>
        </div>

        <div className="relative z-10 max-w-md">
          <h1 className="font-display text-3xl font-bold leading-tight">
            Schedule once. Publish everywhere.
          </h1>
          <p className="mt-3 text-white/80">
            The social scheduling workspace that gets you to your first published post fast.
          </p>

          <ul className="mt-10 space-y-6">
            {HIGHLIGHTS.map(({ icon: Icon, title, description }) => (
              <li key={title} className="flex gap-3">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <Icon className="size-5" />
                </span>
                <div>
                  <p className="font-medium">{title}</p>
                  <p className="text-sm text-white/70">{description}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative z-10 text-sm text-white/60">
          © {new Date().getFullYear()} PubFlow
        </p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center bg-background p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <span className="font-display text-2xl font-bold tracking-tight text-foreground">
              PubFlow
            </span>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
