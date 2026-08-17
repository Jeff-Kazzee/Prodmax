import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { TooltipProvider } from "@island/components/ui/tooltip";
import { Toaster } from "@island/components/ui/sonner";
import Home from "./routes/Home";

/**
 * Island root — the single React island mounted by `src/pages/[...slug].astro`.
 * Client-side routing owns everything after hydration (architecture §1).
 */
const router = createBrowserRouter([
  {
    path: "/",
    element: <Home />,
  },
  // M2+ app-shell routes (issues, projects, docs, inbox, settings) land here.
]);

export default function App() {
  return (
    <TooltipProvider>
      <RouterProvider router={router} />
      <Toaster />
    </TooltipProvider>
  );
}
