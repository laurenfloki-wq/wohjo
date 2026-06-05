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
    // Post-cutover, every shift_events writer requires WLES_V1_ENABLED=true
    // (M1 fail-closed; M0 substrate constraint backs it). Unit tests run
    // against the same fail-closed gate so they exercise the v1 path
    // exactly as production does.
    env: {
      WLES_V1_ENABLED: 'true',
    },
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
