import type { FC } from 'hono/jsx';
import { raw } from 'hono/html';
import { RECOMMENDATIONS } from '../../content/blog/recommendations';
import { longDate, postDate, shortPostDate, type Post } from '../lib/blog';
import { SITE } from '../lib/pages';
import type { CommentRow, Engagement } from '../services/blog';
import { CopyBlock, Layout } from './layout';

/**
 * The blog, laid out the way a newsletter site is (featured posts with headline images,
 * a card list with authors and engagement counts, tabs, search, a subscribe box,
 * recommendations, an archive; on a post: hero image, dek, bylines with avatars, share
 * links, like button, comments, related posts) but drawn like the rest of call4me.
 * Ported from skillbay's views/blog.tsx.
 */

const AUTHOR_LD = (p: Post) => p.authors.map((a) => ({ '@type': 'Person', name: a.name, alternateName: a.handle, url: a.url, image: `${SITE}${a.avatar}` }));
const PUBLISHER = { '@type': 'Organization', name: 'call4me', url: SITE, logo: { '@type': 'ImageObject', url: `${SITE}/favicon.svg` } };

export type Tab = 'latest' | 'top';

/** Support checkout needs sign-in; anonymous links go directly to that sign-in page. */
const supportPath = (signedIn: boolean, next: string) => {
  const path = `/blog/support?next=${encodeURIComponent(next)}`;
  return signedIn ? path : `/login?next=${encodeURIComponent(path)}`;
};

const byline = (p: Post) => p.authors.map((a) => a.name).join(', ');

const Counts: FC<{ e: Engagement | undefined }> = ({ e }) =>
  e ? (
    <span class="muted small counts">
      {e.likes > 0 && <span title="likes">♥ {e.likes}</span>} {e.comments > 0 && <span title="comments">💬 {e.comments}</span>}
    </span>
  ) : null;

/** `anchor` marks the box that shows the result of a sign-up (the redirect lands on #subscribe). */
const SubscribeBox: FC<{ signedIn: boolean; count: number; next: string; compact?: boolean; anchor?: boolean; email?: string; error?: string; sent?: boolean }> = ({ signedIn, count, next, compact, anchor, email, error, sent }) => (
  <div class={`box subscribe${compact ? ' compact' : ''}`} id={anchor ? 'subscribe' : undefined}>
    <b>get new posts by email</b>
    {count > 0 && (
      <span class="muted">
        {' '}
        · {count} {count === 1 ? 'reader' : 'readers'} subscribed
      </span>
    )}
    {sent ? (
      <p class="ok">check your inbox: click the link we sent to confirm.</p>
    ) : (
      <form class="inline-form subscribe-form" method="post" action="/blog/subscribe">
        <input type="hidden" name="next" value={next} />
        <input type="email" name="email" placeholder="you@example.com" aria-label="email" value={email ?? ''} maxlength={200} required /> <button type="submit">subscribe</button>
        {error && <span class="err"> {error}</span>}
      </form>
    )}
    {!compact && (
      <div class="small muted">
        no tracking, no spam; one email per post, unsubscribe in one click. or use the <a href="/blog/feed.xml">atom feed</a>. posts marked <span class="badge">paid</span> need a{' '}
        <a href={supportPath(signedIn, next)}>supporter subscription</a> (monthly, cancel any time).
      </div>
    )}
  </div>
);

const Card: FC<{ p: Post; e: Engagement | undefined; featured?: boolean }> = ({ p, e, featured }) => (
  <div class={`card${featured ? ' featured' : ''}`}>
    <a href={`/blog/${p.slug}`} class="thumb">
      <img src={p.image} alt={p.imageAlt} loading={featured ? 'eager' : 'lazy'} width={featured ? 560 : 200} />
    </a>
    <div class="card-text">
      <a href={`/blog/${p.slug}`} class="card-title">
        {p.title}
      </a>
      <div class="dek">{p.subtitle}</div>
      <div class="small muted">
        {shortPostDate(p.date)} · {byline(p)}
        {p.paid && <span class="badge"> paid</span>} <Counts e={e} />
      </div>
    </div>
  </div>
);

