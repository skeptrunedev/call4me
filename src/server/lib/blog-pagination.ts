import type { Post } from './blog';

export const BLOG_PAGE_SIZE = 12;

/** A page includes its featured cards, so no post repeats when moving forward. */
export function paginatePosts(posts: Post[], requested?: string) {
  const total = posts.length;
  const totalPages = Math.max(1, Math.ceil(total / BLOG_PAGE_SIZE));
  const parsed = requested && /^[1-9]\d*$/.test(requested) ? Number(requested) : 1;
  const page = Math.min(Number.isSafeInteger(parsed) ? parsed : 1, totalPages);
  return { posts: posts.slice((page - 1) * BLOG_PAGE_SIZE, page * BLOG_PAGE_SIZE), page, totalPages, total };
}

/** Keep filters across page navigation; the first latest page has the clean blog URL. */
export function blogIndexPath({ page = 1, tab = 'latest', q = '' }: { page?: number; tab?: 'latest' | 'top'; q?: string } = {}) {
  const query = new URLSearchParams();
  if (tab !== 'latest') query.set('tab', tab);
  if (q) query.set('q', q);
  if (page > 1) query.set('page', String(page));
  return `/blog${query.size ? `?${query}` : ''}`;
}
