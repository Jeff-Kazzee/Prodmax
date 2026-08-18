// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [react()],
  vite: {
    // Cast: @tailwindcss/vite ships types built against a newer Vite than
    // the copy Astro 5 resolves, so the plugin shapes do not overlap.
    plugins: [/** @type {any} */ (tailwindcss())],
    // Dev runs from a subst-mapped drive (scripts/with-subst.mjs — the
    // workspace path contains an apostrophe). Vite's default realpath turns
    // module ids back into the real "C:/…Jeff's Agent Workshop/…" spelling,
    // and those /@fs URLs (spaces + apostrophe) fall through to the
    // [...slug] catch-all as HTML, so the island never hydrates. Keeping the
    // subst spelling in module ids fixes dev-mode hydration; the fs allow
    // list stays permissive for any straggling real-path requests.
    resolve: { preserveSymlinks: true },
    server: { fs: { allow: [process.cwd(), '../..'] } },
  },
});
