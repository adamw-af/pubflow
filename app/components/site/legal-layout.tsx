import type { ReactNode } from "react";
import { SiteFooter, SiteNav, WRAP } from "./site-chrome";

/**
 * Shared shell for the public legal & trust pages (Privacy, Terms,
 * data-deletion, Contact). Renders the site nav, a centered prose column,
 * and the site footer. Mobile-first; prose column caps at a readable width.
 */
export function LegalLayout({
  isSignedIn,
  title,
  intro,
  updated,
  children,
}: {
  isSignedIn: boolean;
  title: string;
  intro?: ReactNode;
  /** Human-friendly "last updated" label, e.g. "18 June 2026". */
  updated?: string;
  children: ReactNode;
}) {
  return (
    <div className="bg-(--surface-page) min-h-screen flex flex-col">
      <SiteNav isSignedIn={isSignedIn} />
      <main className={`${WRAP} flex-1 py-12 lg:py-16`}>
        <div className="max-w-[44rem] mx-auto">
          <h1
            className="font-display font-extrabold text-(--text-strong)"
            style={{ fontSize: "clamp(2rem, 4vw, 3rem)", letterSpacing: "-0.03em", lineHeight: 1.02 }}
          >
            {title}
          </h1>
          {updated && (
            <p className="font-mono text-[0.8125rem] text-(--text-subtle) mt-3">Last updated {updated}</p>
          )}
          {intro && (
            <p className="text-[1.0625rem] text-(--text-muted) leading-[1.6] mt-5">{intro}</p>
          )}
          <div className="mt-8 flex flex-col gap-8">{children}</div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

/** A titled section within a legal page. */
export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section>
      <h2
        className="font-display font-bold text-(--text-strong) mb-3"
        style={{ fontSize: "clamp(1.25rem, 2.4vw, 1.6rem)", letterSpacing: "-0.015em" }}
      >
        {heading}
      </h2>
      <div className="flex flex-col gap-3.5 text-[1rem] text-(--text-body) leading-[1.6]">{children}</div>
    </section>
  );
}

/** Bulleted list styled to match the prose column. */
export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-none p-0 m-0 flex flex-col gap-2.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 items-start">
          <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-(--brand) mt-2.5" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
