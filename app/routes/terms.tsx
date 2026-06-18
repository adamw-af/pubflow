import { getAuth } from "@clerk/react-router/server";
import { Link } from "react-router";
import { LegalLayout, LegalList, LegalSection } from "~/components/site/legal-layout";
import type { Route } from "./+types/terms";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Terms of service — Pub Flow" },
    {
      name: "description",
      content: "The terms that govern your use of Pub Flow, the social media scheduling service.",
    },
  ];
}

export async function loader(args: Route.LoaderArgs) {
  const { userId } = await getAuth(args);
  return { isSignedIn: !!userId };
}

export default function Terms({ loaderData }: Route.ComponentProps) {
  return (
    <LegalLayout
      isSignedIn={loaderData.isSignedIn}
      title="Terms of service"
      updated="18 June 2026"
      intro="These terms govern your use of Pub Flow. By creating an account or using the service, you agree to them. Please read them alongside our privacy policy."
    >
      <LegalSection heading="The service">
        <p>
          Pub Flow lets you connect social accounts and schedule posts that publish automatically to
          them. The service is operated by <strong>[LEGAL ENTITY NAME], [REGISTERED ADDRESS]</strong>{" "}
          (&ldquo;Pub Flow&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;).
        </p>
      </LegalSection>

      <LegalSection heading="Your account">
        <p>
          You need an account to use Pub Flow, created through our authentication provider. You are
          responsible for keeping your login secure and for activity that happens under your
          workspace. You must be old enough to form a binding contract in your jurisdiction.
        </p>
      </LegalSection>

      <LegalSection heading="Connected platforms">
        <p>
          When you connect a social account, you authorize Pub Flow to publish the content you
          schedule to that account on your behalf. Your use of each platform also remains subject to
          that platform&rsquo;s own terms — including Meta, LinkedIn, X, and Bluesky. You are
          responsible for ensuring your content complies with the rules of every platform you post
          to. You can disconnect any account at any time.
        </p>
      </LegalSection>

      <LegalSection heading="Acceptable use">
        <p>You agree not to use Pub Flow to:</p>
        <LegalList
          items={[
            "Publish unlawful, infringing, or abusive content, or content that violates a connected platform's policies.",
            "Send spam or otherwise misuse the publishing pipeline.",
            "Attempt to break, overload, reverse-engineer, or gain unauthorized access to the service.",
            "Resell or provide the service to third parties except as your plan allows.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="Your content">
        <p>
          You own the content you create and publish through Pub Flow. You grant us the limited
          license needed to store your content and transmit it to the platforms you choose, solely to
          provide the service. We claim no other rights to it.
        </p>
      </LegalSection>

      <LegalSection heading="Plans, trials, and billing">
        <p>
          New workspaces begin on a free trial with no credit card required. After the trial, or if
          you exceed the free limits, continued use requires a paid subscription. Subscriptions are
          billed through Polar according to the plan and price shown at checkout. Fees are
          non-refundable except where required by law, and you can cancel at any time to stop future
          billing.
        </p>
      </LegalSection>

      <LegalSection heading="Availability and disclaimer">
        <p>
          We work hard to publish your posts reliably, but the service is provided &ldquo;as is&rdquo;
          without warranties of any kind. Publishing depends on third-party platforms that can change,
          rate-limit, or reject content outside our control. We do not guarantee uninterrupted or
          error-free operation.
        </p>
      </LegalSection>

      <LegalSection heading="Limitation of liability">
        <p>
          To the maximum extent permitted by law, Pub Flow is not liable for indirect, incidental, or
          consequential damages, or for lost profits, revenue, or content, arising from your use of
          the service. Our total liability is limited to the amount you paid us in the twelve months
          before the claim.
        </p>
      </LegalSection>

      <LegalSection heading="Termination">
        <p>
          You may stop using Pub Flow and delete your account at any time — see our{" "}
          <Link to="/data-deletion" className="text-(--brand-hover) font-semibold no-underline hover:underline">
            data deletion instructions
          </Link>
          . We may suspend or terminate accounts that breach these terms.
        </p>
      </LegalSection>

      <LegalSection heading="Governing law">
        <p>
          These terms are governed by the laws of <strong>[JURISDICTION]</strong>, and any disputes
          will be handled by the courts of that jurisdiction.
        </p>
      </LegalSection>

      <LegalSection heading="Changes">
        <p>
          We may update these terms as the product changes. When we make a material change we will
          update the date at the top of this page; continued use after a change means you accept the
          updated terms.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          Questions about these terms? Email{" "}
          <a href="mailto:support@pub-flow.com" className="text-(--brand-hover) font-semibold no-underline hover:underline">
            support@pub-flow.com
          </a>
          .
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