export const BlogIndex: FC<{
  signedIn: boolean;
  posts: Post[];
  all: Post[];
  engagement: Map<string, Engagement>;
  tab: Tab;
  q: string;
  subscribers: number;
  subscribed?: 'sent' | string;
  agentPrompt: string;
}> = ({ signedIn, posts, all, engagement, tab, q, subscribers, subscribed, agentPrompt }) => {
  const featured = !q && tab === 'latest' ? all.slice(0, 3) : [];
  const rest = featured.length ? posts.filter((p) => !featured.includes(p)) : posts;
  return (
    <Layout
      title="blog: real calls to businesses, recorded"
      page="blog"
      signedIn={signedIn}
      meta={{
        jsonLd: {
          '@context': 'https://schema.org',
          '@type': 'Blog',
          name: 'call4me blog',
          url: `${SITE}/blog`,
          publisher: PUBLISHER,
          blogPost: all.map((p) => ({ '@type': 'BlogPosting', headline: p.title, url: `${SITE}/blog/${p.slug}`, datePublished: p.date, image: `${SITE}/og/blog/${p.slug}.png`, author: AUTHOR_LD(p) })),
        },
      }}
    >
      <div class="blog-head">
        <h1>call4me blog</h1>
        <CopyBlock id="agent-prompt" text={agentPrompt} rows={10} hidden />
        <p class="muted">notes on AI agents that make phone calls for you.</p>
        <SubscribeBox signedIn={signedIn} count={subscribers} next="/blog" compact anchor sent={subscribed === 'sent'} error={subscribed && subscribed !== 'sent' ? subscribed : undefined} />
      </div>

      {featured.length > 0 && (
        <div class="featured-row">
          {featured.map((p) => (
            <Card p={p} e={engagement.get(p.slug)} featured />
          ))}
        </div>
      )}

      <div class="tabs">
        {(['latest', 'top'] as Tab[]).map((t) => (
          <a href={`/blog?tab=${t}`} class={t === tab && !q ? 'on' : ''}>
            {t}
          </a>
        ))}
        <form class="inline-form" method="get" action="/blog">
          <input type="search" name="q" placeholder="search posts" aria-label="search posts" value={q} maxlength={100} /> <button type="submit">&gt;</button>
        </form>
        <a href="/blog/archive">archive</a>
        <a href="/blog/feed.xml">feed</a>
      </div>

      {q && (
        <p class="small muted">
          {posts.length} {posts.length === 1 ? 'post' : 'posts'} matching "{q}". <a href="/blog">clear</a>
        </p>
      )}
      {rest.length === 0 && featured.length === 0 && <p class="muted">{q ? 'no posts match that.' : 'no posts yet. subscribe above and the first one lands in your inbox.'}</p>}
      {rest.map((p) => (
        <Card p={p} e={engagement.get(p.slug)} />
      ))}

      <h3>recommendations</h3>
      <ul class="recs">
        {RECOMMENDATIONS.map((r) => (
          <li>
            <a href={r.url} rel="noopener">
              {r.name}
            </a>{' '}
            <span class="muted">- {r.blurb}</span>
          </li>
        ))}
      </ul>
      <SubscribeBox signedIn={signedIn} count={subscribers} next="/blog" />
    </Layout>
  );
};

export const BlogArchive: FC<{ signedIn: boolean; groups: { month: string; posts: Post[] }[]; engagement: Map<string, Engagement>; agentPrompt: string }> = ({ signedIn, groups, engagement, agentPrompt }) => (
  <Layout title="archive" page="blogArchive" signedIn={signedIn}>
    <p class="small">
      <a href="/blog">blog</a> &gt; archive
    </p>
    <h1>archive</h1>
    <CopyBlock id="agent-prompt" text={agentPrompt} rows={10} hidden />
    {groups.length === 0 && (
      <p class="muted">
        no posts yet. <a href="/blog">subscribe</a> to get the first one.
      </p>
    )}
    {groups.map((g) => (
      <>
        <h3>{g.month}</h3>
        <table class="rows">
          {g.posts.map((p) => (
            <tr>
              <td class="d">{p.date}</td>
              <td>
                <a href={`/blog/${p.slug}`}>{p.title}</a> <span class="muted">- {p.subtitle}</span> <Counts e={engagement.get(p.slug)} />
              </td>
            </tr>
          ))}
        </table>
      </>
    ))}
  </Layout>
);

const SHARE_SCRIPT = `
document.querySelectorAll('.copy-link').forEach(function (b) {
  b.addEventListener('click', function () {
    var url = location.origin + location.pathname;
    var done = function () { b.textContent = '[ copied ]'; setTimeout(function () { b.textContent = '[ copy link ]'; }, 1500); };
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(done); else { prompt('copy this link', url); }
  });
});`;

