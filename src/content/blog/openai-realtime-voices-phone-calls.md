---
title: OpenAI realtime voices on a real phone call: marin vs cedar vs gleam vs meridian
seoTitle: OpenAI realtime voices on a real phone call
subtitle: We recorded the same line in all four voices at phone quality, measured how each one speaks, and dropped the name our default voice used after 109 real calls. Here's what we found and which voice to pick.
description: Hear marin, cedar, gleam, and meridian on a real phone line, with measured pitch and pace, which voice to pick, and why our caller no longer uses a name.
date: 2026-09-30
tags: ai voice, openai, phone calls, ai phone assistant
authors: nick
imageAlt: OpenAI realtime voices on a real phone call, four voices compared
---

**The short answer:** call4me's caller can speak in four OpenAI realtime voices: **marin** (the default), **cedar**, **gleam**, and **meridian**. Phone audio cuts everything above 4 kHz, so on a call, pitch and pace are most of what separates them. gleam is the slowest and moves its pitch the most, and it's the one an early user preferred. cedar is the fastest and the flattest, and the same user called it synthetic. All four now introduce themselves the same way, as your assistant, with no name of their own.

Search for these voices and you get OpenAI's own pages and a forum thread asking for samples. So here are samples, on the kind of line they'll actually be used on.

## Listen to all four voices on a phone line

Every sample is the same line, recorded straight from the voice model in the format a phone call uses (8 kHz μ-law), so you hear exactly what the business hears. The business side was a recorded "Hi, thanks for calling Rosa's Kitchen, how can I help you?"

> Hi! This is Alex's assistant. I was hoping to get a table for four tonight, around seven. Do you have anything open?

**marin** (default)

<audio controls preload="metadata" src="/static/voices/marin.mp3" style="width:100%"><a href="/static/voices/marin.mp3">listen to marin</a></audio>

**cedar**

<audio controls preload="metadata" src="/static/voices/cedar.mp3" style="width:100%"><a href="/static/voices/cedar.mp3">listen to cedar</a></audio>

**gleam**

<audio controls preload="metadata" src="/static/voices/gleam.mp3" style="width:100%"><a href="/static/voices/gleam.mp3">listen to gleam</a></audio>

**meridian**

<audio controls preload="metadata" src="/static/voices/meridian.mp3" style="width:100%"><a href="/static/voices/meridian.mp3">listen to meridian</a></audio>

The same samples are on the [voices page](/voices), which is the one to send someone who just wants to pick.

## How each voice speaks, measured

Adjectives like "warm" and "crisp" don't survive a phone line, so we measured the samples instead: how fast each voice says the 22-word line, its typical pitch, and how much its pitch moves (in semitones, between its lowest and highest tenth of voiced speech).

| Voice | Length | Words per minute | Typical pitch | Pitch movement |
|---|---:|---:|---:|---:|
| marin (default) | 6.1 s | 215 | 222 Hz | 10.2 semitones |
| cedar | 5.9 s | 222 | 160 Hz | 9.7 semitones |
| gleam | 7.2 s | 184 | 232 Hz | 11.8 semitones |
| meridian | 6.2 s | 213 | 129 Hz | 10.5 semitones |

One take per voice and one line, so treat the numbers as a description of these samples rather than a law. Two things still stand out:

- **gleam takes its time.** It's about 15% slower than the others and has the most melody in it. That's the voice our early user liked best after calling himself with three of them.
- **cedar is quick and flat.** It's the fastest and moves its pitch the least. The same user said it sounded synthetic. A small difference in numbers, but on a phone line, where there's little else to go on, flat delivery is what people notice.

## Which voice to pick, and when

- **Leave it on marin** if you don't have a preference. It's the voice in the recordings across [our other posts](/blog): restaurants, a dentist, a gym, retailers, and phone trees.
- **Pick gleam for calls where patience matters**: a front desk that's busy, a rep who's reading something back slowly, anything where a slower, more expressive caller feels friendlier.
- **Pick meridian if you want a lower voice.** It's the lowest of the four by a wide margin.
- **Try cedar before relying on it.** Listen to the sample first; it's the one most likely to sound like a machine.

Picking one is a single argument on the call. Tell your agent "use the gleam voice" and it passes it along:

```json
{
  "name": "call4me_place_call",
  "arguments": {
    "to": "+1 555 010 0199",
    "business": "Rosa's Kitchen",
    "category": "restaurant",
    "goal": "Book a table for four tonight around 7",
    "voice": "gleam"
  }
}
```

Leave `voice` out and the call uses marin.

## Why our caller stopped using a name

Until today, marin had a name: Sarah Harris. The other three voices didn't. It started with good intentions. On September 28 we fixed a worse problem: early on, when a business asked who was calling, the caller sometimes gave the account owner's name, as if it were them. We changed it to introduce itself as the owner's assistant, and gave the default voice a name so "what's your name?" had an answer.

