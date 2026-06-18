import { getAuth } from "@clerk/react-router/server";
import { LegalLayout, LegalList, LegalSection } from "~/components/site/legal-layout";
import type { Route } from "./+types/data-deletion";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Data deletion — Pub Flow" },
    {
      name: "description",
      content:
        "How to request deletion of your Pub Flow account, your data, and the OAuth tokens for your connected social accounts.",
    },
  ];
}

export async function loader(args: Route.LoaderArgs) {
  const { userId } = await getAuth(args);
  return { isSignedIn: !!userId };
}

export default function DataDeletion({ loaderData }: Route.ComponentProps) {
  return (
    <LegalLayout
      isSignedIn={loaderData.isSignedIn}
      title="Data deletion"
      updated="18 June 2026"
      intro="You can remove your data from Pub Flow at any time — a single connected account, or your whole account. This page explains exactly how, and what gets deleted."
    >
      <LegalSection heading="Disconnect a single account">
        <p>
          To remove the access tokens for one connected social account, open{" "}
          <strong>Dashboard → Settings</strong>, find the account, and choose{" "}
          <strong>Disconnect</strong>. We immediately delete the stored OAuth access and refresh
          tokens for that account. Your scheduled posts to that account will no longer publish.
        </p>
      </LegalSection>

      <LegalSection heading="Delete your whole account">
        <p>There are two ways to request full deletion of your account and all associated data:</p>
        <LegalList
          items={[
            <>
              <strong>In the app.</strong> Open <strong>Dashboard → Settings</strong> and choose{" "}
              <strong>Delete account</strong>.
            </>,
            <>
              <strong>By email.</strong> Send a deletion request from your account email address to{" "}
              <a href="mailto:support@pub-flow.com?subject=Data%20deletion%20request" className="text-(--brand-hover) font-semibold no-underline hover:underline">
                support@pub-flow.com
              </a>{" "}
              with the subject &ldquo;Data deletion request&rdquo;. We use the sending address to
              verify the request.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection heading="What gets deleted">
        <LegalList
          items={[
            "The OAuth access and refresh tokens for every connected social account.",
            "Your posts, schedules, captions, hashtag sets, and post templates.",
            "Media you uploaded to our storage.",
            "Your workspace and account profile.",
          ]}
        />
        <p>
          We complete deletion within 30 days of a verified request. Some records may be retained
          only where the law requires it (for example, billing records held by our payment provider),
          and are deleted once that obligation ends.
        </p>
      </LegalSection>

      <LegalSection heading="Removing Pub Flow's access from the platform side">
        <p>
          You can also revoke Pub Flow&rsquo;s access directly from a connected platform&rsquo;s own
          settings — for example, in your Facebook or Meta account&rsquo;s &ldquo;Business
          integrations&rdquo; / connected-apps settings. Doing so stops Pub Flow from publishing to
          that account; to also remove the data we hold, follow the steps above.
        </p>
      </LegalSection>

      <LegalSection heading="Need help?">
        <p>
          If anything is unclear or you can&rsquo;t access your account, email{" "}
          <a href="mailto:support@pub-flow.com?subject=Data%20deletion%20request" className="text-(--brand-hover) font-semibold no-underline hover:underline">
            support@pub-flow.com
          </a>{" "}
          and we&rsquo;ll handle your request.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
