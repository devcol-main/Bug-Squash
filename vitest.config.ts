import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // src/core 는 순수 로직이라 node 환경에서 돌린다.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    passWithNoTests: true,
  },
});
