/**
 * Offline tool definitions for rendering saved calls in Claude Code.
 * Claude hides unknown tools when restoring a transcript. These definitions let
 * its native renderer show the historical tool cards without a live connection.
 * Invocations fail by default. An explicit local fixture can replay a verified
 * result. This process has no credentials, database, network client, or dialer.
 */
import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';
import { readFileSync } from 'node:fs';

const server = new McpServer({ name: 'callbay', version: '1.0.0' });
const disabled = async () => ({
  isError: true,
  content: [{ type: 'text', text: 'Historical replay only. Live calls are disabled.' }],
});

// Explicit opt-in can replay a previously verified, sanitized result. This is
// still entirely offline: the source is a local file, and nothing can dial.
const replayIndex = process.argv.indexOf('--recorded-result');
const replay = replayIndex < 0 ? null : z.object({
  call_id: z.string(),
  business: z.string(),
  summary: z.string(),
  provenance: z.string(),
}).parse(JSON.parse(readFileSync(process.argv[replayIndex + 1], 'utf8')));
const historicalResult = async (args) => {
  if (!replay) return disabled();
  if (args.business && args.business !== replay.business) return disabled();
  if (args.call_id && args.call_id !== replay.call_id) return disabled();
  return {
    content: [{ type: 'text', text: `Recorded call: ${replay.business}\n${replay.summary}` }],
  };
};

// Public field names and titles mirror src/server/mcp/server.ts. Private fields
// are deliberately absent from the sanitized historical replay.
server.registerTool('callbay_place_call', {
  title: 'Place a phone call',
  description: 'Display a saved phone call in a historical session replay. Cannot place calls.',
  inputSchema: z.object({ business: z.string(), goal: z.string() }),
}, historicalResult);
server.registerTool('callbay_get_call', {
  title: 'Check on a call',
  description: 'Display a saved call result in a historical session replay. Cannot retrieve calls.',
  inputSchema: z.object({ call_id: z.string(), wait_seconds: z.number().optional() }),
}, historicalResult);

await server.connect(new StdioServerTransport());