/** Timestamp links (lib/blog.ts linkTimestamps) seek the recording on the page instead of opening the file. */
const SEEK_SCRIPT = `
document.addEventListener('play', function (event) {
  if (!(event.target instanceof HTMLAudioElement)) return;
  document.querySelectorAll('audio').forEach(function (other) {
    if (other !== event.target) other.pause();
  });
}, true);
document.addEventListener('click', function (event) {
  var link = event.target instanceof Element && event.target.closest('a.seek');
  if (!link) return;
  var audio = document.querySelector('audio[src="' + link.dataset.audio + '"]');
  if (!audio) return;
  event.preventDefault();
  document.querySelectorAll('audio').forEach(function (other) { if (other !== audio) other.pause(); });
  audio.currentTime = Number(link.dataset.t);
  audio.play().catch(function (error) {
    // Switching recordings or pausing while playback starts cancels this request.
    if (error.name !== 'AbortError') throw error;
  });
  audio.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
});`;

const Share: FC<{ post: Post }> = ({ post }) => {
  const url = `${SITE}/blog/${post.slug}`;
  const text = `${post.title} - ${post.subtitle}`;
  return (
    <div class="share small" style="display:inline">
      share:{' '}
      <a href={`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`} rel="noopener">
        x
      </a>{' '}
      <form class="inline-form" method="get" action="https://www.linkedin.com/sharing/share-offsite/">
        <input type="hidden" name="url" value={url} />
        <button type="submit" class="linkbutton">linkedin</button>
      </form>{' '}
      <a href={`https://news.ycombinator.com/submitlink?u=${encodeURIComponent(url)}&t=${encodeURIComponent(post.title)}`} rel="noopener">
        hn
      </a>{' '}
      <a href={`mailto:?subject=${encodeURIComponent(post.title)}&body=${encodeURIComponent(`${post.subtitle}\n\n${url}`)}`}>email</a>{' '}
      <button type="button" class="linkbutton copy-link">
        [ copy link ]
      </button>
    </div>
  );
};

/** Put the subscribe box after the first section of the article, like a newsletter does. */
function splitAfterFirstSection(html: string): [string, string] {
  const second = html.indexOf('<h2', html.indexOf('<h2') + 1);
  return second > 0 ? [html.slice(0, second), html.slice(second)] : [html, ''];
}

