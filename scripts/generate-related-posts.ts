import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RELATED_TOPICS } from './related-topics';
import { parseFrontmatter } from '../src/server/lib/blog';
import { RELATED_INDEX, RELATED_METADATA } from '../src/content/blog/related.generated';

const contentDir = new URL('../src/content/blog/', import.meta.url);
const outputFile = new URL('../src/content/blog/related.generated.ts', import.meta.url);
const model = 'onnx-community/embeddinggemma-300m-ONNX';
const revision = '5090578d9565bb06545b4552f76e6bc2c93e4a66';
const minimumSimilarity = 0.6;
const prompt = 'task: sentence similarity | query: ';
const recipe = 'concise-title-specific-tags-shared-editorial-subject-v1';
type ArticleInput = { slug: string; text: string; topics: string[] };

/** Embed concise subjects instead of subtitles dominated by our shared calling workflow. */
export async function articleInputs(): Promise<ArticleInput[]> {
  const files = (await readdir(contentDir)).filter((file) => file.endsWith('.md')).sort();
  const articles = await Promise.all(files.map(async (file) => {
    const { meta } = parseFrontmatter(await readFile(new URL(file, contentDir), 'utf8'));
    if (!meta.title || !(meta.subtitle || meta.description)) throw new Error(`Missing article metadata: ${file}`);
    return { slug: file.slice(0, -3), title: meta.seoTitle ?? meta.title, tags: (meta.tags ?? '').split(',').map((tag) => tag.trim()).filter(Boolean) };
  }));
  const slugs = new Set(articles.map((article) => article.slug));
  for (const slug of Object.keys(RELATED_TOPICS)) if (!slugs.has(slug)) throw new Error(`Unknown article in subject taxonomy: ${slug}`);
  for (const slug of slugs) if (!RELATED_TOPICS[slug]?.length) throw new Error(`Missing editorial subject: ${slug}`);
  const frequency = new Map<string, number>();
  for (const article of articles) for (const tag of new Set(article.tags)) frequency.set(tag, (frequency.get(tag) ?? 0) + 1);
  return articles.map((article) => ({
    slug: article.slug,
    topics: RELATED_TOPICS[article.slug]!,
    text: `${article.title}\n${article.tags.filter((tag) => frequency.get(tag)! <= articles.length / 10).join(', ')}`.replace(/\s+/g, ' ').trim(),
  }));
}

export function sourceHash(inputs: ArticleInput[]): string {
  return createHash('sha256').update(JSON.stringify(inputs)).digest('hex');
}

export async function checkRelatedIndex(): Promise<void> {
  const inputs = await articleInputs();
  if (RELATED_METADATA.sourceHash !== sourceHash(inputs) || RELATED_METADATA.model !== model
    || RELATED_METADATA.dtype !== 'q8' || RELATED_METADATA.revision !== revision || RELATED_METADATA.prompt !== prompt || RELATED_METADATA.recipe !== recipe || RELATED_METADATA.minimumSimilarity !== minimumSimilarity) {
    throw new Error('Related articles are out of date. Run npm run blog:related, review the matches, and commit the generated index.');
  }
  const slugs = new Set(inputs.map((input) => input.slug));
  if (Object.keys(RELATED_INDEX).length !== slugs.size) throw new Error('Related article index has an incorrect article count.');
  const bySlug = new Map(inputs.map((input) => [input.slug, input]));
  for (const slug of slugs) {
    const matches = RELATED_INDEX[slug];
    if (!matches) throw new Error(`Missing related article entry: ${slug}`);
    if (matches.length > 8) throw new Error(`Too many related articles: ${slug}`);
    const seen = new Set<string>();
    let previous = Infinity;
    for (const match of matches) {
      if (!slugs.has(match.slug) || match.slug === slug || seen.has(match.slug)
        || !bySlug.get(slug)!.topics.some((topic) => bySlug.get(match.slug)?.topics.includes(topic))
        || !Number.isFinite(match.similarity) || match.similarity < minimumSimilarity || match.similarity > previous) {
        throw new Error(`Invalid related article match: ${slug} -> ${match.slug}`);
      }
      previous = match.similarity;
      seen.add(match.slug);
    }
  }
}

async function generate(): Promise<void> {
  const inputs = await articleInputs();
  const { env, AutoModel, AutoTokenizer } = await import('@huggingface/transformers');
  env.cacheDir = join(homedir(), '.cache', 'call4me', 'transformers');
  console.log(`Embedding ${inputs.length} article subjects locally with ${model} on CPU.`);
  const tokenizer = await AutoTokenizer.from_pretrained(model, { revision });
  const extractor = await AutoModel.from_pretrained(model, { revision, device: 'cpu', dtype: 'q8' });
  try {
    const vectors: number[][] = [];
    for (let i = 0; i < inputs.length; i += 8) {
      const tokens = await tokenizer(inputs.slice(i, i + 8).map((input) => `${prompt}${input.text}`), { padding: true });
      const output = await extractor(tokens);
      for (const vector of output.sentence_embedding.tolist() as number[][]) {
        const norm = Math.hypot(...vector);
        if (!Number.isFinite(norm) || norm === 0) throw new Error('Invalid article embedding');
        vectors.push(vector.map((value) => value / norm));
      }
      console.log(`Embedded ${Math.min(i + 8, inputs.length)}/${inputs.length}.`);
    }
    const index = Object.fromEntries(inputs.map((input, i) => [input.slug, inputs
      .map((other, j) => ({ slug: other.slug, eligible: input.topics.some((topic) => other.topics.includes(topic)), similarity: vectors[i]!.reduce((sum, value, k) => sum + value * vectors[j]![k]!, 0) }))
      .filter((match) => match.eligible && match.slug !== input.slug && match.similarity >= minimumSimilarity)
      .sort((a, b) => b.similarity - a.similarity || a.slug.localeCompare(b.slug))
      .slice(0, 8)
      .map((match) => ({ slug: match.slug, similarity: Number(match.similarity.toFixed(6)) }))]));
    const metadata = { model, revision, dtype: 'q8', prompt, recipe, minimumSimilarity, sourceHash: sourceHash(inputs) };
    await writeFile(outputFile, `// Generated by npm run blog:related. Review matches before publishing.\n`
      + `export const RELATED_METADATA = ${JSON.stringify(metadata, null, 2)};\n\n`
      + `export const RELATED_INDEX: Record<string, { slug: string; similarity: number }[]> = ${JSON.stringify(index, null, 2)};\n`);
    console.log(`Saved local semantic matches for ${inputs.length} articles.`);
  } finally {
    await extractor.dispose();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length === 0) await generate();
  else if (args.length === 1 && args[0] === '--check') {
    await checkRelatedIndex();
    console.log('Related article index matches current article subjects.');
  } else throw new Error('Usage: npm run blog:related [-- --check]');
}
