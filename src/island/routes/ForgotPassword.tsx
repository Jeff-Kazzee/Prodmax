/**
 * S-03 Forgot password (R-03): static explainer — v1 has no SMTP (FM-008);
 * resets are handled by workspace admins. Copy is final (CP-05).
 */
import { Link } from "react-router-dom";
import { Button } from "@island/components/ui/button";
import { AuthLayout } from "./auth-layout";

export default function ForgotPassword() {
  return (
    <AuthLayout
      title="Password resets are handled by your workspace admin."
      footer={
        <Link to="/login">
          <Button variant="ghost">Back to sign in</Button>
        </Link>
      }
    >
      <ol className="flex flex-col gap-2 text-sm text-muted-foreground">
        <li>1. Ask your workspace admin for a reset.</li>
        <li>2. They open Settings → Members.</li>
        <li>3. They reset your password from your member row.</li>
      </ol>
    </AuthLayout>
  );
}
