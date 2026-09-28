/** Blog posts are imported as text (the "Text" rule in wrangler.jsonc; the text-modules plugin in vitest.config.ts). */
declare module '*.md' {
  const text: string;
  export default text;
}
