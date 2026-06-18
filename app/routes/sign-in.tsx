import { SignIn } from "@clerk/react-router";
import { AuthLayout } from "~/components/auth/AuthLayout";
import { clerkAppearance } from "~/lib/clerk-appearance";

export default function SignInPage() {
  return (
    <AuthLayout>
      <SignIn appearance={clerkAppearance} signUpUrl="/sign-up" />
    </AuthLayout>
  );
}
