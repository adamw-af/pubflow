import { ArrowRight } from "lucide-react";
import { Link } from "react-router";
import { buttonVariants } from "~/components/ui/button";
import { cn } from "~/lib/utils";

/** Shared content wrapper used across the public (logged-out) site. */
export const WRAP = "max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8";

/**
 * Public site header. Nav links point at homepage anchors via absolute
 * hashes so they resolve from any public page (home, legal, trust).
 */
export function SiteNav({ isSignedIn }: { isSignedIn: boolean }) {
  return (
    <header
      className="sticky top-0 z-40 border-b border-(--border-subtle) backdrop-blur-[14px]"
      style={{ background: "rgba(246,242,233,0.82)", WebkitBackdropFilter: "blur(14px)" }}
    >
      <div className={`${WRAP} h-16 flex items-center gap-6`}>
        <Link to="/" aria-label="Pub Flow home" className="shrink-0">
          <img src="/logo-wordmark.svg" alt="Pub Flow" className="h-7" />
        </Link>
        <nav className="hidden lg:flex gap-6 ml-4">
          {[
            ["Features", "/#features"],
            ["Channels", "/#channels"],
            ["Pricing", "/#pricing"],
          ].map(([label, href]) => (
            <a
              key={label}
              href={href}
              className="text-(--text-body) text-[0.9375rem] font-medium no-underline hover:text-(--text-strong) transition-colors"
            >
              {label}
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

/**
 * Public site footer. Every link resolves to a real destination — homepage
 * anchors or live routes. No placeholder/dead links.
 */
export function SiteFooter() {
  const cols: [string, [string, string][]][] = [
    [
      "Product",
      [
        ["Features", "/#features"],
        ["Channels", "/#channels"],
        ["Pricing", "/#pricing"],
      ],
    ],
    [
      "Legal & trust",
      [
        ["Privacy policy", "/privacy"],
        ["Terms of service", "/terms"],
        ["Data deletion", "/data-deletion"],
        ["Contact", "/contact"],
      ],
    ],
  ];
  const isInternal = (href: string) => href.startsWith("/") && !href.startsWith("/#");

  return (
    <footer className="bg-(--ink-900) text-(--ink-300) py-12 lg:py-14">
      <div className={`${WRAP} grid grid-cols-2 lg:grid-cols-[2fr_1fr_1fr] gap-8`}>
        <div className="col-span-2 lg:col-span-1">
          <img src="/logo-wordmark-light.svg" alt="Pub Flow" className="h-7" />
          <p className="mt-3.5 max-w-60 text-[0.8125rem] leading-relaxed">
            Schedule once. Post everywhere. The calm command center for your social content.
          </p>
        </div>
        {cols.map(([heading, items]) => (
          <div key={heading}>
            <div className="text-(--paper-100) font-semibold text-[0.8125rem] mb-3.5">{heading}</div>
            <ul className="list-none p-0 m-0 flex flex-col gap-2.5">
              {items.map(([label, href]) => (
                <li key={label}>
                  {isInternal(href) ? (
                    <Link to={href} className="text-(--ink-300) no-underline text-[0.8125rem] hover:text-(--ink-100) transition-colors">
                      {label}
                    </Link>
                  ) : (
                    <a href={href} className="text-(--ink-300) no-underline text-[0.8125rem] hover:text-(--ink-100) transition-colors">
                      {label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className={`${WRAP} mt-10 pt-5 border-t border-(--ink-700) flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between text-[0.8125rem]`}>
        <span>© 2026 Pub Flow. All rights reserved.</span>
        <div className="flex gap-4.5">
          <Link to="/privacy" className="text-(--ink-300) no-underline hover:text-(--ink-100) transition-colors">Privacy</Link>
          <Link to="/terms" className="text-(--ink-300) no-underline hover:text-(--ink-100) transition-colors">Terms</Link>
        </div>
      </div>
    </footer>
  );
}
