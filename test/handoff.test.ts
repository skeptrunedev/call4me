import { describe, expect, it } from 'vitest';
import { forcedHandoffMessage, isPhoneMenu, missedHandoff, promisesAction } from '../src/server/voice/handoff';
import type { TranscriptLine } from '../src/server/services/calls';

const line = (role: TranscriptLine['role'], text: string, at: number): TranscriptLine => ({ role, text, at });

// From a real call that looped: the caller said "2." aloud and the menu never heard it.
const MENU =
  'Please listen carefully as our menu options have changed. For hours and directions, press 1. For appointments, press 2. For contact lens inquiries, press 3.';

describe('isPhoneMenu', () => {
  it('spots keypad menus', () => {
    expect(isPhoneMenu(MENU)).toBe(true);
    expect(isPhoneMenu('To mark this message urgent, press star. To continue, press pound')).toBe(true);
    expect(isPhoneMenu('You can speak it or enter it using your keypad followed by the pound key')).toBe(true);
  });
  it('ignores people talking', () => {
    expect(isPhoneMenu('Hi, thanks for calling, this is Allie. How can I help you?')).toBe(false);
    expect(isPhoneMenu('We can press on with the booking for 2 people')).toBe(false);
  });
});

describe('promisesAction', () => {
  it('spots a spoken hand-off', () => {
    expect(promisesAction('Ah. Hmm. Lemme check on that real quick.')).toBe(true); // how speech-to-text wrote it on a call that went silent
    expect(promisesAction('Hmm, let me check on that real quick.')).toBe(true);
    expect(promisesAction('Perfect, thanks so much! Alright, bye!')).toBe(true);
  });
  it('ignores ordinary turns', () => expect(promisesAction("Yeah, it's seven three seven.")).toBe(false));
});

describe('missedHandoff', () => {
  it('catches a menu the caller talked over', () => {
    const lines = [line('them', MENU, 1), line('caller', '2.', 2)];
    expect(missedHandoff(lines, 0, new Set())).toEqual({ reason: 'menu', line: lines[0] });
  });
  it('trusts a hand-off that happened after the menu started', () => expect(missedHandoff([line('them', MENU, 1)], 5, new Set())).toBeNull());
  it('forces each menu once', () => expect(missedHandoff([line('them', MENU, 1)], 0, new Set([1]))).toBeNull());
  it('ignores an old menu once they have moved on', () => {
    expect(missedHandoff([line('them', MENU, 1), line('caller', '2.', 2), line('them', 'Hi, this is Allie.', 3)], 0, new Set())).toBeNull();
  });
  it('catches a spoken promise with no hand-off', () => {
    const lines = [line('them', 'I don’t see an account with this phone number.', 1), line('caller', 'Hmm, let me check on that real quick.', 2)];
    expect(missedHandoff(lines, 0, new Set())).toEqual({ reason: 'promise', line: lines[1] });
  });
  it('trusts a promise that was handed off', () => expect(missedHandoff([line('caller', 'Okay, bye!', 2)], 3, new Set())).toBeNull());
});

describe('forcedHandoffMessage', () => {
  it('tells the back office what to do and shows the conversation', () => {
    const lines = [line('them', MENU, 1), line('caller', '2.', 2)];
    const m = forcedHandoffMessage({ reason: 'menu', line: lines[0] }, lines);
    expect(m).toContain('press_digits');
    expect(m).toContain('them: Please listen carefully');
    expect(m).toContain('caller: 2.');
  });
});