We went back through every call with a transcript, 109 real conversations, and counted:

- The caller called itself **Sarah in 54** of them.
- People on the line **asked the caller's name 6 times**, across 5 calls. In two of those calls, both before the September 28 fix, the caller answered with the owner's name. That's the bug the persona was meant to replace.
- People on the line **called it "Sarah" back in 6 calls**, like the hauler in [our junk removal post](/blog/junk-removal-cost) who signed off with "Sounds good, Miss Sarah".
- People on the line **asked if they were talking to an AI 2 times.** It said yes both times and kept going.

Then the feedback came in. An early user set call4me up and placed three test calls to himself, and wrote back that marin introducing itself as "Sarah" was odd. He's right. When you call yourself, a stranger's name for your own assistant is jarring, and on a business call a name only changes anything when someone asks for it, which happened 6 times in 109 calls. It also made marin behave differently from the other three voices for no reason anyone could see.

So we removed it. The diff in the caller's instructions:

```diff
-/** "Sarah, Nick's assistant" when the voice has a name, else "Nick's assistant". */
-const whoIAm = (assistantName: string | null, owner: string) =>
-  (assistantName ? `${firstName(assistantName)}, ${owner}'s assistant` : `${owner}'s assistant`);
+/** How the caller introduces itself: "Nick's assistant". */
+const whoIAm = (owner: string) => `${owner}'s assistant`;
+
+const nameRule = (owner: string) =>
+  `- If they ask your name, you're ${owner}'s assistant; you don't need a name of your own.`;
```

Every voice now opens with "Hi! This is [your name]'s assistant", and if someone asks its name, it says it's your assistant and doesn't need one.

## How to tell if a voice is AI on a phone call

From the side that makes the calls: on a short business call, mostly you can't, and people rarely try. In 109 conversations the question came up twice. What gives an AI caller away usually isn't the voice:

- **Reading everything back.** Real people don't repeat the whole booking at the end of a call. Our caller doesn't either.
- **Narrating what it's doing.** "I'm going to press 2 now" is something no person says. It's an open bug for us; it still happens.
- **Pauses in the wrong places.** A caller that waits too long after "how can I help you?" sounds like a machine thinking.
- **A recording notice or a disclosure script up front.** We don't record calls and don't open with one.

The one thing call4me won't do is lie about it. If someone sincerely asks whether they're talking to an AI, the caller says yes. This is the rule, word for word:

```text
Only if they ask directly whether you're an AI, a bot, or a real person, don't deny it:
say it lightly and keep going, e.g. "Ha, yeah, I'm an AI assistant working for Alex.
Just trying to grab that table for four at seven." If they'd rather not deal with an AI,
thank them and hand off to hang up (end_call).
```

## How to make an AI voice sound more human on the phone

What we changed, roughly in order of how much it mattered:

1. **Test at phone quality, not in a demo.** A voice that sounds rich at 24 kHz loses most of what made it sound rich at 8 kHz. Choose by listening at the format your calls use. This is the session setting our caller runs with:

   ```json
   { "audio": { "format": { "type": "audio/pcmu", "rate": 8000 }, "output": { "voice": "marin" } } }
   ```

2. **One sentence to get to the point.** "Hi! This is Alex's assistant, I was hoping to get a table for four tonight, around seven?" People on business lines want the ask in the first breath.
3. **Let them talk first.** The caller waits for "thanks for calling" before it speaks, and only says "Hi, hello?" if nobody has said anything.
4. **Don't read back, don't narrate, don't disclaim.** See above.
5. **Be honest about who it is.** It's your assistant, not you, and it says so.

## How we recorded the samples

The samples on this page come from a script in our repository that opens one voice session per voice, plays the business greeting in at 20 ms per frame the way a phone line streams it, and keeps the caller's reply. One detail worth knowing if you build something similar: the voice model streams audio for the whole session, silence included, so "no more audio" never tells you it's done talking. The transcript does:

```js
// The voice model streams audio frames the whole session, silence included,
// so the transcript (not the audio) says when it stopped talking.
if (msg.type === 'session.output_transcript.delta') {
  transcript += msg.delta;
  lastWordAt = Date.now();
}
```

Then each clip is trimmed of silence at both ends and loudness-normalized, the same way as the [example calls](/examples).

## Let your agent make the call

call4me is an AI phone assistant that works inside the agent you already use (Claude Code, Codex, ChatGPT). You tell your agent what to get done; it calls in the voice you picked, talks to the business like a person would, asks you mid-call if something comes up, and reports back with the outcome and transcript.

If you use call4me, paste this into your agent:

> Use the gleam voice for my calls. Call [business] at [phone number] and [what you want done]. Ask me before agreeing to anything that costs money, and tell me the result in one or two lines.
