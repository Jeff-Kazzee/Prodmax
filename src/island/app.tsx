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
import { IssueViewsScreen } from "@island/features/issues";
import { IssuePage } from "@island/features/issue-detail";
import { NewIssueRoute } from "@island/features/issue-create";
import { TriageScreen } from "@island/features/triage";

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

const ISSUE_VIEW_PATHS = new Set([
  "/my-issues",
  "/issues",
  "/issues/list",
  "/issues/board",
  "/issues/table",
  "/v/:viewId",
  "/team/:teamKey/all",
  "/team/:teamKey/active",
  "/team/:teamKey/backlog",
  "/team/:teamKey/t/:slug",
  "/project/:id/board",
  "/project/:id/list",
]);

function shellElement(path: string, screen: string): React.ReactElement {
  if (ISSUE_VIEW_PATHS.has(path)) return <IssueViewsScreen />;
  if (path === "/issue/:identifier") return <IssuePage />;
  if (path === "/team/:teamKey/new") return <NewIssueRoute />;
  if (path === "/triage") return <TriageScreen />;
  return <ScreenPending screen={screen} />;
}

const router = createBrowserRouter([
  ...AUTH_ROUTES.map((r) => ({
    path: r.path,
    element: authElements[r.path],
  })),
  {
    element: <ShellLayout />,
    children: [
      ...REDIRECTS.map((r) => ({
        path: r.from,
        element: <Navigate to={r.to} replace />,
      })),
      { path: "/team/:teamKey", element: <TeamDefaultRedirect /> },
      ...SHELL_ROUTES.map((r) => ({
        path: r.path,
        element: shellElement(r.path, r.screen),
      })),
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
