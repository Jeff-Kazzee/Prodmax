/**
 * S-25 — 404 (R-49): "This bench doesn't exist." + back to inbox (§11).
 */
import { Link } from "react-router-dom";
import { Button } from "@island/components/ui/button";

export function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="font-mono text-sm text-muted-foreground">404</p>
      <h1 className="text-lg font-semibold tracking-tight">
        This bench doesn't exist.
      </h1>
      <Link to="/inbox">
        <Button variant="ghost">Back to inbox</Button>
      </Link>
    </div>
  );
}
