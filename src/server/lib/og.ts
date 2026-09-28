import { initWasm, Resvg } from '@resvg/resvg-wasm';
import resvgWasm from '@resvg/resvg-wasm/index_bg.wasm';
import bold from '../../assets/DejaVuSans-Bold.ttf';
import regular from '../../assets/DejaVuSans.ttf';
import { OG_WIDTH } from './og-card';

/** Renders card SVGs to 1200x630 PNG in the worker with bundled fonts. Worker-only: imports WASM. */

let ready: Promise<void> | null = null;
function ensureWasm() {
  ready ??= initWasm(resvgWasm).catch((err) => {
    // initWasm throws if called twice in one isolate; that is fine.
    if (!String(err).includes('Already initialized')) throw err;
  });
  return ready;
}

export async function renderPng(svg: string): Promise<Uint8Array> {
  await ensureWasm();
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: OG_WIDTH },
    font: { fontBuffers: [new Uint8Array(bold), new Uint8Array(regular)], defaultFontFamily: 'DejaVu Sans', loadSystemFonts: false },
  });
  return resvg.render().asPng();
}
