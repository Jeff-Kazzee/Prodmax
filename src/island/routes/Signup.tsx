/**
 * S-02 Signup (R-02; AT-001/003): name/email/password with a live
 * requirement checklist (AU-11), duplicate-email inline state (AU-12),
 * straight into the session + /onboarding (AU-13).
 */
import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Check, X } from "lucide-react";
import { Button } from "@island/components/ui/button";
import { Input } from "@island/components/ui/input";
import { Label } from "@island/components/ui/label";
import { useSession } from "@island/app/session";
import { ApiError } from "@island/app/api";
import { toastApiError } from "@island/app/toast";
import { AuthLayout } from "./auth-layout";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 10; // ux-spec AU-11: "10+ characters" (API floor is 8)

export default function Signup() {
  const session = useSession();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ field: string; message: string }[]>([]);
  const [duplicate, setDuplicate] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (session.status === "authed") {
    return <Navigate to="/onboarding" replace />;
  }

  const passwordLongEnough = password.length >= MIN_PASSWORD;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const next: { field: string; message: string }[] = [];
    if (name.trim().length === 0) next.push({ field: "name", message: "Enter your name." });
    if (!EMAIL_RE.test(email)) next.push({ field: "email", message: "Enter a valid email address." });
    if (password.length < MIN_PASSWORD)
      next.push({ field: "password", message: `Password must be ${MIN_PASSWORD}+ characters.` });
    setErrors(next);
    setDuplicate(false);
    if (next.length > 0) return;

    setSubmitting(true);
    try {
      await session.signup(name.trim(), email, password);
      navigate("/onboarding", { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === "CONFLICT") {
        setDuplicate(true);
      } else {
        toastApiError(err);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const errorFor = (field: string) => errors.find((e) => e.field === field)?.message;

  return (
    <AuthLayout
      title="Set up your bench"
      footer={
        <div className="text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" className="text-foreground underline-offset-4 hover:underline">
            Sign in
          </Link>
        </div>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        {duplicate ? (
          <div role="alert" className="rounded-md border p-3 text-sm">
            <p>That email already has an account.</p>
            <Link to="/login" className="underline-offset-4 hover:underline">
              Sign in instead
            </Link>
          </div>
        ) : null}
        <div className="flex flex-col gap-2">
          <Label htmlFor="signup-name">Name</Label>
          <Input
            id="signup-name"
            autoComplete="name"
            aria-invalid={errorFor("name") ? true : undefined}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          {errorFor("name") ? (
            <p className="text-sm text-destructive">{errorFor("name")}</p>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="signup-email">Email</Label>
          <Input
            id="signup-email"
            type="email"
            autoComplete="email"
            aria-invalid={errorFor("email") ? true : undefined}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {errorFor("email") ? (
            <p className="text-sm text-destructive">{errorFor("email")}</p>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="signup-password">Password</Label>
          <Input
            id="signup-password"
            type="password"
            autoComplete="new-password"
            aria-invalid={errorFor("password") ? true : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {errorFor("password") ? (
            <p className="text-sm text-destructive">{errorFor("password")}</p>
          ) : null}
          <ul className="mt-1 flex flex-col gap-1 text-sm" aria-live="polite">
            <li
              className={
                passwordLongEnough ? "text-foreground" : "text-muted-foreground"
              }
            >
              {passwordLongEnough ? (
                <Check className="mr-1 inline size-4" aria-hidden="true" />
              ) : (
                <X className="mr-1 inline size-4" aria-hidden="true" />
              )}
              10+ characters
            </li>
          </ul>
        </div>
        <Button type="submit" disabled={submitting} aria-disabled={submitting}>
          {submitting ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </AuthLayout>
  );
}
