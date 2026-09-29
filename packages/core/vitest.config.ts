import { defineProject } from 'vitest/config';

export default defineProject({
  define: { __VERSION__: JSON.stringify('0.0.0-test') },
  test: {
    name: 'core',
    include: ['test/**/*.test.ts'],
  },
});
