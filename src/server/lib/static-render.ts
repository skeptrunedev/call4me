import { createContext, useContext } from 'hono/jsx';

/** Public build configuration only. Account data and secrets never enter this context. */
export interface StaticRenderConfig {
  metaPixelId: string;
  metaDomainVerification: string;
  redditPixelId: string;
}
export const StaticRenderContext = createContext<StaticRenderConfig | null>(null);
export const useStaticRender = () => useContext(StaticRenderContext);