export const BlogPost: FC<{
  signedIn: boolean;
  supporter: boolean;
  post: Post;
  older: Post | null;
  newer: Post | null;
  related: Post[];
  engagement: Engagement;
  liked: boolean;
  comments: CommentRow[];
  subscribers: number;
  unlocked: boolean;
  commentValues?: Record<string, string | undefined>;
  commentError?: string;
  subscribed?: 'sent' | string;
  agentPrompt: string;
}> = ({ signedIn, supporter, post, older, newer, related, engagement, liked, comments, subscribers, unlocked, commentValues = {}, commentError, subscribed, agentPrompt }) => {
  const v = (k: string) => commentValues[k] ?? '';
  const [first, more] = splitAfterFirstSection(post.html);
  const here = `/blog/${post.slug}`;
  return (
    <Layout
      title={post.seoTitle}
      page="blog"
      path={here}
      signedIn={signedIn}
      meta={{
        description: post.description,
        type: 'article',
        image: `/og/blog/${post.slug}.png`,
        imageAlt: post.imageAlt,
        published: `${post.date}T00:00:00Z`,
        modified: `${post.updated ?? post.date}T00:00:00Z`,
        jsonLd: {
          '@context': 'https://schema.org',
          '@type': 'BlogPosting',
          headline: post.title,
          alternativeHeadline: post.subtitle,
          description: post.description,
          url: `${SITE}${here}`,
          mainEntityOfPage: `${SITE}${here}`,
          datePublished: post.date,
          dateModified: post.updated ?? post.date,
          author: AUTHOR_LD(post),
          publisher: PUBLISHER,
          image: [`${SITE}/og/blog/${post.slug}.png`, `${SITE}${post.image}`],
          keywords: post.tags.join(', '),
          wordCount: post.body.split(/\s+/).filter(Boolean).length,
          inLanguage: 'en',
          isAccessibleForFree: !post.paid,
          ...(post.paid ? { hasPart: { '@type': 'WebPageElement', isAccessibleForFree: false, cssSelector: '.paid' } } : {}),
          interactionStatistic: [
            { '@type': 'InteractionCounter', interactionType: { '@type': 'LikeAction' }, userInteractionCount: engagement.likes },
            { '@type': 'InteractionCounter', interactionType: { '@type': 'CommentAction' }, userInteractionCount: engagement.comments },
          ],
          commentCount: engagement.comments,
        },
      }}
    >
      <p class="small">
        <a href="/blog">blog</a> &gt; {post.slug}
      </p>
      <article class="post">
        <h1>{post.title}</h1>
        <p class="dek">{post.subtitle}</p>
        <CopyBlock id="agent-prompt" text={agentPrompt} rows={10} hidden />
        <div class="byline">
          {post.authors.map((a) => (
            <a href={a.url} rel="author me noopener" class="author">
              <img src={a.avatar} alt="" width={28} height={28} /> {a.name}
            </a>
          ))}
          <span class="muted small">
            {' '}
            · <time datetime={post.date}>{postDate(post.date)}</time>
            {post.updated && (
              <>
                {' '}
                · updated <time datetime={post.updated}>{postDate(post.updated)}</time>
              </>
            )}{' '}
            · {post.readingMinutes} min read{post.paid && <span class="badge"> paid</span>}
          </span>
        </div>
        <div class="actions-row small">
          <form class="inline-form" method="post" action={`${here}/like`}>
            <button type="submit" class={`linkbutton like${liked ? ' on' : ''}`} title={liked ? 'you liked this; press to take it back' : 'like this post'}>
              [ {liked ? '♥' : '♡'} {engagement.likes} ]
            </button>
          </form>{' '}
          <a href="#comments">[ 💬 {engagement.comments} ]</a> <Share post={post} />
        </div>
        <figure class="hero">
          <img src={post.image} alt={post.imageAlt} width={1200} height={630} />
          {post.imageCaption && <figcaption>{post.imageCaption}</figcaption>}
        </figure>
        {post.sections.length > 2 && (
          <nav class="toc small" aria-label="sections">
            {post.sections.map((s, i) => (
              <>
                {i > 0 && ' · '}
                <a href={`#${s.id}`}>{s.text}</a>
              </>
            ))}
          </nav>
        )}
        {raw(first)}
        {more && (
          <>
            <SubscribeBox signedIn={signedIn} count={subscribers} next={here} compact />
            {raw(more)}
          </>
        )}
        {post.paid &&
          (unlocked ? (
            <div class="paid">{raw(post.paidHtml)}</div>
          ) : (
            <div class="box paywall">
              <b>the rest of this post is for supporters.</b>
              <p class="small">
                {signedIn ? (
                  <>
                    <a href={supportPath(signedIn, here)}>become a supporter</a> to read the whole thing.
                  </>
                ) : (
                  <>
                    <a href={`/login?next=${here}`}>sign in</a> if you already support call4me, or <a href={supportPath(signedIn, here)}>become a supporter</a>.
                  </>
                )}
              </p>
            </div>
          ))}
        <p class="small muted tags">
          {post.tags.map((t, i) => (
            <>
              {i > 0 && ' · '}
              <a href={`/blog?q=${encodeURIComponent(t)}`}>{t}</a>
            </>
          ))}
        </p>
        <div class="actions-row small">
          <form class="inline-form" method="post" action={`${here}/like`}>
            <button type="submit" class={`linkbutton like${liked ? ' on' : ''}`}>
              [ {liked ? '♥' : '♡'} {engagement.likes} ]
            </button>
          </form>{' '}
          <Share post={post} />
        </div>
      </article>

      <div class="author-box">
        {post.authors.map((a) => (
          <p>
            <img src={a.avatar} alt="" width={48} height={48} />{' '}
            <b>
              <a href={a.url} rel="author noopener">
                {a.name}
              </a>
            </b>{' '}
            <span class="muted">{a.handle}</span>
            <span class="small bio">{a.bio}</span>
          </p>
        ))}
      </div>

      <SubscribeBox signedIn={signedIn} count={subscribers} next={here} anchor sent={subscribed === 'sent'} error={subscribed && subscribed !== 'sent' ? subscribed : undefined} />
      {supporter && (
        <p class="small muted">
          you support call4me, thank you. <a href="/blog/support/manage">manage the subscription</a>.
        </p>
      )}

      <h2 id="comments">
        {engagement.comments} {engagement.comments === 1 ? 'comment' : 'comments'}
      </h2>
      {comments.map((c) => (
        <div class="comment" id={`c-${c.id}`}>
          <b>{c.name}</b> <span class="small muted">{longDate(c.created_at)}</span>
          <pre class="wrap">{c.body}</pre>
        </div>
      ))}
      {commentError && <p class="err">{commentError}</p>}
      <form class="form" method="post" action={`${here}/comments`}>
        <div class="row">
          <label for="c-name">name</label>
          <input type="text" id="c-name" name="name" value={v('name')} maxlength={60} required />
        </div>
        <div class="row">
          <label for="c-email">email (never shown)</label>
          <input type="email" id="c-email" name="email" value={v('email')} maxlength={200} required />
        </div>
        <div class="row" aria-hidden="true" style="position:absolute;left:-9999px">
          <label for="c-website">website</label>
          <input type="text" id="c-website" name="website" tabindex={-1} autocomplete="off" />
        </div>
        <div class="row">
          <label for="c-body">comment</label>
          <textarea id="c-body" name="body" rows={4} required>
            {v('body')}
          </textarea>
        </div>
        <div class="actions">
          <button type="submit">post comment</button>
        </div>
      </form>

      {related.length > 0 && (
        <>
          <h3>read next</h3>
          {related.map((p) => (
            <Card p={p} e={undefined} />
          ))}
        </>
      )}
      <p class="small">
        {newer && (
          <>
            newer: <a href={`/blog/${newer.slug}`}>{newer.title}</a>
            <br />
          </>
        )}
        {older && (
          <>
            older: <a href={`/blog/${older.slug}`}>{older.title}</a>
            <br />
          </>
        )}
        <a href="/blog">all posts</a> · <a href="/blog/archive">archive</a> · <a href="/blog/feed.xml">atom feed</a>
      </p>
      <script>{raw(SHARE_SCRIPT)}</script>
      <script>{raw(SEEK_SCRIPT)}</script>
    </Layout>
  );
};

