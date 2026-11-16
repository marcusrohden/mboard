import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/{domain,shared,main}/**/*.test.ts', 'src/renderer/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['src/renderer/**/*.test.tsx'],
        },
      },
    ],
  },
});
