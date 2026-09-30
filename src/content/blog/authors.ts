/** Who writes here. Posts name authors by key in their frontmatter (`authors: nick`). */
export interface Author {
  key: string;
  name: string;
  handle: string;
  url: string;
  /** Square picture under /static. */
  avatar: string;
  bio: string;
}

export const AUTHORS: Record<string, Author> = {
  nick: {
    key: 'nick',
    name: 'Nick Khami',
    handle: '@skeptrune',
    url: 'https://x.com/skeptrune',
    avatar: '/static/nick.jpg',
    bio: 'builds call4me, the phone for your AI agent. software engineer; previously founded Trieve. email me@call4.me.',
  },
};
