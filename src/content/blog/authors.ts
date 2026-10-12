/** Who writes here. Posts name authors by key in their frontmatter (`authors: nick`). */
export interface Author {
  key: string;
  name: string;
  handle: string;
  url: string;
  /** Square picture under /static. */
  avatar: string;
  bio: string;
  /** schema.org jobTitle for the author's Person structured data. */
  jobTitle: string;
  /** Profiles that identify the same person, for search and answer engines (schema.org sameAs). */
  sameAs: string[];
}

export const AUTHORS: Record<string, Author> = {
  nick: {
    key: 'nick',
    name: 'Nick Khami',
    handle: '@skeptrune',
    url: 'https://x.com/skeptrune',
    avatar: '/static/nick.jpg',
    bio: 'founder of call4me, the phone for your AI agent. a y combinator founder who has raised $3.5M in venture capital and was head of engineering at a series b a16z startup. previously founded Trieve. email me@call4.me.',
    jobTitle: 'founder, call4me',
    sameAs: ['https://x.com/skeptrune', 'https://www.linkedin.com/in/nkhami/', 'https://github.com/skeptrunedev'],
  },
};
