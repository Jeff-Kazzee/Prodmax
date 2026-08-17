/**
 * S-01 Login (R-01; AT-001/002/003). Email+password, generic errors
 * (FM-003), rate-limit state (AU-05), show/hide password (AU-02).
 */
import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, TriangleAlert } from "lucide-react";
import { Button } from "@island/components/ui/button";
import { Input } from "@island/components/ui/input";
import { Label } from "@island/components/ui/label";
import { Kbd } from "@island/components/ui/kbd";
import { useSession } from "@island/app/session";
import { ApiError } from "@island/app/api";
import { rateLimitMessage, toastApiError } from "@island/app/toast";
import { AuthFooterLinks, AuthLayout } from "./auth-layout";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Login() {
  const session = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") ?? "/";

  const emailRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setInterval(() => setCooldown((n) => Math.max(0, n - 1)), 1000);
    return () => window.clearInterval(t);
  }, [cooldown]);

  if (session.status === "authed") {
    return <Navigate to={next} replace />;
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cooldown > 0 || submitting) return;
    setBanner(null);
    if (!EMAIL_RE.test(email)) {
      setFieldError("Enter a valid email address.");
      return;
    }
    if (password.length === 0) {
      setFieldError("Enter your password.");
      return;
    }
    setFieldError(null);
    setSubmitting(true);
    try {
      await session.login(email, password);
      navigate(next, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === "RATE_LIMITED") {
        setCooldown(err.retryAfter ?? 60);
      } else if (err instanceof ApiError && err.code === "AUTH_REQUIRED") {
        // Generic by contract (FM-003): never reveals which field failed.
        setBanner("Email or password is incorrect.");
        toastApiError(err, "Email or password is incorrect.");
      } else {
        setBanner("Something broke on our bench. It's been logged.");
        toastApiError(err);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout title="Sign in to your workshop" footer={<AuthFooterLinks />}>
      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        {banner ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>{banner}</span>
          </div>
        ) : null}
        {cooldown > 0 ? (
          <div role="alert" className="rounded-md border p-3 text-sm text-muted-foreground">
            {rateLimitMessage(cooldown)}
          </div>
        ) : null}
        <div className="flex flex-col gap-2">
          <Label htmlFor="login-email">Email</Label>
          <Input
            id="login-email"
            ref={emailRef}
            type="email"
            autoComplete="email"
            aria-invalid={fieldError?.includes("email") ?? undefined}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@workshop.dev"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="login-password">Password</Label>
          <div className="relative">
            <Input
              id="login-password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              className="pr-10"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-1 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>
        {fieldError ? (
          <p className="text-sm text-destructive" role="alert">
            {fieldError}
          </p>
        ) : null}
        <Button
          type="submit"
          disabled={submitting || cooldown > 0}
          aria-disabled={submitting || cooldown > 0}
          data-key="enter"
        >
          {submitting ? "Signing in…" : "Continue"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Demo bench: <Kbd>demo@prodmax.dev</Kbd> · <Kbd>prodmax-demo</Kbd>
        </p>
      </form>
    </AuthLayout>
  );
}
