import { readFile, writeFile } from "node:fs/promises";
import { applyEdits, modify, parse } from "jsonc-parser";

// Creates (or verifies) the Cloudflare Access app for dash.call4.me with an allow policy for exactly
// ALLOWED_EMAILS from wrangler.jsonc, then writes the app's audience tag back into wrangler.jsonc.
// Existing organization settings and identity providers are never changed.
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!account || !token) throw new Error("Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN locally.");
const base = `https://api.cloudflare.com/client/v4/accounts/${account}/access`;
async function api(path, method = "GET", body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok || !data.success)
    throw new Error(`${method} ${path}: ${response.status} ${JSON.stringify(data.errors)}. The token needs Access: Apps and Policies Write.`);
  return data.result;
}

const source = new URL("../wrangler.jsonc", import.meta.url);
const text = await readFile(source, "utf8");
const config = parse(text);
const domain = config.routes[0].pattern;
const emails = config.vars.ALLOWED_EMAILS.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean).sort();

const organization = await api("/organizations");
if (!organization?.auth_domain) throw new Error("Set up a Cloudflare Zero Trust organization in the account first.");
const policy = {
  name: "call4me founders",
  decision: "allow",
  precedence: 1,
  include: emails.map((email) => ({ email: { email } })),
  require: [],
  exclude: [],
};
let application = (await api("/apps")).find((app) => app.domain === domain);
if (!application) {
  application = await api("/apps", "POST", {
    name: "call4me metrics",
    type: "self_hosted",
    domain,
    session_duration: "730h",
    app_launcher_visible: true,
    policies: [policy],
  });
}
const policies = await api(`/apps/${application.id}/policies`);
const allowed = (policies[0]?.include ?? []).map((i) => i.email?.email?.toLowerCase()).sort();
if (
  policies.length !== 1 ||
  policies[0].decision !== "allow" ||
  JSON.stringify(allowed) !== JSON.stringify(emails) ||
  policies[0].require?.length ||
  policies[0].exclude?.length
)
  throw new Error(`Existing Access app for ${domain} has a different policy. Inspect it before changing access.`);

const edits = [
  ...modify(text, ["vars", "ACCESS_TEAM_DOMAIN"], `https://${organization.auth_domain.replace(/^https:\/\//, "").replace(/\/$/, "")}`, {}),
];
const withTeam = applyEdits(text, edits);
await writeFile(source, applyEdits(withTeam, modify(withTeam, ["vars", "ACCESS_AUD"], application.aud, {})));
console.log(`Verified the Access policy for ${domain} (${emails.join(", ")}). Wrote its audience to wrangler.jsonc; commit and push to deploy.`);
