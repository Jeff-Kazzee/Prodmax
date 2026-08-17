# Prodmax

AI-native issues + docs workspace. "The workshop, not the office."

Astro 5 SSR host + single React island SPA, Tailwind v4 + shadcn/ui,
SQLite via Drizzle (better-sqlite3, WAL), Vitest + Playwright.

## Commands

| Command             | Action                                        |
| :------------------ | :-------------------------------------------- |
| `npm install`       | Install dependencies                          |
| `npm run dev`       | Dev server at http://localhost:4321           |
| `npm run build`     | Production build to `./dist/`                 |
| `npm run preview`   | Preview the production build                  |
| `npm run check`     | `astro check` — zero errors required          |
| `npm test`          | Vitest unit tests                             |
| `npm run e2e`       | Playwright e2e (run `npm run build` first)    |
| `npm run db:generate` | Generate a Drizzle migration from the schema |
| `npm run db:migrate`  | Apply migrations to `data/prodmax.db`        |

See `AGENTS.md` and `planning/` for architecture, conventions, and the
build plan.
