import { writeFileSync } from 'node:fs';
import { openApiDocument } from '../src/server/lib/openapi';

writeFileSync(new URL('../openapi.json', import.meta.url), JSON.stringify(openApiDocument('https://call4.me'), null, 2) + '\n');
