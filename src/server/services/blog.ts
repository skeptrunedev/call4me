import type { Post } from '../lib/blog';
import { newId, now } from '../lib/ids';
import type { Messenger } from '../lib/messaging';

/**
 * Everything around a post that lives in the database: likes, comments, the newsletter
 * (subscribers with double opt-in), and which posts were mailed. Posts themselves are
 * files (lib/blog.ts). Ported from skillbay's services/blog.ts.
 */

/** A request the blog turns down, shown to the reader with its status. */
export class BlogError extends Error {
  constructor(
    message: string,
    public status: 400 | 404 | 409 | 429 | 502 = 400,
  ) {
    super(message);
  }
}

export interface Engagement {
  likes: number;
  comments: number;
}

export interface CommentRow {
  id: string;
  post_slug: string;
  name: string;
  email: string;
  body: string;
  status: 'live' | 'removed';
  ip: string | null;
  created_at: number;
}

export interface SubscriberRow {
  id: string;
  email: string;
  status: 'unverified' | 'active' | 'unsubscribed';
  token: string;
  ip: string | null;
  created_at: number;
  confirmed_at: number | null;
  unsubscribed_at: number | null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_COMMENTS_PER_IP_PER_HOUR = 10;
const MAX_SUBSCRIBES_PER_IP_PER_HOUR = 5;
const token = () => [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, '0')).join('');
const invalid = (msg: string) => new BlogError(msg, 400);
const notFound = (what: string) => new BlogError(`no such ${what}`, 404);

export function validateComment(raw: { name: string; email: string; body: string }) {
  const name = raw.name.trim();
  const email = raw.email.trim().toLowerCase();
  const body = raw.body.trim();
  if (name.length < 2 || name.length > 60) throw invalid('name: 2 to 60 characters');
  if (!EMAIL.test(email) || email.length > 200) throw invalid('email: not a valid address (it is never shown)');
  if (body.length < 3 || body.length > 4000) throw invalid('comment: 3 to 4000 characters');
  if (/https?:\/\/\S+.*https?:\/\/\S+.*https?:\/\/\S+/s.test(body)) throw invalid('comment: three links is the limit');
  return { name, email, body };
}

