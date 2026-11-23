import assert from 'node:assert/strict';
import test from 'node:test';
import { unreachableNote } from '../src/server/voice/person';

test('a ring to join that the phone declines says so, and how to let the number through', () => {
  for (const sip of ['603', '607', '608']) {
    assert.equal(
      unreachableNote('Anna', '+12627930354', sip),
      "Anna's phone declined the call from +12627930354: it may be on Do Not Disturb or blocking unknown callers, and saving +12627930354 as a contact lets it ring through",
    );
  }
  assert.equal(unreachableNote('Anna', undefined, '603'), "Anna's phone declined the call");
});

test('a busy line and a ring nobody answered keep their own notes', () => {
  assert.equal(unreachableNote('Anna', '+12627930354', '486'), "Anna's line was busy");
  for (const sip of ['487', '480', null, undefined]) assert.equal(unreachableNote('Anna', '+12627930354', sip), "Anna didn't join (no answer or voicemail)");
});
