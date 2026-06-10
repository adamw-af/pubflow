import { getAuth } from "@clerk/react-router/server";
import { ConvexHttpClient } from "convex/browser";
import { ArrowRight, Calendar, Check, Clock, Layers } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { Button, buttonVariants } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import { api } from "../../convex/_generated/api";
import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Pub Flow — Schedule once. Post everywhere." },
    { name: "description", content: "Pub Flow turns the weekly scramble into one calm stream. Write a post, tailor it per channel, and let your whole week publish itself." },
  ];
}

export async function loader(args: Route.LoaderArgs) {
  const { userId } = await getAuth(args);
  const convex = new ConvexHttpClient(process.env.VITE_CONVEX_URL ?? "");
  const [subscriptionData, plans] = await Promise.all([
    userId
      ? convex.query(api.subscriptions.checkUserSubscriptionStatus, { userId }).catch(() => null)
      : Promise.resolve(null),
    convex.action(api.subscriptions.getAvailablePlans).catch(() => ({ items: [], pagination: null })),
  ]);
  return {
    isSignedIn: !!userId,
    hasActiveSubscription: subscriptionData?.hasActiveSubscription || false,
    plans,
  };
}

/* ------------------------------------------------------------------ */
/*  Shared helpers                                                       */
/* ------------------------------------------------------------------ */

const WRAP = "max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8";

type Platform = "instagram" | "x" | "linkedin" | "facebook" | "tiktok" | "youtube" | "threads" | "bluesky";

const CHANNEL_COLORS: Record<Platform, string> = {
  instagram: "var(--ch-instagram)",
  x: "var(--ch-x)",
  linkedin: "var(--ch-linkedin)",
  facebook: "var(--ch-facebook)",
  tiktok: "var(--ch-tiktok)",
  youtube: "var(--ch-youtube)",
  threads: "var(--ch-threads)",
  bluesky: "var(--ch-bluesky)",
};

