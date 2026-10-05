#!/usr/bin/env node
/**
 * Manage Telnyx requirement groups without changing other requirement values.
 * Needs TELNYX_API_KEY in the environment; PDF uploads need Poppler's pdfinfo.
 *
 *   npm run requirements -- list
 *   npm run requirements -- show <group-id>
 *   npm run requirements -- replace-document <group-id> <requirement-id> <file.pdf>
 *   npm run requirements -- attach-order-document <phone-order-id> <requirement-id> <document-id>
 *   npm run requirements -- set-text <group-id> <requirement-id> <value>
 *   npm run requirements -- submit <group-id>
 */
import { execFileSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const MAX_PDF_BYTES = 20_000_000;
const usage = 'usage: npm run requirements -- list | show <group-id> | replace-document <group-id> <requirement-id> <file.pdf> | attach-order-document <phone-order-id> <requirement-id> <document-id> | set-text <group-id> <requirement-id> <value> | submit <group-id>';

export function requirementsClient(apiKey, fetchApi = fetch) {
  if (!apiKey) throw new Error('TELNYX_API_KEY must be set');

  async function request(path, method = 'GET', body) {
    const response = await fetchApi(`https://api.telnyx.com/v2${path}`, {
      method,
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(60_000),
    });
    let payload;
    try { payload = await response.json(); }
    catch { throw new Error(`Telnyx ${method} ${path}: HTTP ${response.status}, invalid JSON response`); }
    if (!response.ok) {
      const details = payload.errors?.map(error => [error.code, error.title, error.detail].filter(Boolean).join(': ')).join('; ');
      throw new Error(`Telnyx ${method} ${path}: HTTP ${response.status}${details ? `, ${details}` : ''}`);
    }
    return payload.data ?? payload;
  }

  const groupPath = id => `/requirement_groups/${encodeURIComponent(id)}`;
  async function group(id) {
    const result = await request(groupPath(id));
    if (result.id !== id || !Array.isArray(result.regulatory_requirements)) {
      throw new Error(`Telnyx returned an invalid requirement group for ${id}`);
    }
    return result;
  }

  async function requirement(groupId, requirementId, fieldType) {
    const current = await group(groupId);
    const field = current.regulatory_requirements.find(item => item.requirement_id === requirementId);
    if (!field) throw new Error(`Requirement ${requirementId} does not belong to group ${groupId}`);
    if (field.field_type !== fieldType) throw new Error(`Requirement ${requirementId} is ${field.field_type}, expected ${fieldType}`);
    return field;
  }

  async function setValue(groupId, requirementId, value) {
    await request(groupPath(groupId), 'PATCH', {
      regulatory_requirements: [{ requirement_id: requirementId, field_value: value }],
    });
    const current = await group(groupId);
    const saved = current.regulatory_requirements.find(item => item.requirement_id === requirementId);
    if (saved?.field_value !== value) throw new Error(`Readback mismatch for requirement ${requirementId}; inspect the group before another mutation`);
    return current;
  }

  return {
    list: () => request('/requirement_groups'),
    async show(groupId) {
      const current = await group(groupId);
      const types = await Promise.all(current.regulatory_requirements.map(item => request(`/requirement_types/${encodeURIComponent(item.requirement_id)}`)));
      return { ...current, requirement_types: types };
    },
    async replaceDocument(groupId, requirementId, file) {
      await requirement(groupId, requirementId, 'document');
      const info = await stat(file);
      if (!info.isFile() || info.size === 0 || info.size > MAX_PDF_BYTES) throw new Error('Document must be a regular PDF file of at most 20 MB');
      const bytes = await readFile(file);
      if (bytes.length > MAX_PDF_BYTES || !bytes.subarray(0, 8).toString('ascii').match(/^%PDF-\d\.\d/) || !bytes.subarray(-1024).toString('ascii').includes('%%EOF')) {
        throw new Error('Document is not a complete PDF');
      }
      try {
        const metadata = execFileSync('pdfinfo', ['-'], { input: bytes, encoding: 'utf8', timeout: 30_000, stdio: ['pipe', 'pipe', 'pipe'] });
        if (!/^Pages:\s+[1-9]\d*/m.test(metadata) || /^Encrypted:\s+yes/m.test(metadata)) throw new Error('invalid PDF');
      } catch (error) {
        if (error.code === 'ENOENT') throw new Error('PDF validation needs pdfinfo (install Poppler)');
        throw new Error('Document must be a readable, unencrypted PDF with at least one page');
      }
      const document = await request('/documents', 'POST', {
        file: bytes.toString('base64'), filename: basename(file), customer_reference: `${groupId}:${requirementId}`,
      });
      if (!document.id || typeof document.id !== 'string') throw new Error('Telnyx uploaded the document without returning an ID; inspect documents before another upload');
      try { return await setValue(groupId, requirementId, document.id); }
      catch (error) { throw new Error(`${error.message}. Uploaded document ID: ${document.id}`); }
    },
    async setText(groupId, requirementId, value) {
      if (typeof value !== 'string' || !value.trim()) throw new Error('Text value must not be empty');
      await requirement(groupId, requirementId, 'textual');
      return setValue(groupId, requirementId, value);
    },
    async attachOrderDocument(phoneOrderId, requirementId, documentId) {
      const path = `/number_order_phone_numbers/${encodeURIComponent(phoneOrderId)}`;
      const current = await request(path);
      if (current.id !== phoneOrderId || current.status !== 'pending') throw new Error(`Phone number order ${phoneOrderId} must exist and be pending`);
      const field = current.regulatory_requirements?.find(item => item.requirement_id === requirementId);
      if (!field || field.field_type !== 'document') throw new Error(`Requirement ${requirementId} must belong to phone number order ${phoneOrderId} and have type document`);
      const document = await request(`/documents/${encodeURIComponent(documentId)}`);
      if (document.id !== documentId || document.content_type !== 'application/pdf' || document.av_scan_status !== 'scanned' || /denied|infected|rejected|deleted/i.test(document.status ?? '')) {
        throw new Error(`Document ${documentId} must be an available PDF with a completed virus scan`);
      }
      await request(path, 'PATCH', { regulatory_requirements: [{ requirement_id: requirementId, field_value: documentId }] });
      const updated = await request(path);
      const saved = updated.regulatory_requirements?.find(item => item.requirement_id === requirementId);
      if (updated.id !== phoneOrderId || saved?.field_value !== documentId) throw new Error(`Readback mismatch for phone number order ${phoneOrderId}; inspect the order before another mutation`);
      return updated;
    },
    async submit(groupId) {
      const current = await group(groupId);
      if (current.status === 'pending-approval' || current.status === 'approved') throw new Error(`Group ${groupId} is already ${current.status}`);
      await request(`${groupPath(groupId)}/submit_for_approval`, 'POST');
      const submitted = await group(groupId);
      if (submitted.status !== 'pending-approval') throw new Error(`Submission readback was ${submitted.status}, expected pending-approval; inspect the group before submitting again`);
      return submitted;
    },
  };
}

export async function runRequirements(args, apiKey = process.env.TELNYX_API_KEY) {
  const [command, groupId, requirementId, value] = args;
  const count = { list: 1, show: 2, 'replace-document': 4, 'attach-order-document': 4, 'set-text': 4, submit: 2 }[command];
  if (count !== args.length || args.some(arg => !arg)) throw new Error(usage);
  const client = requirementsClient(apiKey);
  if (command === 'list') return client.list();
  if (command === 'show') return client.show(groupId);
  if (command === 'replace-document') return client.replaceDocument(groupId, requirementId, value);
  if (command === 'attach-order-document') return client.attachOrderDocument(groupId, requirementId, value);
  if (command === 'set-text') return client.setText(groupId, requirementId, value);
  return client.submit(groupId);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(await runRequirements(process.argv.slice(2)), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