export function blog(db: D1Database, messenger: Messenger, appName: string, origin: string) {
  async function assertRate(table: 'blog_comments' | 'subscribers', ip: string | null, max: number, what: string) {
    if (!ip) return;
    const recent = await db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ip = ? AND created_at > ?`).bind(ip, now() - 3600 * 1000).first<{ n: number }>();
    if ((recent?.n ?? 0) >= max) throw new BlogError(`too many ${what} from this address; try again in an hour`, 429);
  }

  return {
    // ---- engagement

    /** Likes and live comments for every post in one pass. */
    async engagement(slugs: string[]): Promise<Map<string, Engagement>> {
      const out = new Map<string, Engagement>(slugs.map((s) => [s, { likes: 0, comments: 0 }]));
      if (slugs.length === 0) return out;
      const [likes, comments] = await Promise.all([
        db.prepare(`SELECT post_slug AS k, COUNT(*) AS n FROM blog_likes GROUP BY post_slug`).all<{ k: string; n: number }>(),
        db.prepare(`SELECT post_slug AS k, COUNT(*) AS n FROM blog_comments WHERE status = 'live' GROUP BY post_slug`).all<{ k: string; n: number }>(),
      ]);
      for (const r of likes.results) if (out.has(r.k)) out.get(r.k)!.likes = r.n;
      for (const r of comments.results) if (out.has(r.k)) out.get(r.k)!.comments = r.n;
      return out;
    },

    async liked(slug: string, reader: string): Promise<boolean> {
      return (await db.prepare(`SELECT 1 FROM blog_likes WHERE post_slug = ? AND reader = ?`).bind(slug, reader).first()) !== null;
    },

    /** Toggle: a reader likes a post once; a second press takes it back. Returns the new state. */
    async toggleLike(slug: string, reader: string): Promise<boolean> {
      if (await this.liked(slug, reader)) {
        await db.prepare(`DELETE FROM blog_likes WHERE post_slug = ? AND reader = ?`).bind(slug, reader).run();
        return false;
      }
      await db.prepare(`INSERT OR IGNORE INTO blog_likes (post_slug, reader, created_at) VALUES (?, ?, ?)`).bind(slug, reader, now()).run();
      return true;
    },

    // ---- comments

    comments: (slug: string) => db.prepare(`SELECT * FROM blog_comments WHERE post_slug = ? AND status = 'live' ORDER BY created_at ASC LIMIT 500`).bind(slug).all<CommentRow>().then((r) => r.results),

    async addComment(slug: string, raw: { name: string; email: string; body: string }, ip: string | null): Promise<CommentRow> {
      const input = validateComment(raw);
      await assertRate('blog_comments', ip, MAX_COMMENTS_PER_IP_PER_HOUR, 'comments');
      const id = newId();
      await db.prepare(`INSERT INTO blog_comments (id, post_slug, name, email, body, status, ip, created_at) VALUES (?, ?, ?, ?, ?, 'live', ?, ?)`).bind(id, slug, input.name, input.email, input.body, ip, now()).run();
      return (await db.prepare(`SELECT * FROM blog_comments WHERE id = ?`).bind(id).first<CommentRow>())!;
    },

    allComments: (limit = 200) => db.prepare(`SELECT * FROM blog_comments ORDER BY created_at DESC LIMIT ?`).bind(limit).all<CommentRow>().then((r) => r.results),

    async removeComment(id: string): Promise<void> {
      const r = await db.prepare(`UPDATE blog_comments SET status = 'removed' WHERE id = ?`).bind(id).run();
      if (!r.meta.changes) throw notFound('comment');
    },

    // ---- newsletter

    subscriberCount: () => db.prepare(`SELECT COUNT(*) AS n FROM subscribers WHERE status = 'active'`).first<{ n: number }>().then((r) => r?.n ?? 0),

    /** Start a subscription: create (or revive) the row and email the confirmation link. */
    async subscribe(rawEmail: string, ip: string | null): Promise<SubscriberRow> {
      const email = rawEmail.trim().toLowerCase();
      if (!EMAIL.test(email) || email.length > 200) throw invalid('email: not a valid address');
      const existing = await db.prepare(`SELECT * FROM subscribers WHERE email = ?`).bind(email).first<SubscriberRow>();
      if (existing?.status === 'active') return existing;
      await assertRate('subscribers', ip, MAX_SUBSCRIBES_PER_IP_PER_HOUR, 'sign-ups');
      let row = existing;
      if (!row) {
        const id = newId();
        await db.prepare(`INSERT INTO subscribers (id, email, status, token, ip, created_at) VALUES (?, ?, 'unverified', ?, ?, ?)`).bind(id, email, token(), ip, now()).run();
        row = (await db.prepare(`SELECT * FROM subscribers WHERE id = ?`).bind(id).first<SubscriberRow>())!;
      }
      await messenger.sendEmail(
        email,
        `confirm your ${appName} subscription`,
        [`click to get new ${appName} posts by email:`, '', `${origin}/blog/subscribe/confirm?token=${row.token}`, '', 'if you did not ask for this, ignore it and nothing happens.', '', `- ${appName}`].join('\n'),
      );
      return row;
    },

    /** The subscription behind a confirm or unsubscribe link. */
    async byToken(tok: string): Promise<SubscriberRow> {
      const row = tok ? await db.prepare(`SELECT * FROM subscribers WHERE token = ?`).bind(tok).first<SubscriberRow>() : null;
      if (!row) throw notFound('subscription');
      return row;
    },

    async confirm(tok: string): Promise<SubscriberRow> {
      const row = await this.byToken(tok);
      await db.prepare(`UPDATE subscribers SET status = 'active', confirmed_at = COALESCE(confirmed_at, ?), unsubscribed_at = NULL WHERE id = ?`).bind(now(), row.id).run();
      return { ...row, status: 'active' };
    },

    async unsubscribe(tok: string): Promise<void> {
      const row = await this.byToken(tok);
      await db.prepare(`UPDATE subscribers SET status = 'unsubscribed', unsubscribed_at = ? WHERE id = ?`).bind(now(), row.id).run();
    },

    activeSubscribers: () => db.prepare(`SELECT * FROM subscribers WHERE status = 'active' ORDER BY created_at`).all<SubscriberRow>().then((r) => r.results),

    sends: () => db.prepare(`SELECT * FROM blog_sends`).all<{ post_slug: string; sent_at: number; recipients: number }>().then((r) => r.results),

    /**
     * Mail a post to every active subscriber, once. Plain text: title, subtitle, the link,
     * and an unsubscribe link. Returns how many were sent.
     */
    async send(post: Post): Promise<number> {
      if (await db.prepare(`SELECT 1 FROM blog_sends WHERE post_slug = ?`).bind(post.slug).first()) throw new BlogError('this post was already sent', 409);
      const subs = await this.activeSubscribers();
      let sent = 0;
      for (const s of subs) {
        try {
          await messenger.sendEmail(
            s.email,
            `${post.title}`,
            [post.subtitle, '', `read it: ${origin}/blog/${post.slug}`, '', `by ${post.authors.map((a) => a.name).join(', ')} · ${post.readingMinutes} min read`, '', '---', `you get these because you subscribed at ${origin}/blog. unsubscribe: ${origin}/blog/unsubscribe?token=${s.token}`].join('\n'),
          );
          sent++;
        } catch (err) {
          console.error('newsletter send failed', s.email, String(err));
        }
      }
      await db.prepare(`INSERT INTO blog_sends (post_slug, sent_at, recipients) VALUES (?, ?, ?)`).bind(post.slug, now(), sent).run();
      return sent;
    },
  };
}
