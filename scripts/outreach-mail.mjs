// Fastmail session discovery: https://www.fastmail.com/dev/
// Email creation and submission: https://www.rfc-editor.org/rfc/rfc8621.html
const CORE = 'urn:ietf:params:jmap:core';
const MAIL = 'urn:ietf:params:jmap:mail';
const SUBMISSION = 'urn:ietf:params:jmap:submission';
export const SENDER = { name: 'Nick Khami', email: 'me@skeptrune.com' };

export function messageHtml(text) {
  const escape = (value) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return text.split(/\n\s*\n/).map((paragraph) => `<p>${paragraph.split('\n').map(escape).join('<br>')}</p>`).join('\n');
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
    context = { ...discovered, identityId: identity.id, draftMailboxId, sentMailboxId };
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

  // Only the CLI's explicit email command calls this method. Creating a draft never submits it.
  async function send(message) {
    const draft = await createDraft(message);
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

  return {
    async status() {
      const session = await discover();
      return { provider: 'fastmail', sender: SENDER, accountId: session.accountId, draftMailboxId: session.draftMailboxId, sentMailboxId: session.sentMailboxId };
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
    send,
    replyMessage,
    async reply(message) {
      return send(await replyMessage(message));
    },
  };
}
