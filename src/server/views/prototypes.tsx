import type { FC } from "hono/jsx";
import { raw } from "hono/html";
import { CallCount } from "./layout";
import {
  HomeRecordings,
  HomeActions,
  HomeCredits,
  HomeSetup,
  HomeAbout,
  HomeStories,
  Faq,
  type HomePageProps,
} from "./public";

export const PROTOTYPE_STYLES = ["userjot", "bland", "vercel"] as const;
export type PrototypeStyle = (typeof PROTOTYPE_STYLES)[number];

const PhoneMark: FC = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M7 3H4a1 1 0 0 0-1 1c0 9.4 7.6 17 17 17a1 1 0 0 0 1-1v-3l-5-2-2 2a15 15 0 0 1-7-7l2-2-2-5Z"
      fill="currentColor"
    />
  </svg>
);

export const PrototypePage: FC<HomePageProps & { style: PrototypeStyle }> = (
  p,
) => (
  <>
    {raw("<!DOCTYPE html>")}
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>call4me | {p.style} prototype</title>
        <meta name="robots" content="noindex, nofollow" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="stylesheet" href="/static/prototypes/base.css" />
        <link rel="stylesheet" href={`/static/prototypes/${p.style}.css`} />
      </head>
      <body class={`prototype ${p.style}`}>
        <header class="site-header">
          <a
            class="brand"
            href={`/prototypes/${p.style}`}
            aria-label="call4me home"
          >
            <span class="brand-mark">
              <PhoneMark />
            </span>
            <span>call4me</span>
          </a>
          <nav class="main-nav" aria-label="main navigation">
            <a href="/">home</a>
            <a href="/examples">examples</a>
            <a href="/mcp">install mcp</a>
            <a href="/blog">blog</a>
            <a href="/rules">rules</a>
          </nav>
          <div class="header-actions">
            <a class="account-link" href={p.signedIn ? "/account" : "/login"}>
              {p.signedIn ? "my account" : "sign up / sign in"}
            </a>
            <a class="header-cta" href="#buy">
              add funds
            </a>
          </div>
        </header>
        <main>
          <section class="hero">
            <div class="hero-copy">
              <h1>
                <span>let your agents</span>{" "}
                <span class="headline-accent">make phone calls</span>
              </h1>
              <p class="hero-description">
                your AI agent makes phone calls for you
              </p>
              <HomeActions />
            </div>
            <div class="hero-emblem" aria-hidden="true">
              <PhoneMark />
            </div>
            <div class="hero-media">
              <HomeRecordings />
            </div>
          </section>
          <section class="content-section about-section">
            <HomeAbout />
          </section>
          <section class="content-section credits-section">
            <HomeCredits {...p} />
          </section>
          <section class="content-section setup-section">
            <HomeSetup {...p} />
          </section>
          <section class="content-section stories-section">
            <HomeStories />
          </section>
          <section class="content-section faq-section">
            <Faq {...p} />
          </section>
        </main>
        <footer class="site-footer">
          <a class="brand" href="/">
            call4me
          </a>
          <nav aria-label="footer navigation">
            <a href="/rules">rules</a>
            <a href="/privacy">privacy</a>
            <a href="/terms">terms</a>
            <a href="/support">support</a>
            <a href="/blog">blog</a>
            <a href="/voices">voices</a>
            <a href="/blog/rss.xml">RSS</a>
          </nav>
          <span>
            © call4me <CallCount separator=" / " />
          </span>
        </footer>
        <nav class="prototype-picker" aria-label="choose a prototype">
          {PROTOTYPE_STYLES.map((style) => (
            <a
              href={`/prototypes/${style}`}
              aria-current={style === p.style ? "page" : undefined}
            >
              {style === "userjot"
                ? "UserJot"
                : style === "bland"
                  ? "Bland"
                  : "Vercel"}
            </a>
          ))}
        </nav>
        <script src="/static/prototypes/interactions.js" defer></script>
      </body>
    </html>
  </>
);
