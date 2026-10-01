import { WorkerEntrypoint } from 'cloudflare:workers';
import { Raindrop } from 'raindrop-ai';

/** One written call recap, as the site Worker produced it (routes/webhooks.ts writeRecap). */
export interface RecapEvent {
  accountId: string;
  callId: string;
  model: string;
  input: string;
  output: string;
  status: 'completed' | 'error';
  durationMs: number;
}

/**
 * Logs call recaps to Raindrop for the site Worker, over its RECAP_LOG service binding. The SDK
 * (with its tracing stack) is half the size of the site's bundle and doubled every cold start
 * there; this Worker ships it anyway for live calls. PII is redacted by the SDK, as before.
 */
export class RecapLog extends WorkerEntrypoint<Env> {
  async record(e: RecapEvent): Promise<void> {
    if (!this.env.RAINDROP_WRITE_KEY) return;
    const raindrop = new Raindrop({ writeKey: this.env.RAINDROP_WRITE_KEY, projectId: this.env.RAINDROP_PROJECT_ID, redactPii: true, useExternalOtel: true, appGit: false, localWorkshopUrl: false });
    try {
      raindrop.setUserDetails({ userId: e.accountId, traits: {} });
      const interaction = raindrop.begin({ eventId: crypto.randomUUID(), event: 'callbay_call_recap', userId: e.accountId, convoId: e.callId, model: e.model, input: e.input });
      await interaction.finish({ output: e.output, properties: { status: e.status, duration_ms: e.durationMs } });
    } finally {
      await raindrop.close();
    }
  }
}
