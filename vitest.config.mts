import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/{domain,shared,main}/**/*.test.ts'],
        },
      },
    ],
  },
});
