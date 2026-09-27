/**
 * Imported first by the entry module, so zod is initialized before anything else runs.
 *
 * better-auth's OAuth provider loads part of itself with a dynamic import(). Without code
 * splitting, esbuild then wraps zod (a dependency of that lazily loaded part) in a lazy
 * initializer. The MCP SDK imports zod as "zod/v4" and builds schemas at module load, a path
 * esbuild does not route through that initializer, so it would run against an uninitialized zod
 * ("ZodLazy is not a constructor"). Touching zod here, ahead of every other import, runs the
 * initializer first.
 */
import { z } from 'zod';

export const zodReady = z.string();
