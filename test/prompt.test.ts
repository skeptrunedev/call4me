import { describe, expect, it } from 'vitest';
import { backOfficeInstructions, callInstructions, inboundInstructions } from '../src/server/voice/prompt';

const brief = {
  onBehalfOf: 'Nick Khami',
  business: 'Nopa',
  goal: 'Book a table for 4 tomorrow around 7pm under Khami.',
  facts: 'Party of 4\nName: Khami',
  flexibility: 'any time 6:30-8pm',
  callbackNumber: '+14155550123',
  localTime: 'Friday, October 2, 2026, 3:04 PM',
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
    expect(p).toContain("# Don't recap");
    expect(p).toMatch(/Never list several details back/);
    expect(p).toMatch(/"just to confirm", "to recap"/);
  });

  it('does not lie when sincerely asked', () => {
    expect(p).toMatch(/sincerely asks[^\n]*don't deny it/);
  });

  it('never names tools aloud', () => expect(p).toMatch(/Never say these names out loud/));

  it('omits the time line when the zone is unknown', () => expect(callInstructions({ ...brief, localTime: null })).not.toContain('for them right now'));
});

describe('backOfficeInstructions', () => {
  it('keeps its spoken output minimal', () => expect(backOfficeInstructions(brief)).toMatch(/write nothing at all/));
});

describe('inboundInstructions', () => {
  it('lists recent calls for context', () => {
    const p = inboundInstructions({ owner: 'Nick', localTime: null, recent: [{ business: 'Dr. Chen', goal: 'book a cleaning', summary: 'Booked Oct 3 at 9am', when: '2026-09-26' }] });
    expect(p).toContain('Dr. Chen');
    expect(p).toContain('Booked Oct 3 at 9am');
  });
});
