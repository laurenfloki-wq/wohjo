import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '.claude/**',
    ],
    coverage: {
      provider: 'v8',
      exclude: ['**/node_modules/**', '**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}', '.claude/**'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
