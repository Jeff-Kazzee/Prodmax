import { useState } from "react";
import { Button } from "@island/components/ui/button";

/** Placeholder home route — proves the island mounts and hydrates. */
export default function Home() {
  const [count, setCount] = useState(0);

  return (
    <main className="flex h-dvh flex-col items-center justify-center gap-6">
      <h1 className="text-3xl font-semibold tracking-tight">Prodmax</h1>
      <p className="font-mono text-sm text-muted-foreground">
        the workshop, not the office.
      </p>
      <Button onClick={() => setCount((n) => n + 1)}>
        Hydration check: {count}
      </Button>
    </main>
  );
}
