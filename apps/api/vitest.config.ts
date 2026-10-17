import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Serialize test files so database tests sharing the test database do not race on truncation
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
