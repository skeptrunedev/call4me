import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

/** Text modules (.md) as wrangler's "Text" rule serves them: a default string export. */
const textModules = {
  name: 'text-modules',
  enforce: 'pre' as const,
  load(id: string) {
    if (/\.md$/.test(id)) return `export default ${JSON.stringify(readFileSync(id, 'utf8'))};`;
    return null;
  },
};

export default defineConfig({
  plugins: [textModules],
  test: { environment: 'node', include: ['test/**/*.test.ts'] },
});
