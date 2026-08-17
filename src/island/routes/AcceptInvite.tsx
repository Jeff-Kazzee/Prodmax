/**
 * S-04 Accept invite (R-04; FM-007): real accept flow via POST
 * /api/invites/accept. No GET resolve-by-code endpoint exists yet, so the
 * card cannot preview the workspace name — it shows the code honestly.
 * Logged-in: one-click accept. Logged-out: account fields + accept.
 * Invalid/expired/revoked → explicit card, never silent (AU-20).
 */
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { TriangleAlert } from "lucide-react";
import { Button } from "@island/components/ui/button";
import { Input } from "@island/components/ui/input";
import { Label } from "@island/components/ui/label";
import { Kbd } from "@island/components/ui/kbd";
import { useSession } from "@island/app/session";
import { ApiError, apiPost } from "@island/app/api";
import { toastApiError, toastOk } from "@island/app/toast";
import { AuthLayout } from "./auth-layout";

interface AcceptResponse {
  ok: boolean;
  workspaceId: string;
}

export default function AcceptInvite() {
  const { code = "" } = useParams<{ code: string }>();
  const session = useSession();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [invalid, setInvalid] = useState<"expired" | "conflict" | "auth" | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const authed = session.status === "authed";

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setInvalid(null);
    try {
      const body = authed
        ? { token: code }
        : { token: code, name: name.trim() || undefined, email, password };
      const res = await apiPost<AcceptResponse>("/api/invites/accept", body);
      toastOk("Invite accepted — welcome aboard.");
      await session.refresh();
      if (res.workspaceId) session.switchWorkspace(res.workspaceId);
      navigate("/", { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === "NOT_FOUND") {
        setInvalid("expired"); // revoked and expired share honest wording (CP-06)
      } else if (err instanceof ApiError && err.code === "CONFLICT") {
        setInvalid("conflict");
      } else if (err instanceof ApiError && err.code === "AUTH_REQUIRED") {
        setInvalid("auth");
      } else {
        toastApiError(err);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (invalid === "expired") {
    return (
      <AuthLayout
        title="This invite expired or was revoked."
        footer={
          <div className="text-muted-foreground">
            Ask for a new one — your admin can resend it from{" "}
            <span className="font-mono text-xs">Settings → Members</span>.{" "}
            <Link to="/login" className="text-foreground underline-offset-4 hover:underline">
              Back to sign in
            </Link>
          </div>
        }
      >
        <div className="flex items-start gap-2 rounded-md border p-3 text-sm text-muted-foreground">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            Invite code <Kbd>{code.slice(0, 8)}…</Kbd> is no longer valid.
          </span>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Join a workspace"
      footer={
        <div className="text-muted-foreground">
          Have an account already?{" "}
          <Link to="/login" className="text-foreground underline-offset-4 hover:underline">
            Sign in first
          </Link>
        </div>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        {invalid === "conflict" ? (
          <p role="alert" className="text-sm text-destructive">
            You're already a member of this workspace.
          </p>
        ) : null}
        {invalid === "auth" ? (
          <p role="alert" className="text-sm text-destructive">
            This email has an account — provide its password, or sign in first.
          </p>
        ) : null}
        <p className="text-sm text-muted-foreground">
          You've been invited to join a workspace. Code{" "}
          <Kbd>{code.slice(0, 10)}</Kbd>
        </p>
        {!authed ? (
          <>
            <div className="flex flex-col gap-2">
              <Label htmlFor="invite-name">Your name</Label>
              <Input
                id="invite-name"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="invite-password">Password</Label>
              <Input
                id="invite-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">8+ characters.</p>
            </div>
          </>
        ) : null}
        <Button type="submit" disabled={submitting} aria-disabled={submitting}>
          {submitting ? "Accepting…" : "Accept invite"}
        </Button>
      </form>
    </AuthLayout>
  );
}
