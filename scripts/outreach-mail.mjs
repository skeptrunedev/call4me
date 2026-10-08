// Fastmail session discovery: https://www.fastmail.com/dev/
// Email creation and submission: https://www.rfc-editor.org/rfc/rfc8621.html
const CORE = 'urn:ietf:params:jmap:core';
const MAIL = 'urn:ietf:params:jmap:mail';
const SUBMISSION = 'urn:ietf:params:jmap:submission';
export const SENDER = { name: 'Nick Khami', email: 'me@skeptrune.com' };

export function parseMessage(source) {
  const match = typeof source === 'string' && /^Subject: ([^\r\n]+)\n\n([\s\S]+)$/.exec(source.replace(/\r\n/g, '\n'));
  if (!match || !match[1].trim() || !match[2].trim()) throw new Error('Message file needs a Subject: line, a blank line, and a body');
  return { subject: match[1].trim(), text: match[2].trim() };
}

export function messageHtml(text) {
  const escape = (value) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const lineHtml = (line) => escape(line).replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');
  return text.split(/\n\s*\n/).map((paragraph) => `<p>${paragraph.split('\n').map(lineHtml).join('<br>')}</p>`).join('\n');
}

export const statusAfterDraft = (status) => ['new', 'drafted', 'no_contact'].includes(status) ? 'drafted' : status;

