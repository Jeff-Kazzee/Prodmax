/**
 * Island root — the single React island mounted by `src/pages/[...slug].astro`.
 * Registers the full ux-spec §2 route table (R-01…R-49): auth screens
 * standalone, everything else inside the app shell layout. Later modules
 * replace pending screens in place.
 */
import { Navigate, createBrowserRouter, RouterProvider, useParams } from "react-router-dom";
import { TooltipProvider } from "@island/components/ui/tooltip";
import { Toaster } from "@island/components/ui/sonner";
import { ScreenPending } from "@island/components/shell/screen-pending";
import { NotFound } from "@island/components/shell/not-found";
import { ShellLayout } from "@island/components/shell/shell-layout";
import { ShellStateProvider } from "@island/components/shell/shell-state";
import { SessionProvider } from "./app/session";
import { AUTH_ROUTES, REDIRECTS, SHELL_ROUTES } from "./app/routes";
import { PmxThemeProvider } from "@/lib/theme";
import Login from "./routes/Login";
import Signup from "./routes/Signup";
import ForgotPassword from "./routes/ForgotPassword";
import AcceptInvite from "./routes/AcceptInvite";

/** R-13: /team/:key → the team's default view. */
function TeamDefaultRedirect() {
  const { teamKey = "" } = useParams<{ teamKey: string }>();
  return <Navigate to={`/team/${teamKey}/all`} replace />;
}

const authElements: Record<string, React.ReactElement> = {
  "/login": <Login />,
  "/signup": <Signup />,
  "/forgot-password": <ForgotPassword />,
  "/invite/:code": <AcceptInvite />,
};

const router = createBrowserRouter([
  ...AUTH_ROUTES.map((r) => ({
    path: r.path,
    element: authElements[r.path],
  })),
  {
    element: <ShellLayout />,
    children: [
      // R-08 alias + R-13 team default-view redirect.
      ...REDIRECTS.map((r) => ({
        path: r.from,
        element: <Navigate to={r.to} replace />,
      })),
      { path: "/team/:teamKey", element: <TeamDefaultRedirect /> },
      // Screens owned by later modules → shared honest pending screen.
      ...SHELL_ROUTES.map((r) => ({
        path: r.path,
        element: <ScreenPending screen={r.screen} />,
      })),
      // R-49 — 404.
      { path: "*", element: <NotFound /> },
    ],
  },
]);

export default function App() {
  return (
    <PmxThemeProvider>
      <SessionProvider>
        <ShellStateProvider>
          <TooltipProvider delayDuration={400}>
            <RouterProvider router={router} />
          </TooltipProvider>
        </ShellStateProvider>
      </SessionProvider>
      {/* design-system §19: bottom-right, max 3 visible; durations in toast helper */}
      <Toaster position="bottom-right" visibleToasts={3} gap={8} />
    </PmxThemeProvider>
  );
}
