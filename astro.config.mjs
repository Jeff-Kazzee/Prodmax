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
  },
});
