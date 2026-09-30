import type { PostSource } from '../../server/lib/blog';

/**
 * Every post, in any order; the blog sorts by date. To publish, add a markdown file here
 * (`import launch from './call4me-is-open.md';`) and a line to the list. Its headline image
 * goes at public/static/blog/<slug>.svg.
 */
export const POST_SOURCES: PostSource[] = [];
