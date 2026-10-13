/**
 * Who call4me is and who builds it, as schema.org structured data. The home page, the about
 * page and every blog post reference the same Organization and Person ids, so search and
 * answer engines resolve call4me as one entity with one founder.
 */
import { AUTHORS, type Author } from '../../content/blog/authors';
import { SITE } from './pages';

export const ORG_ID = `${SITE}/#org`;
export const LOGO_URL = `${SITE}/static/logo.png`;

/** Profiles of call4me itself. Each one was checked to answer HTTP 200 before it was listed. */
export const ORG_SAME_AS = [
  'https://github.com/skeptrunedev/call4me',
  'https://registry.modelcontextprotocol.io/v0.1/servers/io.github.skeptrunedev%2Fcall4me/versions/latest',
  'https://www.npmjs.com/package/call4me-ai-sdk',
];

export const personId = (author: Author) => `${SITE}/about#${author.key}`;

export const personLd = (author: Author) => ({
  '@type': 'Person',
  '@id': personId(author),
  name: author.name,
  alternateName: author.handle,
  url: `${SITE}/about`,
  image: `${SITE}${author.avatar}`,
  jobTitle: author.jobTitle,
  description: author.bio,
  worksFor: { '@id': ORG_ID },
  sameAs: author.sameAs,
});

export const FOUNDER = AUTHORS.nick;

export const ORG_LD = {
  '@type': 'Organization',
  '@id': ORG_ID,
  name: 'call4me',
  legalName: 'Skeptrune LLC',
  url: SITE,
  logo: { '@type': 'ImageObject', url: LOGO_URL, width: 512, height: 512 },
  email: 'me@call4.me',
  founder: { '@id': personId(FOUNDER) },
  sameAs: ORG_SAME_AS,
};
