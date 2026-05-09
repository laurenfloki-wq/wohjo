import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
