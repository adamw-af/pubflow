import { getAuth } from "@clerk/react-router/server";
import { Mail } from "lucide-react";
import { Link } from "react-router";
import { LegalLayout, LegalSection } from "~/components/site/legal-layout";
import type { Route } from "./+types/contact";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Contact — Pub Flow" },
    { name: "description", content: "Get in touch with the Pub Flow team." },
  ];
}

export async function loader(args: Route.LoaderArgs) {
  const { userId } = await getAuth(args);
  return { isSignedIn: !!userId };
}

export default function Contact({ loaderData }: Route.ComponentProps) {
  return (
    <LegalLayout
      isSignedIn={loaderData.isSignedIn}
      title="Contact"
      intro="The fastest way to reach a human at Pub Flow is by email. Whether it's a question, a bug, a billing issue, or a data request, we read every message."
    >
      <LegalSection heading="Email us">
        <a
          href="mailto:support@pub-flow.com"
          className="inline-flex items-center gap-3 self-start bg-(--surface-card) border border-(--border-subtle) rounded-xl px-5 py-4 no-underline shadow-(--shadow-sm-ds) hover:border-(--brand) transition-colors"
        >
          <span className="w-10 h-10 rounded-full bg-(--flow-050) text-(--brand-hover) inline-flex items-center justify-center shrink-0">
            <Mail size={18} />
          </span>
          <span>
            <span className="block text-[0.75rem] uppercase tracking-[0.12em] text-(--text-subtle) font-semibold">
              Support
            </span>
            <span className="block text-[1.0625rem] font-semibold text-(--text-strong)">
              support@pub-flow.com
            </span>
          </span>
        </a>
        <p>
          We aim to reply within two business days. For account-specific issues, email us from the
          address on your account so we can find you quickly.
        </p>
      </LegalSection>

      <LegalSection heading="Other things you might be looking for">
        <p>
          To delete your account or a connected social account, see our{" "}
          <Link to="/data-deletion" className="text-(--brand-hover) font-semibold no-underline hover:underline">
            data deletion instructions
          </Link>
          . For how we handle your data, read our{" "}
          <Link to="/privacy" className="text-(--brand-hover) font-semibold no-underline hover:underline">
            privacy policy
          </Link>
          , and for the rules of the service, our{" "}
          <Link to="/terms" className="text-(--brand-hover) font-semibold no-underline hover:underline">
            terms of service
          </Link>
          .
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
