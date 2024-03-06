import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./test/setup.ts'],
    pool: 'forks',
    coverage: {
      provider: 'istanbul',
    },
  },
});