/** The button behind a confirm or unsubscribe link (the change is a POST; see routes/blog.tsx). */
export const SubscribeConfirm: FC<{ signedIn: boolean; action: string; token: string; title: string; text: string; button: string }> = ({ signedIn, action, token, title, text, button }) => (
  <Layout title={title} signedIn={signedIn}>
    <h1>{title}</h1>
    <p>{text}</p>
    <form method="post" action={action} class="inline">
      <input type="hidden" name="token" value={token} />
      <button type="submit">{button}</button>
    </form>
  </Layout>
);

export const SubscribeResult: FC<{ signedIn: boolean; title: string; text: string; next?: string }> = ({ signedIn, title, text, next = '/blog' }) => (
  <Layout title={title} signedIn={signedIn}>
    <h1>{title}</h1>
    <p>{text}</p>
    <p>
      <a href={next}>{next === '/blog' ? 'back to the blog' : 'back to the post'}</a>
    </p>
  </Layout>
);

export const BlogAdmin: FC<{
  posts: Post[];
  sends: Map<string, { sent_at: number; recipients: number }>;
  subscribers: number;
  comments: CommentRow[];
  flash?: string;
}> = ({ posts, sends, subscribers, comments, flash }) => (
  <Layout title="blog admin" signedIn>
    <h1>blog</h1>
    {flash && <p class="ok">{flash}</p>}
    <p>
      {subscribers} active {subscribers === 1 ? 'subscriber' : 'subscribers'}. posts are files in <code>src/content/blog</code>; this page mails them out and moderates comments.
    </p>
    <h2>posts</h2>
    {posts.length === 0 && <p class="muted">no posts yet.</p>}
    <table class="rows">
      {posts.map((p) => {
        const s = sends.get(p.slug);
        return (
          <tr>
            <td class="d">{p.date}</td>
            <td>
              <a href={`/blog/${p.slug}`}>{p.title}</a>
            </td>
            <td class="c">
              {s ? (
                <span class="muted">
                  sent {longDate(s.sent_at)} to {s.recipients}
                </span>
              ) : (
                <form method="post" action={`/admin/blog/${p.slug}/send`} style="display:inline">
                  <button type="submit" class="linkbutton">
                    [ send to {subscribers} subscribers ]
                  </button>
                </form>
              )}
            </td>
          </tr>
        );
      })}
    </table>
    <h2>comments</h2>
    {comments.length === 0 && <p class="muted">no comments yet.</p>}
    <table class="rows">
      {comments.map((c) => (
        <tr>
          <td class="d">{longDate(c.created_at)}</td>
          <td>
            <a href={`/blog/${c.post_slug}#c-${c.id}`}>{c.post_slug}</a>: <b>{c.name}</b> <span class="muted">&lt;{c.email}&gt;</span>
            <br />
            <span class="small">{c.body.slice(0, 300)}</span>
          </td>
          <td class="c">
            {c.status === 'live' ? (
              <form method="post" action={`/admin/blog/comments/${c.id}/remove`} style="display:inline">
                <button type="submit" class="linkbutton">
                  [ remove ]
                </button>
              </form>
            ) : (
              <span class="muted">removed</span>
            )}
          </td>
        </tr>
      ))}
    </table>
  </Layout>
);
