export default {
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/text-replacement-integrity.test.ts'],
    server: {
      deps: {
        // Exercise the standalone Node compatibility entry unchanged, without
        // Vite rewriting its embedded CLI templates or dynamic imports.
        external: [/bricks-handoff-cli\.mjs$/],
      },
    },
  },
};
