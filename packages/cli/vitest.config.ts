// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'cli',
    include: ['test/**/*.test.ts'],
  },
});
