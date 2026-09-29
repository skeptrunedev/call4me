import { z } from 'zod';
import { recordingDescription, recordingInput, recordingOutput, recordingPath } from './recording-schema';

/** Generated from the same schemas used by the HTTP route and MCP tool. */
export function openApiDocument(site: string) {
  const error = { description: 'Request failed', content: { 'application/json': { schema: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] } } } };
  return {
    openapi: '3.1.0',
    info: { title: 'callbay recording API', version: '1.0.0', description: 'Retrieve existing call recordings. Phone calls and other account tools are available through MCP.' },
    servers: [{ url: site }],
    components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', description: 'A callbay API key or OAuth access token for the site or MCP resource.' } } },
    paths: {
      [recordingPath]: {
        get: {
          operationId: 'getCallRecordings',
          description: recordingDescription,
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'call_id', in: 'path', required: true, schema: z.toJSONSchema(recordingInput.shape.call_id, { target: 'draft-2020-12' }) }],
          responses: {
            '200': { description: 'Available recordings and fresh download links', content: { 'application/json': { schema: z.toJSONSchema(recordingOutput, { target: 'draft-2020-12' }) } } },
            '400': error, '401': error, '404': error, '409': error, '502': error,
          },
        },
      },
    },
  };
}
