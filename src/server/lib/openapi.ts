import { z } from 'zod';
import { buyNumberDescription, buyNumberInput, listNumbersDescription, numberPath, numbersOutput, numbersPath, numberView, releaseNumberDescription, releaseNumberInput } from './number-schema';
import { recordingDescription, recordingInput, recordingOutput, recordingPath } from './recording-schema';

/** Generated from the same schemas used by the HTTP route and MCP tool. */
export function openApiDocument(site: string) {
  const schema = (s: z.ZodType) => z.toJSONSchema(s, { target: 'draft-2020-12' });
  const json = (description: string, s: z.ZodType) => ({ description, content: { 'application/json': { schema: schema(s) } } });
  const error = { description: 'Request failed', content: { 'application/json': { schema: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] } } } };
  return {
    openapi: '3.1.0',
    info: { title: 'call4me API', version: '1.1.0', description: 'Manage the account\'s phone numbers and retrieve existing call recordings. Phone calls and other account tools are available through MCP.' },
    servers: [{ url: site }],
    components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', description: 'A call4me API key or OAuth access token for the site or MCP resource.' } } },
    paths: {
      [numbersPath]: {
        get: {
          operationId: 'listNumbers',
          description: listNumbersDescription,
          security: [{ bearerAuth: [] }],
          responses: { '200': json('The account\'s numbers and the countries more can be bought in', numbersOutput), '401': error },
        },
        post: {
          operationId: 'buyNumber',
          description: buyNumberDescription,
          security: [{ bearerAuth: [] }],
          requestBody: { required: true, content: { 'application/json': { schema: schema(buyNumberInput) } } },
          responses: { '201': json('The number bought', numberView), '400': error, '401': error, '402': error, '409': error, '502': error, '503': error },
        },
      },
      [numberPath]: {
        delete: {
          operationId: 'releaseNumber',
          description: releaseNumberDescription,
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'number', in: 'path', required: true, description: 'E.164, URL-encoded (+ as %2B)', schema: schema(releaseNumberInput.shape.number) }],
          responses: { '200': json('The number released', numberView), '401': error, '404': error, '409': error, '502': error },
        },
      },
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
