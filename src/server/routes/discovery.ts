import { Hono } from 'hono';
import { siteUrl } from '../lib/auth-options';
import { CALL4ME_SKILL_DESCRIPTION, CALL4ME_SKILL_NAME, call4meSkillMd, LEGACY_SKILL_NAME } from '../lib/call4me-skill';
import { origin, type AppContext, type AppEnv } from '../lib/context';
import { SKILLS_INDEX_SCHEMA } from '../lib/discovery';
import { pricePerMinute } from '../services/dialer';

/**
 * Agent Skills Discovery (Cloudflare RFC v0.2.0) at /.well-known/agent-skills/, plus the
 * legacy v0.1.0 index at /.well-known/skills/ for older clients. call4me has one skill: its
 * own, how an agent installs call4me and places calls with it.
 */
export const discovery = new Hono<AppEnv>();

const HEADERS = { 'cache-control': 'public, max-age=300', 'access-control-allow-origin': '*', 'x-content-type-options': 'nosniff' };

const sha256 = async (text: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map((b) => b.toString(16).padStart(2, '0')).join('');

/** call4me's own skill, built from the request origin so the links point home. */
async function ownSkill(c: AppContext) {
  const md = call4meSkillMd(siteUrl(origin(c)), pricePerMinute(c.env));
  return { md, digest: `sha256:${await sha256(md)}` };
}

const markdown = (c: AppContext, md: string) => {
  const headers = { ...HEADERS, 'content-type': 'text/markdown; charset=utf-8' };
  return c.req.method === 'HEAD' ? new Response(null, { status: 200, headers }) : new Response(md, { status: 200, headers });
};

discovery.on(['GET', 'HEAD'], [`/agent-skills/${CALL4ME_SKILL_NAME}/SKILL.md`, `/skills/${CALL4ME_SKILL_NAME}/SKILL.md`], async (c) => markdown(c, (await ownSkill(c)).md));

// Links saved before the rename (skills installed as "callbay") keep working.
for (const dir of ['agent-skills', 'skills']) discovery.on(['GET', 'HEAD'], `/${dir}/${LEGACY_SKILL_NAME}/SKILL.md`, (c) => c.redirect(`/.well-known/${dir}/${CALL4ME_SKILL_NAME}/SKILL.md`, 301));

discovery.on(['GET', 'HEAD'], '/agent-skills/index.json', async (c) => {
  const own = await ownSkill(c);
  const index = {
    $schema: SKILLS_INDEX_SCHEMA,
    skills: [{ name: CALL4ME_SKILL_NAME, type: 'skill-md', description: CALL4ME_SKILL_DESCRIPTION, url: `/.well-known/agent-skills/${CALL4ME_SKILL_NAME}/SKILL.md`, digest: own.digest }],
  };
  return c.body(JSON.stringify(index, null, 2) + '\n', 200, { ...HEADERS, 'content-type': 'application/json' });
});

// Legacy v0.1.0 shape: a files[] list fetched one by one from /.well-known/skills/<name>/<file>.
discovery.on(['GET', 'HEAD'], '/skills/index.json', (c) => {
  const index = { skills: [{ name: CALL4ME_SKILL_NAME, description: CALL4ME_SKILL_DESCRIPTION, files: ['SKILL.md'] }] };
  return c.body(JSON.stringify(index, null, 2) + '\n', 200, { ...HEADERS, 'content-type': 'application/json' });
});