function ChannelBubble({ platform, size = 28 }: { platform: Platform; size?: number }) {
  const color = CHANNEL_COLORS[platform];
  const iconSrc = `https://cdn.jsdelivr.net/npm/simple-icons@13/icons/${platform}.svg`;
  return (
    <span
      title={platform}
      className="inline-flex items-center justify-center rounded-full shrink-0"
      style={{ width: size, height: size, background: color, boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.08)" }}
    >
      <img src={iconSrc} alt={platform} width={size * 0.5} height={size * 0.5} style={{ filter: "brightness(0) invert(1)" }} />
    </span>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 text-(--brand-hover) font-bold uppercase tracking-[0.14em] text-[0.6875rem]">
      <span className="w-1.5 h-1.5 rounded-full bg-(--spark)" />
      {children}
    </div>
  );
}

function CheckItem({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-3 items-start text-(--text-body) text-base">
      <span className="shrink-0 w-5.5 h-5.5 rounded-full bg-(--flow-050) text-(--brand-hover) inline-flex items-center justify-center mt-0.5">
        <Check size={13} strokeWidth={2.6} />
      </span>
      {children}
    </li>
  );
}

/* ------------------------------------------------------------------ */
/*  Site nav                                                             */
/* ------------------------------------------------------------------ */

function SiteNav({ isSignedIn }: { isSignedIn: boolean }) {
  return (
    <header
      className="sticky top-0 z-40 border-b border-(--border-subtle) backdrop-blur-[14px]"
      style={{ background: "rgba(246,242,233,0.82)", WebkitBackdropFilter: "blur(14px)" }}
    >
      <div className={`${WRAP} h-16 flex items-center gap-6`}>
        <img src="/logo-wordmark.svg" alt="Pub Flow" className="h-7 shrink-0" />
        <nav className="hidden lg:flex gap-6 ml-4">
          {["Features", "Channels", "Pricing"].map((l) => (
            <a key={l} href={`#${l.toLowerCase()}`} className="text-(--text-body) text-[0.9375rem] font-medium no-underline hover:text-(--text-strong) transition-colors">
              {l}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <Link
            to={isSignedIn ? "/dashboard" : "/sign-in"}
            className="hidden sm:block text-(--text-strong) text-[0.9375rem] font-semibold no-underline whitespace-nowrap hover:text-(--brand-hover) transition-colors"
          >
            {isSignedIn ? "Dashboard" : "Sign in"}
          </Link>
          <Link
            to="/sign-up"
            className={cn(buttonVariants({ size: "sm" }), "bg-(--brand) hover:bg-(--brand-hover) text-white border-0 shadow-(--shadow-sm-ds) inline-flex items-center gap-1")}
          >
            Start free <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/*  Hero                                                                 */
/* ------------------------------------------------------------------ */

function HeroPreview() {
  const channels: Platform[] = ["instagram", "x", "linkedin", "tiktok"];
  return (
    <div className="relative mt-2">
      {/* Ambient glow */}
      <div
        aria-hidden
        className="absolute -inset-8 z-0 pointer-events-none"
        style={{ background: "radial-gradient(120% 90% at 80% 10%, rgba(143,212,186,0.30), transparent 60%)", filter: "blur(2px)" }}
      />
      {/* Composer card */}
      <div className="relative z-10 bg-(--surface-card) rounded-[22px] border border-(--border-subtle) shadow-(--shadow-xl-ds) overflow-hidden">
        <div className="flex items-center gap-2.5 px-4.5 py-4 border-b border-(--border-subtle)">
          <span className="font-display font-bold text-[1.125rem] text-(--text-strong)">New post</span>
          <span className="ml-auto text-[0.6875rem] font-semibold px-2 py-0.5 rounded-full bg-(--paper-200) text-(--text-muted)">Draft</span>
        </div>
        <div className="p-4.5">
          <div className="flex items-center gap-2 mb-3.5">
            <span className="text-[0.8125rem] text-(--text-muted) mr-0.5">Posting to</span>
            {channels.map((c) => <ChannelBubble key={c} platform={c} size={28} />)}
            <span className="w-7 h-7 rounded-full border border-dashed border-(--border-strong) inline-flex items-center justify-center text-(--text-subtle) text-base">+</span>
          </div>
          <div className="bg-(--surface-sunk) border border-(--border-subtle) rounded-xl px-4 py-3.5 text-[0.9375rem] text-(--text-body) leading-relaxed min-h-23">
            Launch week is here ✨ We rebuilt the calendar from scratch — drag, drop, done.
            <span className="text-(--brand-hover) font-semibold"> #pubflow</span>
            <span className="inline-block w-0.5 h-4.5 bg-(--brand) ml-0.5 align-text-bottom animate-pulse" />
          </div>
          <div className="flex items-center justify-between mt-4">
            <div className="inline-flex items-center gap-2 text-(--info-500) bg-(--info-bg) px-3 py-1.5 rounded-full text-[0.8125rem] font-semibold">
              <Clock size={15} /> Tue · 9:00 AM
            </div>
            <Button size="sm" className="bg-(--brand) hover:bg-(--brand-hover) text-white border-0">
              Schedule
            </Button>
          </div>
        </div>
      </div>
      {/* Floating confirmation chip */}
      <div
        className="absolute z-20 -right-4 -bottom-6 hidden sm:block"
        style={{ animation: "pf-float 4s cubic-bezier(0.65,0,0.35,1) infinite" }}
      >
        <div className="bg-(--surface-card) rounded-2xl border border-(--border-subtle) shadow-(--shadow-lg-ds) flex items-center gap-2.5 px-4 py-2.5">
          <span className="w-7.5 h-7.5 rounded-full bg-(--success-bg) text-(--success-500) inline-flex items-center justify-center shrink-0">
            <Check size={17} />
          </span>
          <div>
            <div className="text-[0.8125rem] font-semibold text-(--text-strong)">Posted to 4 channels</div>
            <div className="text-[0.75rem] text-(--text-muted)">2 seconds ago · +1.2k reach</div>
          </div>
        </div>
      </div>
      <style>{`
        @keyframes pf-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-9px); } }
      `}</style>
    </div>
  );
}

function Hero() {
  return (
    <section className={`${WRAP} pt-14 pb-8 lg:pt-18 lg:pb-10`}>
      <div className="grid grid-cols-1 lg:grid-cols-[1.04fr_0.96fr] gap-10 lg:gap-14 items-center">
        <div>
          <Eyebrow>Find your flow</Eyebrow>
          <h1
            className="font-display font-extrabold text-(--text-strong) mt-4"
            style={{ fontSize: "clamp(2.4rem, 5vw, 4.6rem)", letterSpacing: "-0.03em", lineHeight: 0.98 }}
          >
            Schedule once.<br />Post <span className="text-(--brand)">everywhere</span>.
          </h1>
          <p className="text-[1.0625rem] text-(--text-muted) leading-[1.55] mt-5 max-w-115">
            Pub Flow turns the weekly scramble into one calm stream. Write a post, tailor it per
            channel, and let your whole week publish itself — on time, every time.
          </p>
          <div className="flex flex-wrap gap-3 mt-7 items-center">
            <Link
              to="/sign-up"
              className={cn(buttonVariants({ size: "lg" }), "bg-(--brand) hover:bg-(--brand-hover) text-white border-0 shadow-(--shadow-flow) inline-flex items-center gap-1.5")}
            >
              Start free <ArrowRight size={18} />
            </Link>
            <a href="#features" className={cn(buttonVariants({ variant: "outline", size: "lg" }))}>
              See how it works
            </a>
          </div>
          <div className="flex items-center gap-3.5 mt-6 text-(--text-subtle) text-[0.8125rem]">
            <div className="flex">
              {["Mia", "Theo", "Ada", "Sol"].map((n, i) => (
                <span key={n} className="rounded-full border-2 border-(--surface-page) inline-flex" style={{ marginLeft: i ? -8 : 0 }}>
                  <span className="w-8 h-8 rounded-full bg-(--flow-200) text-(--flow-800) inline-flex items-center justify-center text-xs font-bold">
                    {n[0]}
                  </span>
                </span>
              ))}
            </div>
            <span>Loved by <strong className="text-(--text-body)">12,000+</strong> creators &amp; small teams</span>
          </div>
        </div>
        <HeroPreview />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Channel strip                                                        */
/* ------------------------------------------------------------------ */

function ChannelStrip() {
  const items: [Platform, string][] = [
    ["instagram", "Instagram"], ["x", "X"], ["linkedin", "LinkedIn"], ["facebook", "Facebook"],
    ["tiktok", "TikTok"], ["youtube", "YouTube"], ["threads", "Threads"], ["bluesky", "Bluesky"],
  ];
  return (
    <section id="channels" className={`${WRAP} pt-8 pb-12`}>
      <p className="text-center text-[0.8125rem] text-(--text-subtle) font-semibold tracking-[0.02em] uppercase mb-5">
        One composer, every channel your audience is on
      </p>
      <div className="flex flex-wrap justify-center gap-2.5 sm:gap-3.5">
        {items.map(([p, label]) => (
          <div key={p} className="inline-flex items-center gap-2.5 py-2 pl-2 pr-4 bg-(--surface-card) border border-(--border-subtle) rounded-full shadow-(--shadow-xs)">
            <ChannelBubble platform={p} size={28} />
            <span className="text-[0.8125rem] font-semibold text-(--text-body)">{label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Feature rows                                                         */
/* ------------------------------------------------------------------ */

function FeatureRow({
  eyebrow, title, body, bullets, visual, flip,
}: {
  eyebrow: string;
  title: ReactNode;
  body: string;
  bullets: string[];
  visual: ReactNode;
  flip?: boolean;
}) {
  return (
    <section className={`${WRAP} py-12 lg:py-16`}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-10 lg:gap-15 items-center">
        {/* On mobile always: text first, visual second. On desktop: honour flip. */}
        <div className={flip ? "md:order-2" : "md:order-1"}>
          <Eyebrow>{eyebrow}</Eyebrow>
          <h2
            className="font-display font-bold text-(--text-strong) mt-4"
            style={{ fontSize: "clamp(1.75rem, 3vw, 2.9rem)", letterSpacing: "-0.015em", lineHeight: 1.04 }}
          >
            {title}
          </h2>
          <p className="text-[1.0625rem] text-(--text-muted) leading-[1.55] mt-4 max-w-110">{body}</p>
          <ul className="list-none p-0 mt-5 flex flex-col gap-3">
            {bullets.map((b) => <CheckItem key={b}>{b}</CheckItem>)}
          </ul>
        </div>
        <div className={flip ? "md:order-1" : "md:order-2"}>
          {visual}
        </div>
      </div>
    </section>
  );
}

function CalendarVisual() {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;
  const chips: Record<string, [Platform, string, string][]> = {
    Mon: [["instagram", "9:00", "var(--ch-instagram)"]],
    Tue: [["x", "8:30", "var(--ch-x)"], ["linkedin", "12:00", "var(--ch-linkedin)"]],
    Wed: [["tiktok", "5:00", "var(--ch-tiktok)"]],
    Thu: [["linkedin", "9:00", "var(--ch-linkedin)"], ["instagram", "6:00", "var(--ch-instagram)"]],
    Fri: [["youtube", "3:00", "var(--ch-youtube)"]],
  };
  return (
    <div className="bg-(--surface-card) rounded-[22px] border border-(--border-subtle) shadow-(--shadow-md-ds) p-5">
      <div className="flex items-center mb-3.5">
        <Calendar size={18} color="var(--brand)" />
        <span className="font-semibold ml-2 text-(--text-strong)">This week</span>
        <span className="ml-auto text-[0.6875rem] font-semibold px-2 py-0.5 rounded-full bg-(--flow-050) text-(--flow-700)">
          12 scheduled
        </span>
      </div>
      <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
        {days.map((d) => (
          <div key={d} className="bg-(--surface-sunk) rounded-xl p-1.5 sm:p-2 min-h-30">
            <div className="text-[0.6875rem] font-bold tracking-[0.02em] uppercase text-(--text-subtle) mb-2">{d}</div>
            <div className="flex flex-col gap-1.5">
              {(chips[d] ?? []).map(([p, t, c], i) => (
                <div key={i} className="bg-(--surface-card) rounded-lg border border-(--border-subtle) px-1.5 py-1.5 flex items-center gap-1.5" style={{ borderLeft: `3px solid ${c}` }}>
                  <ChannelBubble platform={p} size={18} />
                  <span className="font-mono text-[10px] text-(--text-muted) hidden sm:inline">{t}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ComposerVisual() {
  const variants: [Platform, string][] = [
    ["instagram", "Launch week is here ✨ Swipe for everything new →"],
    ["linkedin", "We rebuilt our calendar from the ground up. Here's what changed, and why it matters for busy teams."],
    ["x", "we rebuilt the calendar. drag, drop, done. 🧵"],
  ];
  return (
    <div className="bg-(--surface-card) rounded-[22px] border border-(--border-subtle) shadow-(--shadow-md-ds) p-5">
      <div className="flex items-center gap-2 mb-3.5">
        <Layers size={18} color="var(--brand)" />
        <span className="font-semibold text-(--text-strong)">Tailored per channel</span>
        <span className="ml-auto text-[0.6875rem] font-semibold px-2 py-0.5 rounded-full bg-(--flow-050) text-(--flow-700)">
          Auto-fit
        </span>
      </div>
      <div className="flex flex-col gap-2.5">
        {variants.map(([p, text]) => (
          <div key={p} className="flex gap-3 items-start bg-(--surface-sunk) rounded-xl p-3">
            <ChannelBubble platform={p} size={28} />
            <p className="m-0 text-[0.8125rem] text-(--text-body) leading-[1.45]">{text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function AnalyticsVisual() {
  const bars = [42, 58, 49, 70, 64, 88, 76];
  return (
    <div className="bg-(--surface-card) rounded-[22px] border border-(--border-subtle) shadow-(--shadow-md-ds) p-5">
      <div className="flex items-start mb-4.5">
        <div>
          <div className="text-[0.6875rem] tracking-[0.14em] uppercase text-(--text-subtle)">Reach · 7 days</div>
          <div className="font-display font-bold text-[34px] text-(--text-strong) leading-tight mt-1">48,210</div>
        </div>
        <span className="ml-auto text-[0.6875rem] font-semibold px-2 py-0.5 rounded-full bg-(--success-bg) text-(--success-500)">
          +12.4%
        </span>
      </div>
      <div className="flex items-end gap-2.5 h-30">
        {bars.map((h, i) => (
          <div key={i} className="flex-1 h-full flex flex-col justify-end">
            <div
              className="w-full"
              style={{ height: `${h}%`, borderRadius: "6px 6px 3px 3px", background: i === 5 ? "var(--spark-400)" : "var(--flow-300)" }}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-2 font-mono text-[10px] text-(--text-subtle)">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <span key={i}>{d}</span>)}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Flow band (dark stat strip)                                          */
/* ------------------------------------------------------------------ */

function FlowBand() {
  const stats = [
    ["12,000+", "creators & teams"],
    ["3.4M", "posts published"],
    ["8", "channels supported"],
    ["6 hrs", "saved per week"],
  ];
  return (
    <section className="bg-(--ink-900) text-(--paper-100) py-14 lg:py-18 relative overflow-hidden">
      <div aria-hidden className="absolute inset-0 opacity-50" style={{ background: "repeating-linear-gradient(180deg, transparent 0 38px, rgba(143,212,186,0.06) 38px 39px)" }} />
      <div className={`${WRAP} relative`}>
        <div className="max-w-180">
          <div className="inline-flex items-center gap-2 text-(--flow-300) text-[0.6875rem] font-bold tracking-[0.14em] uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-(--spark-400)" /> Find your flow
          </div>
          <h2
            className="font-display font-extrabold text-(--paper-050) mt-4"
            style={{ fontSize: "clamp(1.9rem, 3.6vw, 3.4rem)", letterSpacing: "-0.03em", lineHeight: 1.05 }}
          >
            Stop posting by hand.<br />Let the week run itself.
          </h2>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mt-10 lg:mt-12">
          {stats.map(([n, l]) => (
            <div key={l} className="border-t border-(--ink-700) pt-4">
              <div className="font-display font-bold text-[clamp(1.75rem,4vw,2.375rem)] text-(--flow-300)">{n}</div>
              <div className="text-[0.8125rem] text-(--ink-300) mt-1">{l}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Pricing                                                              */
/* ------------------------------------------------------------------ */

type PlanItem = {
  id: string;
  name: string;
  description: string | null;
  prices: { id: string; amount: number; currency: string; interval: string | null }[];
};

function PriceCard({
  name, price, blurb, features, featured, cta, isSignedIn,
}: {
  name: string;
  price: string;
  blurb: string;
  features: string[];
  featured?: boolean;
  cta: string;
  isSignedIn: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-[22px] p-6 lg:p-7 flex flex-col bg-(--surface-card)",
        featured
          ? "border-[1.5px] border-(--brand) shadow-(--shadow-xl-ds)"
          : "border border-(--border-subtle) shadow-(--shadow-sm-ds)"
      )}
    >
      {featured && (
        <span className="self-start mb-3 text-[0.6875rem] font-bold px-2.5 py-1 rounded-full bg-(--brand) text-white">
          Most popular
        </span>
      )}
      <div className="font-display font-bold text-[1.125rem] text-(--text-strong)">{name}</div>
      <div className="text-[0.8125rem] text-(--text-muted) mt-1 min-h-9.5">{blurb}</div>
      <div className="flex items-baseline gap-1 my-4">
        <span className="font-display font-extrabold text-[42px] lg:text-[46px] text-(--text-strong) leading-none" style={{ letterSpacing: "-0.02em" }}>{price}</span>
        <span className="text-(--text-subtle) text-base">/mo</span>
      </div>
      <Link
        to={isSignedIn ? "/pricing" : "/sign-up"}
        className={cn(
          buttonVariants({ variant: featured ? "default" : "outline" }),
          "w-full justify-center",
          featured ? "bg-(--brand) hover:bg-(--brand-hover) text-white border-0 shadow-(--shadow-flow)" : ""
        )}
      >
        {cta}
      </Link>
      <ul className="list-none p-0 mt-5 flex flex-col gap-3">
        {features.map((f) => (
          <li key={f} className="flex gap-2.5 items-start text-[0.8125rem] text-(--text-body)">
            <Check size={15} color="var(--brand)" strokeWidth={2.6} className="mt-0.5 shrink-0" />
            {f}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Pricing({ plans, isSignedIn }: { plans: { items: PlanItem[] }; isSignedIn: boolean }) {
  const planDefs = [
    {
      key: "base",
      name: "Base",
      blurb: "For one creator finding their rhythm.",
      features: ["25 connected accounts", "Unlimited scheduling", "Weekly calendar", "Basic analytics"],
      featured: false,
      cta: "Get started",
    },
    {
      key: "pro",
      name: "Pro",
      blurb: "For creators & small teams in full flow.",
      features: ["50 connected accounts", "Unlimited scheduling", "Best-time slots & auto-queue", "Per-channel tailoring", "Full analytics"],
      featured: true,
      cta: "Start free trial",
    },
    {
      key: "premium",
      name: "Premium",
      blurb: "For agencies running many brands.",
      features: ["Unlimited accounts", "Everything in Pro", "Approval workflows", "Shared content library", "Priority support"],
      featured: false,
      cta: "Talk to us",
    },
  ];

  return (
    <section id="pricing" className={`${WRAP} pt-16 lg:pt-20 pb-10`}>
      <div className="text-center max-w-140 mx-auto mb-10 lg:mb-11">
        <Eyebrow>Pricing</Eyebrow>
        <h2
          className="font-display font-bold text-(--text-strong) mt-3.5 mb-2"
          style={{ fontSize: "clamp(1.75rem, 3vw, 2.8rem)", letterSpacing: "-0.015em" }}
        >
          Simple plans that grow with you
        </h2>
        <p className="text-(--text-muted) text-[1.0625rem] m-0">Start free. Upgrade when your queue does.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-5 items-start">
        {planDefs.map((def) => {
          const polar = plans.items.find((p) => p.name.toLowerCase().includes(def.key));
          const amount = polar?.prices?.[0]?.amount;
          const price = amount != null ? `$${Math.round(amount / 100)}` : "—";
          return (
            <PriceCard
              key={def.key}
              name={def.name}
              price={price}
              blurb={def.blurb}
              features={def.features}
              featured={def.featured}
              cta={def.cta}
              isSignedIn={isSignedIn}
            />
          );
        })}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Final CTA                                                            */
/* ------------------------------------------------------------------ */

function FinalCTA() {
  return (
    <section className={`${WRAP} pt-14 pb-16 lg:pt-15 lg:pb-22.5`}>
      <div className="bg-(--flow-050) border border-(--flow-100) rounded-[28px] px-6 py-12 sm:px-10 sm:py-14 text-center relative overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(80% 120% at 50% -20%, rgba(143,212,186,0.45), transparent 60%)" }}
        />
        <div className="relative">
          <h2
            className="font-display font-extrabold text-(--flow-800) m-0 mb-3"
            style={{ fontSize: "clamp(1.9rem, 3.4vw, 3.2rem)", letterSpacing: "-0.03em" }}
          >
            Find your flow this week.
          </h2>
          <p className="text-(--flow-700) text-[1.0625rem] mx-auto mb-6 max-w-110">
            Set up your channels in two minutes and let your content publish itself.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
            <Link
              to="/sign-up"
              className={cn(buttonVariants({ size: "lg" }), "bg-(--brand) hover:bg-(--brand-hover) text-white border-0 shadow-(--shadow-flow) inline-flex items-center gap-1.5 w-full sm:w-auto justify-center")}
            >
              Start free <ArrowRight size={18} />
            </Link>
            <a
              href="mailto:hello@pub-flow.com"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }), "border-(--flow-300) text-(--flow-700) hover:bg-(--flow-100) w-full sm:w-auto justify-center")}
            >
              Book a demo
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Footer                                                               */
/* ------------------------------------------------------------------ */

function SiteFooter() {
  const cols: [string, string[]][] = [
    ["Product", ["Features", "Channels", "Pricing", "Changelog", "Roadmap"]],
    ["Company", ["About", "Blog", "Careers", "Contact"]],
    ["Resources", ["Help center", "Guides", "API", "Status"]],
  ];
  return (
    <footer className="bg-(--ink-900) text-(--ink-300) py-12 lg:py-14">
      <div className={`${WRAP} grid grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr] gap-8`}>
        <div className="col-span-2 lg:col-span-1">
          <img src="/logo-wordmark-light.svg" alt="Pub Flow" className="h-7" />
          <p className="mt-3.5 max-w-60 text-[0.8125rem] leading-relaxed">
            Schedule once. Post everywhere. The calm command center for your social content.
          </p>
        </div>
        {cols.map(([h, items]) => (
          <div key={h}>
            <div className="text-(--paper-100) font-semibold text-[0.8125rem] mb-3.5">{h}</div>
            <ul className="list-none p-0 m-0 flex flex-col gap-2.5">
              {items.map((i) => (
                <li key={i}>
                  <a href="#" className="text-(--ink-300) no-underline text-[0.8125rem] hover:text-(--ink-100) transition-colors">{i}</a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className={`${WRAP} mt-10 pt-5 border-t border-(--ink-700) flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between text-[0.8125rem]`}>
        <span>© 2026 Pub Flow. All rights reserved.</span>
        <div className="flex gap-4.5">
          <a href="#" className="text-(--ink-300) no-underline hover:text-(--ink-100) transition-colors">Privacy</a>
          <a href="#" className="text-(--ink-300) no-underline hover:text-(--ink-100) transition-colors">Terms</a>
        </div>
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                                 */
/* ------------------------------------------------------------------ */

export default function Home({ loaderData }: Route.ComponentProps) {
  const { isSignedIn, plans } = loaderData;
  return (
    <div id="features" className="bg-(--surface-page)">
      <SiteNav isSignedIn={isSignedIn} />
      <Hero />
      <ChannelStrip />
      <FeatureRow
        eyebrow="Plan"
        title="Your whole week, in one view"
        body="Drag posts onto a calendar that finally feels like yours. See every channel at a glance and fill the gaps before they become a Friday-night scramble."
        bullets={[
          "Drag-and-drop scheduling across all channels",
          "Best-time slots suggested for each audience",
          "Queue fills itself from your evergreen library",
        ]}
        visual={<CalendarVisual />}
      />
      <FeatureRow
        flip
        eyebrow="Compose"
        title="Write once, fit everywhere"
        body="One idea, perfectly sized for each platform. Pub Flow trims, reframes, and formats automatically — you stay in control of every word."
        bullets={[
          "Per-channel previews as you type",
          "Auto-fit length, hashtags, and mentions",
          "Save variants as reusable templates",
        ]}
        visual={<ComposerVisual />}
      />
      <FeatureRow
        eyebrow="Measure"
        title="Know what's actually working"
        body="Skip the vanity metrics. See the posts and times that move the needle, then turn your best performers into next week's queue in a click."
        bullets={[
          "Reach, engagement, and link clicks in one place",
          "Spot your best time to post per channel",
          "Re-queue top performers automatically",
        ]}
        visual={<AnalyticsVisual />}
      />
      <FlowBand />
      <Pricing plans={plans} isSignedIn={isSignedIn} />
      <FinalCTA />
      <SiteFooter />
    </div>
  );
}
