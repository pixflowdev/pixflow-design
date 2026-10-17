import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./lib', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['specs/**/*.spec.ts', 'tests/**/*.test.ts'],
    server: {
      deps: {
        // This standalone Node entry embeds CLI templates; Vite rewriting can
        // corrupt their escapes. Exercise the executable compatibility source.
        external: [/bricks-handoff-cli\.mjs$/],
      },
    },
  },
});
