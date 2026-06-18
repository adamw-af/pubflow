import { getAuth } from "@clerk/react-router/server";
import { Link } from "react-router";
import { LegalLayout, LegalList, LegalSection } from "~/components/site/legal-layout";
import type { Route } from "./+types/privacy";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Privacy policy — Pub Flow" },
    {
      name: "description",
      content:
        "How Pub Flow collects, uses, stores, and protects your data, including the OAuth tokens for your connected social accounts.",
    },
  ];
}

export async function loader(args: Route.LoaderArgs) {
  const { userId } = await getAuth(args);
  return { isSignedIn: !!userId };
}

export default function Privacy({ loaderData }: Route.ComponentProps) {
  return (
    <LegalLayout
      isSignedIn={loaderData.isSignedIn}
      title="Privacy policy"
      updated="18 June 2026"
      intro="Pub Flow is a social media scheduling tool. To publish on your behalf we handle a small amount of personal data and the access tokens for the accounts you connect. This page explains what we collect, why, who we share it with, and how to get it deleted."
    >
      <LegalSection heading="Who we are">
        <p>
          Pub Flow (&ldquo;we&rdquo;, &ldquo;us&rdquo;) operates the Pub Flow scheduling service at
          pub-flow.com. The operating entity is{" "}
          <strong>[LEGAL ENTITY NAME], [REGISTERED ADDRESS]</strong>. For any privacy question, or to
          exercise your rights, email{" "}
          <a href="mailto:support@pub-flow.com" className="text-(--brand-hover) font-semibold no-underline hover:underline">
            support@pub-flow.com
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection heading="What we collect">
        <LegalList
          items={[
            <>
              <strong>Account details.</strong> Your name and email address, handled through our
              authentication provider Clerk when you sign up or sign in.
            </>,
            <>
              <strong>Workspace data.</strong> Your workspace name, timezone, and the posts,
              schedules, captions, and hashtag sets you create.
            </>,
            <>
              <strong>Connected account tokens.</strong> When you connect a social account
              (LinkedIn, Instagram, X, Bluesky, or a Facebook Page via the Meta Graph API), we store
              the OAuth access and refresh tokens needed to publish on your behalf.
            </>,
            <>
              <strong>Media you upload.</strong> Images and video you add to posts, stored in
              Cloudflare R2.
            </>,
            <>
              <strong>Billing data.</strong> Subscription and payment status, handled by our billing
              provider Polar. We never see or store full card numbers.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection heading="How we use it">
        <p>
          We use your data only to run the service: to authenticate you, to publish the posts you
          schedule to the accounts you connect, to enforce your plan limits, and to bill your
          subscription. We do not sell your data, and we do not use the content of your posts or your
          connected-account data for advertising.
        </p>
      </LegalSection>

      <LegalSection heading="How your tokens are protected">
        <p>
          Your social account tokens are encrypted at the application layer before they are written
          to our database, and are only decrypted server-side at the moment we publish a post for
          you. This is the most sensitive data we hold, and it is never exposed to your browser after
          you connect.
        </p>
      </LegalSection>

      <LegalSection heading="Who we share it with">
        <p>We rely on a small set of subprocessors to deliver the service:</p>
        <LegalList
          items={[
            <><strong>Clerk</strong> — authentication and account management.</>,
            <><strong>Convex</strong> — our application backend and database.</>,
            <><strong>Cloudflare R2</strong> — storage for the media you upload.</>,
            <><strong>Polar</strong> — subscription billing and payments.</>,
            <>
              <strong>The social platforms you connect</strong> — we send the content you schedule to
              LinkedIn, Instagram, X, Bluesky, and Meta (Facebook Pages) so it can be published. Their
              own privacy policies govern what they do with it.
            </>,
            <>
              <strong>OpenAI</strong> — only if you use AI caption suggestions, the prompt you provide
              is sent to generate a draft.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection heading="Retention and deletion">
        <p>
          We keep your data for as long as your account is active. You can disconnect any social
          account at any time, which removes its stored tokens, and you can request full deletion of
          your account and data whenever you like. See our{" "}
          <Link to="/data-deletion" className="text-(--brand-hover) font-semibold no-underline hover:underline">
            data deletion instructions
          </Link>{" "}
          for exactly how to do this and what gets removed.
        </p>
      </LegalSection>

      <LegalSection heading="Cookies">
        <p>
          We use only the cookies required to keep you signed in and to run the service securely
          (set by Clerk). We do not use third-party advertising or tracking cookies.
        </p>
      </LegalSection>

      <LegalSection heading="Changes to this policy">
        <p>
          We may update this policy as the product evolves. When we make a material change we will
          update the date at the top of this page.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          Questions about your privacy? Email{" "}
          <a href="mailto:support@pub-flow.com" className="text-(--brand-hover) font-semibold no-underline hover:underline">
            support@pub-flow.com
          </a>{" "}
          and we&rsquo;ll help.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
