import { describe, expect, it } from 'vitest';
import { likelyTask, openTasks } from '../src/server/services/calls';
import { summaryPrompt } from '../src/server/services/summary';
import { backOfficeInstructions, callInstructions, inboundBackOfficeInstructions, inboundInstructions } from '../src/server/voice/prompt';

const brief = {
  onBehalfOf: 'Nick Khami',
  business: 'Nopa',
  goal: 'Book a table for 4 tomorrow around 7pm under Khami.',
  facts: 'Party of 4\nName: Khami',
  flexibility: 'any time 6:30-8pm',
  callbackNumber: '+14155550123',
  localTime: 'Friday, October 2, 2026, 3:04 PM',
  owner: 'Nick Khami',
  connectWhen: null as string | null,
};

describe('callInstructions', () => {
  const p = callInstructions(brief);

  it('carries the brief', () => {
    for (const s of ['Nopa', 'Nick Khami', 'Book a table for 4', 'any time 6:30-8pm', '415-555-0123', 'Friday, October 2']) expect(p).toContain(s);
  });

  it('never opens with a disclosure or a recording notice', () => {
    expect(p).not.toMatch(/this call (may be|is being) recorded/i);
    expect(p).not.toMatch(/(start|open|begin)[^.\n]*(by|with)[^.\n]*(AI|assistant|recorded)/i);
    expect(p).toContain("Don't bring it up yourself");
  });

  it('forbids the end-of-call read-back', () => {
    expect(p).toMatch(/gets a written recap of the call afterwards/);
    expect(p).toContain("# Don't recap");
    expect(p).toMatch(/Never list several details back/);
    expect(p).toMatch(/"just to confirm", "to recap"/);
  });

  it('does not lie when sincerely asked', () => {
    expect(p).toMatch(/sincerely asks[^\n]*don't deny it/);
  });

  it('never names tools aloud', () => expect(p).toMatch(/Never say these names out loud/));

  it('can patch the owner in, on request or on a condition', () => {
    expect(p).toContain('ring Nick Khami and patch them into this call');
    expect(p).toContain('insist on speaking to Nick Khami directly');
    const q = callInstructions({ ...brief, connectWhen: 'As soon as a person picks up' });
    expect(q).toContain('As soon as a person picks up (then Nick Khami gets patched in)');
    expect(backOfficeInstructions({ ...brief, connectWhen: 'As soon as a person picks up' })).toContain('Connect condition: As soon as a person picks up');
  });

  it('gives only the callbay number to call back', () => {
    const q = callInstructions({ ...brief, facts: 'phone number: 248-761-4355' });
    expect(q).toContain('The callback number is 415-555-0123');
    expect(q).toMatch(/give this one and only this one/);
    expect(q).toMatch(/voicemail[^\n]*the callback number/);
  });

  it('omits the time line when the zone is unknown', () => expect(callInstructions({ ...brief, localTime: null })).not.toContain('for them right now'));
});

describe('backOfficeInstructions', () => {
  it('keeps its spoken output minimal', () => expect(backOfficeInstructions(brief)).toMatch(/write nothing at all/));
});

describe('inboundInstructions', () => {
  it('lists recent calls for context', () => {
    const p = inboundInstructions({ owner: 'Nick', localTime: null, tasks: [], likely: false, recent: [{ business: 'Dr. Chen', goal: 'book a cleaning', summary: 'Booked Oct 3 at 9am', when: '2026-09-26' }] });
    expect(p).toContain('Dr. Chen');
    expect(p).toContain('Booked Oct 3 at 9am');
    expect(p).not.toContain('Unfinished tasks');
  });

  const task = {
    business: 'Comprehensive Eyecare',
    goal: 'Book the soonest routine eye exam for new patient Nick Hughes.',
    onBehalfOf: 'Nick Hughes',
    facts: 'date of birth: 01/20/2002\nreason: routine eye exam',
    flexibility: 'Accept the earliest opening.',
    when: '2026-09-28',
    lastResult: 'Left a voicemail asking for the soonest exam.',
  };

  it('finishes a known callback task instead of taking a message', () => {
    const p = inboundInstructions({ owner: 'Nick Khami', localTime: null, tasks: [task], likely: true, recent: [] });
    for (const s of ['almost certainly calling back about task 1', 'Book the soonest routine eye exam', 'for Nick Hughes', '01/20/2002', 'Accept the earliest opening.', 'Left a voicemail', '# Finish the task on this call']) expect(p).toContain(s);
  });

  it('asks the model to match the task when the number is unknown', () => {
    const p = inboundInstructions({ owner: 'Nick Khami', localTime: null, tasks: [task, { ...task, business: 'Nopa', goal: 'Book a table for 4.' }], likely: false, recent: [] });
    expect(p).toContain('work out which from what they say');
    expect(p).toContain('## Task 2: Nopa');
  });

  it('gives the back office the tasks', () => expect(inboundBackOfficeInstructions('Nick Khami', [task])).toContain('Accept the earliest opening.'));
});

describe('open callback tasks', () => {
  const row = (to_number: string, created_at: number, id = `${to_number}-${created_at}`) => ({ id, to_number, created_at });

  it('keeps one task per business number, newest first, the caller first', () => {
    const tasks = openTasks([row('+1281', 1), row('+1281', 3), row('+1415', 2)], '+1415');
    expect(tasks.map((t) => t.id)).toEqual(['+1415-2', '+1281-3']);
  });

  it('knows the task when the number matches', () => expect(likelyTask(openTasks([row('+1281', 1), row('+1415', 2)], '+1281'), '+1281')?.to_number).toBe('+1281'));
  it('knows the task when only one is open', () => expect(likelyTask([row('+1281', 1)], '+1999')?.to_number).toBe('+1281'));
  it('leaves it open when several could match', () => expect(likelyTask([row('+1281', 1), row('+1415', 2)], '+1999')).toBeNull());
});

describe('summaryPrompt', () => {
  const brief = { on_behalf_of: 'Nick Hughes', facts: '', flexibility: 'Accept the earliest opening.' };
  it('judges a callback against its task', () => {
    const p = summaryPrompt({ direction: 'inbound', business: 'Comprehensive Eyecare', goal: 'Book an eye exam.', callback_for: 'call_x' }, brief, []);
    expect(p).toContain('calling back');
    expect(p).toContain('The task: Book an eye exam.');
  });
  it('treats an unknown incoming call as a message', () => {
    const p = summaryPrompt({ direction: 'inbound', business: 'incoming call', goal: 'take the call and a message', callback_for: null }, brief, []);
    expect(p).toContain('took a message');
  });
});