export function fastmail({ token = process.env.FASTMAIL_JMAP_TOKEN, fetchImpl = globalThis.fetch } = {}) {
  if (!token) throw new Error('FASTMAIL_JMAP_TOKEN is required');
  let context;

  async function request(url, body) {
    const response = await fetchImpl(url, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Fastmail request failed (HTTP ${response.status})`);
    return response.json();
  }

  async function call(session, method, arguments_) {
    const result = await request(session.apiUrl, {
      using: [CORE, MAIL, SUBMISSION],
      methodCalls: [[method, { accountId: session.accountId, ...arguments_ }, 'outreach']],
    });
    const responses = result.methodResponses?.filter(([, , id]) => id === 'outreach') ?? [];
    const response = responses.find(([name]) => name === method) ?? responses.find(([name]) => name === 'error');
    if (!response) throw new Error(`Fastmail returned no ${method} response`);
    if (response[0] === 'error') throw new Error(`Fastmail ${method} failed: ${response[1].type}`);
    if (response[1].accountId !== session.accountId) throw new Error(`Fastmail ${method} returned a different account`);
    if (method === 'EmailSubmission/set') {
      const emailUpdate = responses.find(([name]) => name === 'Email/set');
      return { ...response[1], emailUpdate: emailUpdate?.[1], updateError: responses.find(([name]) => name === 'error')?.[1] };
    }
    return response[1];
  }

  async function discover() {
    if (context) return context;
    const session = await request('https://api.fastmail.com/jmap/session');
    const accountId = session.primaryAccounts?.[MAIL];
    const account = session.accounts?.[accountId];
    if (!accountId || !account) throw new Error('Fastmail session has no primary mail account');
    if (!session.capabilities?.[SUBMISSION] || !account.accountCapabilities?.[SUBMISSION]) throw new Error('Fastmail account lacks mail submission access');
    if (!session.capabilities?.[MAIL] || !account.accountCapabilities?.[MAIL]) throw new Error('Fastmail account lacks mail access');
    if (!session.apiUrl || new URL(session.apiUrl).protocol !== 'https:') throw new Error('Fastmail session has no valid HTTPS API URL');
    const discovered = { apiUrl: session.apiUrl, accountId };
    const identities = await call(discovered, 'Identity/get', {});
    const identity = identities.list?.find((item) => item.email === SENDER.email);
    if (!identity?.id) throw new Error(`Fastmail has no sender identity for ${SENDER.email}`);
    const mailboxes = await call(discovered, 'Mailbox/get', { properties: ['id', 'role'] });
    const draftMailboxId = mailboxes.list?.find((item) => item.role === 'drafts')?.id;
    const sentMailboxId = mailboxes.list?.find((item) => item.role === 'sent')?.id;
    if (!draftMailboxId || !sentMailboxId) throw new Error('Fastmail account needs drafts and sent mailboxes');
    context = { ...discovered, identityId: identity.id, draftMailboxId, sentMailboxId, maxDelayedSend: account.accountCapabilities[SUBMISSION].maxDelayedSend ?? 0 };
    return context;
  }

  async function createDraft({ to, subject, text, inReplyTo, references, expectedThreadId }) {
    if (!to || !subject || !text?.trim()) throw new Error('Email recipient, subject and body are required');
    const session = await discover();
    const result = await call(session, 'Email/set', {
      create: { draft: {
        mailboxIds: { [session.draftMailboxId]: true },
        keywords: { $draft: true },
        from: [SENDER], to: [{ email: to }], subject,
        ...(inReplyTo ? { inReplyTo, references } : {}),
        htmlBody: [{ partId: 'html', type: 'text/html' }],
        bodyValues: { html: { value: messageHtml(text) } },
      } },
    });
    const id = result.created?.draft?.id;
    if (!id) throw new Error(`Fastmail draft creation failed: ${result.notCreated?.draft?.type ?? 'missing email id'}`);
    if (expectedThreadId && result.created.draft.threadId !== expectedThreadId) throw new Error(`Reply draft ${id} did not join the expected thread; inspect before sending`);
    return { provider: 'fastmail', id };
  }

  async function verifiedDraft({ id, to, expectedText, expectedSubject, expectedReply }) {
    if (!id || !to || !expectedText?.trim()) throw new Error('Original draft, recipient and expected body are required');
    const session = await discover();
    const originalResult = await call(session, 'Email/get', {
      ids: [id],
      properties: ['id', 'threadId', 'subject', 'mailboxIds', 'keywords', 'sender', 'from', 'to', 'cc', 'bcc', 'replyTo', 'inReplyTo', 'references', 'hasAttachment', 'attachments', 'htmlBody', 'bodyValues'],
      fetchHTMLBodyValues: true,
    });
    const original = originalResult.list?.find((email) => email.id === id);
    const singleAddress = (addresses, email) => Array.isArray(addresses) && addresses.length === 1 && addresses[0].email?.toLowerCase() === email.toLowerCase();
    const empty = (value) => value == null || (Array.isArray(value) && value.length === 0);
    if (!original || original.keywords?.$draft !== true || Object.keys(original.mailboxIds ?? {}).length !== 1 || original.mailboxIds[session.draftMailboxId] !== true) throw new Error('Original email is not an unsent draft in only the Drafts mailbox');
    if (!singleAddress(original.from, SENDER.email) || !singleAddress(original.to, to) || !empty(original.sender)) throw new Error('Original draft sender or recipient does not match');
    if (['cc', 'bcc', 'replyTo', 'attachments'].some((property) => !empty(original[property])) || original.hasAttachment) throw new Error('Original draft has additional recipients or attachments');
    if (expectedReply) {
      if (original.threadId !== expectedReply.expectedThreadId || ['inReplyTo', 'references'].some((property) => JSON.stringify(original[property]) !== JSON.stringify(expectedReply[property]))) throw new Error('Original draft reply headers or thread do not match the source email');
    } else if (['inReplyTo', 'references'].some((property) => !empty(original[property]))) {
      throw new Error('Original draft has unexpected reply headers');
    }
    const html = original.htmlBody?.length === 1 && original.htmlBody[0].type === 'text/html' ? original.bodyValues?.[original.htmlBody[0].partId] : null;
    if (!html || html.isTruncated || html.isEncodingProblem || html.value !== messageHtml(expectedText)) throw new Error('Original draft body does not match the outreach tracker');
    if (expectedSubject !== undefined && original.subject !== expectedSubject) throw new Error('Original draft subject does not match the approved subject');
    if (typeof originalResult.state !== 'string' || !originalResult.state) throw new Error('Original draft read returned no email state');
    return { session, state: originalResult.state };
  }

  async function replaceDraft({ id, to, subject, text, expectedText }) {
    if (!id || !to || !subject || !text?.trim() || !expectedText?.trim()) throw new Error('Original draft, recipient, subject, new body and expected body are required');
    const { session, state } = await verifiedDraft({ id, to, expectedText });

    const created = await call(session, 'Email/set', {
      ifInState: state,
      create: { draft: {
        mailboxIds: { [session.draftMailboxId]: true }, keywords: { $draft: true },
        from: [SENDER], to: [{ email: to }], subject,
        htmlBody: [{ partId: 'html', type: 'text/html' }],
        bodyValues: { html: { value: messageHtml(text) } },
      } },
    });
    const replacementId = created.created?.draft?.id;
    if (!replacementId) throw new Error(`Fastmail replacement draft creation failed: ${created.notCreated?.draft?.type ?? 'missing email id'}; original draft ${id} was not removed`);
    const replacement = { provider: 'fastmail', id: replacementId, previousId: id, replaced: false };
    try {
      if (typeof created.newState !== 'string' || !created.newState) throw new Error('draft creation returned no email state');
      const removed = await call(session, 'Email/set', { ifInState: created.newState, destroy: [id] });
      if (!removed.destroyed?.includes(id)) throw new Error(removed.notDestroyed?.[id]?.type ?? 'missing destruction confirmation');
      return { ...replacement, replaced: true };
    } catch (error) {
      return { ...replacement, warning: `Replacement draft ${replacementId} exists, but removal of original draft ${id} was not confirmed (${error.message}); inspect both drafts before retrying to avoid duplicates` };
    }
  }

  async function submitDraft(draft) {
    const session = await discover();
    try {
      const result = await call(session, 'EmailSubmission/set', {
        create: { submission: { identityId: session.identityId, emailId: draft.id } },
        onSuccessUpdateEmail: { '#submission': {
          [`mailboxIds/${session.draftMailboxId}`]: null,
          [`mailboxIds/${session.sentMailboxId}`]: true,
          'keywords/$draft': null,
        } },
      });
      const submissionId = result.created?.submission?.id;
      if (!submissionId) throw new Error(result.notCreated?.submission?.type ?? 'missing submission id');
      // Submission already succeeded. A filing error must not invite a duplicate send.
      const filingError = result.emailUpdate?.notUpdated?.[draft.id]?.type ?? result.updateError?.type;
      if (filingError || !Object.hasOwn(result.emailUpdate?.updated ?? {}, draft.id)) {
        return { ...draft, submissionId, warning: `mail submitted, but Sent mailbox update was not confirmed (${filingError ?? 'missing update response'})` };
      }
      return { ...draft, submissionId };
    } catch (error) {
      throw new Error(`Fastmail submission failed for draft ${draft.id}; inspect that draft before retrying: ${error.message}`, { cause: error });
    }
  }

  // Only explicit send commands submit mail. Draft creation and revision never submit it.
  async function send(message) {
    return submitDraft(await createDraft(message));
  }

  async function sendDraft({ id, to, subject, text }) {
    if (!subject) throw new Error('Approved subject is required');
    await verifiedDraft({ id, to, expectedText: text, expectedSubject: subject });
    return submitDraft({ provider: 'fastmail', id });
  }

  async function submissions(ids) {
    if (!Array.isArray(ids) || !ids.length || ids.length > 100 || ids.some((id) => typeof id !== 'string' || !id)) throw new Error('Provide 1 to 100 submission ids');
    return call(await discover(), 'EmailSubmission/get', { ids, properties: ['id', 'emailId', 'identityId', 'envelope', 'sendAt', 'undoStatus', 'deliveryStatus'] });
  }

  async function submissionsForEmail(emailId) {
    if (typeof emailId !== 'string' || !emailId) throw new Error('Email id is required');
    const session = await discover();
    const result = await call(session, 'EmailSubmission/query', { filter: { emailIds: [emailId] }, limit: 100, calculateTotal: true });
    if (!Array.isArray(result.ids) || !Number.isInteger(result.total) || result.total !== result.ids.length) throw new Error(`Incomplete submission query for email ${emailId}; inspect before submitting`);
    if (!result.ids.length) return [];
    const fetched = await submissions(result.ids);
    if (fetched.notFound?.length || fetched.list?.length !== result.ids.length || fetched.list.some((item) => item.emailId !== emailId || !result.ids.includes(item.id))) throw new Error(`Incomplete submission read for email ${emailId}; inspect before submitting`);
    return fetched.list;
  }

  async function cancelSubmission(id) {
    if (typeof id !== 'string' || !id) throw new Error('Submission id is required');
    const session = await discover();
    const result = await call(session, 'EmailSubmission/set', { update: { [id]: { undoStatus: 'canceled' } } });
    if (!Object.hasOwn(result.updated ?? {}, id)) throw new Error(`Cancellation of submission ${id} failed: ${result.notUpdated?.[id]?.type ?? 'missing update confirmation'}`);
    const verified = (await submissions([id])).list?.find((item) => item.id === id);
    if (verified?.undoStatus !== 'canceled') throw new Error(`Cancellation of submission ${id} was not verified; inspect before submitting again`);
    return verified;
  }

  async function scheduleDraft({ id, to, subject, text, sendAt }) {
    if (!subject) throw new Error('Approved subject is required');
    const timestamp = typeof sendAt === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(sendAt) ? Date.parse(sendAt) : NaN;
    if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().replace('.000Z', 'Z') !== sendAt || timestamp <= Date.now()) throw new Error('Scheduled time must be a future UTC timestamp with whole seconds');
    const session = await discover();
    const checkDelay = () => {
      const delay = (timestamp - Date.now()) / 1000;
      if (delay <= 0 || !Number.isSafeInteger(session.maxDelayedSend) || session.maxDelayedSend <= 0 || delay > session.maxDelayedSend) throw new Error('Scheduled time is outside the provider delayed send window');
    };
    checkDelay();
    const existing = await submissionsForEmail(id);
    if (existing.some((item) => item.undoStatus !== 'canceled')) throw new Error(`Email ${id} already has an active submission; inspect before scheduling`);
    await verifiedDraft({ id, to, expectedText: text, expectedSubject: subject });
    checkDelay();
    let submissionId;
    try {
      // RFC 8621 sendAt is server set. RFC 4865 HOLDUNTIL requests future release.
      const result = await call(session, 'EmailSubmission/set', {
        create: { submission: {
          identityId: session.identityId, emailId: id,
          envelope: { mailFrom: { email: SENDER.email, parameters: { HOLDUNTIL: sendAt } }, rcptTo: [{ email: to }] },
        } },
        onSuccessUpdateEmail: { '#submission': {
          [`mailboxIds/${session.draftMailboxId}`]: null,
          [`mailboxIds/${session.sentMailboxId}`]: true,
          'keywords/$draft': null,
        } },
      });
      submissionId = result.created?.submission?.id;
      if (!submissionId) throw new Error(result.notCreated?.submission?.type ?? 'missing submission id');
      const verified = (await submissions([submissionId])).list?.find((item) => item.id === submissionId);
      if (verified?.emailId !== id || verified.sendAt !== sendAt || verified.undoStatus !== 'pending') throw new Error('Provider schedule does not match the requested email, time and pending status');
      const filingError = result.emailUpdate?.notUpdated?.[id]?.type ?? result.updateError?.type;
      return {
        provider: 'fastmail', id, submissionId, sendAt: verified.sendAt, undoStatus: verified.undoStatus,
        ...(filingError || !Object.hasOwn(result.emailUpdate?.updated ?? {}, id) ? { warning: `mail scheduled, but Sent mailbox update was not confirmed (${filingError ?? 'missing update response'})` } : {}),
      };
    } catch (cause) {
      const error = new Error(`Fastmail scheduling failed for email ${id}${submissionId ? `, submission ${submissionId}` : ''}; inspect provider submissions before retrying: ${cause.message}`, { cause });
      error.emailId = id;
      if (submissionId) error.submissionId = submissionId;
      throw error;
    }
  }

  async function replyMessage({ id, to, text }) {
    if (!id || !to || !text?.trim()) throw new Error('Reply source, recipient and body are required');
    const session = await discover();
    const result = await call(session, 'Email/get', { ids: [id], properties: ['id', 'threadId', 'from', 'replyTo', 'subject', 'messageId', 'references'] });
    const original = result.list?.find((email) => email.id === id);
    const recipients = original?.replyTo?.length ? original.replyTo : original?.from;
    if (recipients?.length !== 1 || recipients[0].email.toLowerCase() !== to.toLowerCase()) throw new Error('Reply source does not match the intended recipient');
    if (!original.messageId?.length || !original.threadId) throw new Error('Reply source has no message id or thread id');
    return { to, text, subject: /^re:/i.test(original.subject) ? original.subject : `Re: ${original.subject}`, inReplyTo: original.messageId, references: [...new Set([...(original.references ?? []), ...original.messageId])], expectedThreadId: original.threadId };
  }

  async function sendReplyDraft({ id, draftId, to, text }) {
    const message = await replyMessage({ id, to, text });
    await verifiedDraft({ id: draftId, to, expectedText: text, expectedSubject: message.subject, expectedReply: message });
    return submitDraft({ provider: 'fastmail', id: draftId });
  }

  return {
    async status() {
      const session = await discover();
      return { provider: 'fastmail', sender: SENDER, accountId: session.accountId, draftMailboxId: session.draftMailboxId, sentMailboxId: session.sentMailboxId, maxDelayedSend: session.maxDelayedSend };
    },
    async search({ filter = {}, position = 0, limit = 100 } = {}) {
      if (!Number.isInteger(position) || position < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Search position must be nonnegative and limit must be 1 to 100');
      const session = await discover();
      return call(session, 'Email/query', { filter, position, limit, sort: [{ property: 'receivedAt', isAscending: false }], calculateTotal: true });
    },
    async read(ids) {
      if (!Array.isArray(ids) || !ids.length || ids.length > 100 || ids.some((id) => typeof id !== 'string' || !id)) throw new Error('Provide 1 to 100 email ids');
      const session = await discover();
      return call(session, 'Email/get', {
        ids,
        properties: ['id', 'threadId', 'mailboxIds', 'keywords', 'receivedAt', 'from', 'to', 'cc', 'subject', 'preview', 'inReplyTo', 'references', 'messageId', 'textBody', 'htmlBody', 'bodyValues'],
        fetchTextBodyValues: true, fetchHTMLBodyValues: true,
      });
    },
    createDraft,
    replaceDraft,
    send,
    sendDraft,
    scheduleDraft,
    submissions,
    submissionsForEmail,
    cancelSubmission,
    sendReplyDraft,
    replyMessage,
    async reply(message) {
      return send(await replyMessage(message));
    },
  };
}
