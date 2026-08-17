/**
 * Shared auth screen chrome (ux-spec §4.1/4.2, design-system §11.1):
 * split layout — brand panel left, form panel right. No canvas hero yet
 * (canvasui lands with the brand module); the panel is static and honest.
 */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export function AuthLayout({
  title,
  children,
  footer,
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex h-dvh">
      <div
        aria-hidden="true"
        className="hidden md:flex md:w-[55%] flex-col justify-between p-8"
        style={{
          background:
            "linear-gradient(to bottom, var(--secondary), var(--card))",
        }}
      >
        <div className="font-mono text-lg font-semibold tracking-[0.2em] text-foreground">
          PRODMAX
        </div>
        <p className="font-mono text-sm text-muted-foreground">
          Ship from the bench.
        </p>
      </div>
      <div className="flex w-full flex-col items-center justify-center bg-card p-6 md:w-[45%]">
        <div className="w-full max-w-sm">
          <h1 className="mb-1 text-2xl font-semibold tracking-tight">{title}</h1>
          <div className="mt-6">{children}</div>
          {footer ? <div className="mt-6 text-sm">{footer}</div> : null}
        </div>
      </div>
    </div>
  );
}

export function AuthFooterLinks() {
  return (
    <div className="flex flex-col gap-2 text-muted-foreground">
      <div>
        <Link to="/forgot-password" className="underline-offset-4 hover:underline">
          Forgot password?
        </Link>
      </div>
      <div>
        New here?{" "}
        <Link to="/signup" className="text-foreground underline-offset-4 hover:underline">
          Create account
        </Link>
      </div>
    </div>
  );
}
