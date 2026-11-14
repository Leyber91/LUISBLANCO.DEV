import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['os/test/**/*.test.ts'],
    environment: 'happy-dom',
    environmentOptions: { happyDOM: { url: 'http://127.0.0.1:8833/labs/index.html' } },
    setupFiles: ['fake-indexeddb/auto', './os/test/setup.ts'],
    restoreMocks: true,
  },
});
