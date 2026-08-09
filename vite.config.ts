import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  preview: {
    allowedHosts: ['.trycloudflare.com'],
  },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    sourcemap: true,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'html'],
    },
  },
});
