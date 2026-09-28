import { Hono } from 'hono';
import { siteUrl } from '../lib/auth-options';
import { CALLBAY_SKILL_DESCRIPTION, CALLBAY_SKILL_NAME, callbaySkillMd } from '../lib/callbay-skill';
import { origin, type AppContext, type AppEnv } from '../lib/context';
import { SKILLS_INDEX_SCHEMA } from '../lib/discovery';
import { pricePerMinute } from '../services/dialer';

/**
 * Agent Skills Discovery (Cloudflare RFC v0.2.0) at /.well-known/agent-skills/, plus the
 * legacy v0.1.0 index at /.well-known/skills/ for older clients. callbay has one skill: its
 * own, how an agent installs callbay and places calls with it.
 */
export const discovery = new Hono<AppEnv>();

const HEADERS = { 'cache-control': 'public, max-age=300', 'access-control-allow-origin': '*', 'x-content-type-options': 'nosniff' };

const sha256 = async (text: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map((b) => b.toString(16).padStart(2, '0')).join('');

/** callbay's own skill, built from the request origin so the links point home. */
async function ownSkill(c: AppContext) {
  const md = callbaySkillMd(siteUrl(origin(c)), pricePerMinute(c.env));
  return { md, digest: `sha256:${await sha256(md)}` };
}

const markdown = (c: AppContext, md: string) => {
  const headers = { ...HEADERS, 'content-type': 'text/markdown; charset=utf-8' };
  return c.req.method === 'HEAD' ? new Response(null, { status: 200, headers }) : new Response(md, { status: 200, headers });
};

discovery.on(['GET', 'HEAD'], [`/agent-skills/${CALLBAY_SKILL_NAME}/SKILL.md`, `/skills/${CALLBAY_SKILL_NAME}/SKILL.md`], async (c) => markdown(c, (await ownSkill(c)).md));

discovery.on(['GET', 'HEAD'], '/agent-skills/index.json', async (c) => {
  const own = await ownSkill(c);
  const index = {
    $schema: SKILLS_INDEX_SCHEMA,
    skills: [{ name: CALLBAY_SKILL_NAME, type: 'skill-md', description: CALLBAY_SKILL_DESCRIPTION, url: `/.well-known/agent-skills/${CALLBAY_SKILL_NAME}/SKILL.md`, digest: own.digest }],
  };
  return c.body(JSON.stringify(index, null, 2) + '\n', 200, { ...HEADERS, 'content-type': 'application/json' });
});

// Legacy v0.1.0 shape: a files[] list fetched one by one from /.well-known/skills/<name>/<file>.
discovery.on(['GET', 'HEAD'], '/skills/index.json', (c) => {
  const index = { skills: [{ name: CALLBAY_SKILL_NAME, description: CALLBAY_SKILL_DESCRIPTION, files: ['SKILL.md'] }] };
  return c.body(JSON.stringify(index, null, 2) + '\n', 200, { ...HEADERS, 'content-type': 'application/json' });
});
