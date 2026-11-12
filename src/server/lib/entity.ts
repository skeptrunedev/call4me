/**
 * call4me as schema.org structured data. Every indexable page carries one graph (pageGraph, rendered
 * by the layout): the site, the company and its founder, the page and its breadcrumb, plus the
 * page's own nodes. The ids are shared, so search and answer engines resolve call4me as one site,
 * one company, one product and one founder on every page.
 */
import { AUTHORS, type Author } from '../../content/blog/authors';
import { dollars } from '../services/accounts';
import { MIN_TOPUP_CENTS } from '../services/topups';
import { CHATGPT_PLUGIN_URL, PAGES, SITE, SITE_DESCRIPTION, SITE_PITCH } from './pages';

export type JsonLdNode = Record<string, unknown>;

export const ref = (id: string) => ({ '@id': id });

export const SITE_ID = `${SITE}/#site`;
export const ORG_ID = `${SITE}/#org`;
export const APP_ID = `${SITE}/#app`;
export const BLOG_ID = `${SITE}/blog#blog`;
export const LOGO_URL = `${SITE}/static/logo.png`;

/** Profiles of call4me itself. Each one was checked to answer HTTP 200 and name call4me before it was listed. */
export const ORG_SAME_AS = [
  'https://github.com/skeptrunedev/call4me',
  'https://registry.modelcontextprotocol.io/v0.1/servers/io.github.skeptrunedev%2Fcall4me/versions/latest',
  'https://www.npmjs.com/package/call4me-ai-sdk',
  'https://www.tiktok.com/@trycall4me',
];

/** Directory listings of the app itself, checked the same way. */
const APP_SAME_AS = [
  CHATGPT_PLUGIN_URL,
  'https://registry.modelcontextprotocol.io/v0.1/servers/io.github.skeptrunedev%2Fcall4me/versions/latest',
  'https://glama.ai/mcp/servers/skeptrunedev/call4me',
  'https://mcp.so/servers/call4me',
];

export const personId = (author: Author) => `${SITE}/about#${author.key}`;

export const personLd = (author: Author): JsonLdNode => ({
  '@type': 'Person',
  '@id': personId(author),
  name: author.name,
  alternateName: author.handle,
  url: `${SITE}/about`,
  image: `${SITE}${author.avatar}`,
  jobTitle: author.jobTitle,
  description: author.bio,
  worksFor: ref(ORG_ID),
  sameAs: author.sameAs,
});

export const FOUNDER = AUTHORS.nick;

export const ORG_LD: JsonLdNode = {
  '@type': 'Organization',
  '@id': ORG_ID,
  name: 'call4me',
  legalName: 'Skeptrune LLC',
  url: `${SITE}/`,
  description: SITE_PITCH,
  logo: { '@type': 'ImageObject', url: LOGO_URL, width: 512, height: 512 },
  email: 'me@call4.me',
  contactPoint: { '@type': 'ContactPoint', contactType: 'customer support', email: 'me@call4.me', url: `${SITE}${PAGES.support.path}`, availableLanguage: 'en' },
  founder: ref(personId(FOUNDER)),
  sameAs: ORG_SAME_AS,
};

const WEBSITE_LD: JsonLdNode = {
  '@type': 'WebSite',
  '@id': SITE_ID,
  name: 'call4me',
  alternateName: 'call4.me',
  url: `${SITE}/`,
  description: SITE_DESCRIPTION,
  publisher: ref(ORG_ID),
  inLanguage: 'en',
};

/** What the app does and costs, in the words the site uses. The price is the live per-minute rate. */
export const appLd = (pricePerMinuteCents: number): JsonLdNode => {
  const price = (pricePerMinuteCents / 100).toFixed(2);
  return {
    '@type': 'SoftwareApplication',
    '@id': APP_ID,
    name: 'call4me',
    url: `${SITE}/`,
    description: SITE_PITCH,
    applicationCategory: 'CommunicationApplication',
    applicationSubCategory: 'AI phone call assistant',
    operatingSystem: 'Web',
    image: LOGO_URL,
    installUrl: `${SITE}${PAGES.mcp.path}`,
    softwareHelp: { '@type': 'CreativeWork', url: `${SITE}${PAGES.support.path}` },
    featureList: [
      'places real phone calls to businesses from ChatGPT, Claude Code, Codex, Claude Desktop, claude.ai and other MCP clients',
      'books and reschedules appointments and restaurant reservations',
      'gets through phone menus and waits on hold',
      'rings your phone and patches you in when a person picks up, or lets you listen in',
      'asks your agent mid-call when the business needs an answer only you know',
      'returns the outcome, the full transcript and the recording',
      `${dollars(pricePerMinuteCents)} a minute from pickup, half price on hold, unanswered calls free`,
      `prepaid credits from ${dollars(MIN_TOPUP_CENTS)} that never expire`,
      'a free US phone number',
    ],
    publisher: ref(ORG_ID),
    sameAs: APP_SAME_AS,
    offers: {
      '@type': 'Offer',
      url: `${SITE}${PAGES.pricing.path}`,
      price,
      priceCurrency: 'USD',
      priceSpecification: { '@type': 'UnitPriceSpecification', price, priceCurrency: 'USD', unitCode: 'MIN', referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode: 'MIN' } },
    },
  };
};

export interface PageGraphInput {
  /** Canonical URL; also the WebPage's @id, so a page node with this id extends the WebPage. */
  url: string;
  name: string;
  description: string;
  /** Absolute preview image URL. */
  image: string;
  published?: string;
  modified?: string;
  /** Crumbs between the home page and this one. */
  trail: { name: string; url: string }[];
  /** The page's own nodes. One whose @id matches a shared node is merged into it, its fields winning. */
  nodes: JsonLdNode[];
}

/** The one graph a page carries: shared site, company and founder nodes, the page and its breadcrumb, then the page's own nodes. */
export const pageGraph = ({ url, name, description, image, published, modified, trail, nodes }: PageGraphInput) => {
  const crumbs = url === `${SITE}/` ? [] : [{ name: 'call4me', url: `${SITE}/` }, ...trail, { name, url }];
  const breadcrumbId = `${url}#breadcrumb`;
  const shared: JsonLdNode[] = [
    WEBSITE_LD,
    ORG_LD,
    personLd(FOUNDER),
    {
      '@type': 'WebPage',
      '@id': url,
      url,
      name,
      description,
      isPartOf: ref(SITE_ID),
      publisher: ref(ORG_ID),
      inLanguage: 'en',
      primaryImageOfPage: { '@type': 'ImageObject', url: image },
      ...(crumbs.length > 0 ? { breadcrumb: ref(breadcrumbId) } : {}),
      ...(published ? { datePublished: published } : {}),
      ...(modified ? { dateModified: modified } : {}),
    },
    ...(crumbs.length > 0
      ? [{ '@type': 'BreadcrumbList', '@id': breadcrumbId, itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.url })) }]
      : []),
  ];
  const byId = new Map<string, JsonLdNode>();
  const anonymous: JsonLdNode[] = [];
  for (const node of [...shared, ...nodes]) {
    const id = node['@id'];
    if (typeof id === 'string') byId.set(id, { ...byId.get(id), ...node });
    else anonymous.push(node);
  }
  return { '@context': 'https://schema.org', '@graph': [...byId.values(), ...anonymous] };
};
