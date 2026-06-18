import { SignUp } from "@clerk/react-router";
import { AuthLayout } from "~/components/auth/AuthLayout";
import { clerkAppearance } from "~/lib/clerk-appearance";

export default function SignUpPage() {
  return (
    <AuthLayout>
      <SignUp appearance={clerkAppearance} signInUrl="/sign-in" />
    </AuthLayout>
  );
}
