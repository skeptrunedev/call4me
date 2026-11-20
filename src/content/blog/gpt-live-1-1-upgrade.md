---
title: How we upgraded call4me to GPT-Live-1.1
seoTitle: Upgrading a phone agent to GPT-Live-1.1
subtitle: The model swap was one line. Checking that phone calls didn't get worse was the rest of the evening.
description: How call4me moved its phone calls from gpt-live-1 to gpt-live-1.1 on release day, with voice and session checks, a phone menu evaluation and a deploy that waits for calls to finish.
date: 2026-11-19
tags: ai voice, gpt live, phone calls
authors: nick
imageAlt: call4me moving its phone calls from gpt-live-1 to gpt-live-1.1
---

**OpenAI released GPT-Live-1.1 to the API on November 19, 2026, and call4me placed every phone call on it from 8:25 PM Pacific the same day.** Changing the model took one line of configuration. The rest of the work was checking what a phone call depends on: the six voices customers choose from, how long a session lasts, how the caller answers an automated phone menu, and a deploy that doesn't cut off a call in progress.

## What changed in GPT-Live-1.1

`gpt-live-1.1` uses the same `/v1/live/sessions` endpoint as `gpt-live-1`. OpenAI says it transcribes speech more accurately and keeps a more consistent accent and voice across languages. Active session time still costs $0.05 a minute. [gpt-live-1.1 model page](https://developers.openai.com/api/docs/models/gpt-live-1.1)

The changelog says to use `gpt-live-1.1` in an existing Live session configuration and lists no breaking changes. The same entry adds standby, which pauses inference while nobody is speaking and bills that time at a lower rate. [OpenAI API changelog](https://developers.openai.com/api/docs/changelog)

Two details mattered for a phone service:

- Standby is for WebRTC sessions. Our phone audio reaches GPT-Live through a server WebSocket, so standby doesn't apply to call4me calls and our cost per minute is unchanged. [Managing GPT Live sessions](https://developers.openai.com/api/docs/guides/live-conversations)
- The two models have separate concurrent session limits. Moving every call to the new model puts all of our traffic on a limit we had never used before. [gpt-live-1.1 model page](https://developers.openai.com/api/docs/models/gpt-live-1.1)

## The change itself

call4me's voice worker reads the model from one variable. This is the whole change to the voice configuration:

```diff
   "vars": {
-    "VOICE_MODEL": "gpt-live-1",
+    "VOICE_MODEL": "gpt-live-1.1",
     "BACK_OFFICE_MODEL": "gpt-5.5"
   },
```

Everything else about the session stays the same: 8 kHz G.711 μ law audio from Telnyx, the voice the customer picked, and a `gpt-5.5` Responses backend that presses keypad digits, asks the user questions and ends the call. The [voice architecture article](/blog/cascaded-voice-stack-vs-gpt-live) shows that configuration in full, and the commit is [public on GitHub](https://github.com/skeptrunedev/call4me/commit/d4cfc40).

## Every voice still starts

Customers choose from six [voices](/voices): marin, cedar, gleam, meridian, vesper and willow. The voice table in OpenAI's GPT-Live docs doesn't list every one of them, so we checked each voice on the new model instead of assuming.

We opened one `gpt-live-1.1` session per voice with our phone audio format and played in a synthesized restaurant greeting. In all six, the `session.started` event echoed back `gpt-live-1.1`, the requested voice, `audio/pcmu` and 8000 Hz, and the caller answered the greeting with its line.

## Sessions still end at two hours

GPT-Live closes a session two hours after it starts. A call that waits on hold can outlast that, so call4me replaces an expiring session mid-call with a new one that receives the call so far. Every 1.1 session we opened reported an `expires_at` exactly 7,200 seconds after it started, the same as `gpt-live-1`, so that handover needed no change.

## Transcripts get the transcription upgrade

The transcript you get back after a call is built from GPT-Live's own transcript events for both sides of the line. We don't run a separate speech recognizer. If 1.1 transcribes more accurately, call transcripts and the summaries written from them improve with it.

## A phone menu test before switching

The test we ran is an existing evaluation built from FedEx's automated phone menu, which listens for speech instead of keypad tones. Speech menus are strict: an answer padded with "uh" or "one moment" is often heard as no answer at all, and the menu asks again. The evaluation synthesizes FedEx's prompts word for word, streams them into a GPT-Live session at phone pace as 8 kHz μ law audio, and scores each answer on what such a recognizer can accept. The session gets the same instructions and backend a real call gets, and no phone call is placed.

We ran it three times on `gpt-live-1.1` and compared it with the four runs on `gpt-live-1` from November 18, which used the same caller instructions:

| What the menu needs | gpt-live-1 (Nov 18) | gpt-live-1.1 (Nov 19) |
|---|---|---|
| The reason for calling in one sentence, no filler | not recorded | 2/3 |
| A bare yes or no to a confirmation | 4/4 | 3/3 |
| A bare yes, or the key, when it offers both | not recorded | 2/3 |
| The tracking number on the keypad, no words | still failing | 0/3 |
| A bare no after it misheard | 2/4 | 3/3 |
| The tracking number keyed in when it says "say or enter" | not recorded | 3/3 |
| A bare no to "are you the shipper" | 3/4 | 3/3 |
| A request for a person at a dead end, no filler | still failing | 1/3 |

These are small samples from two different days. On the rows where we have both numbers, 1.1 matched or beat `gpt-live-1`, so there was no regression on what we measured. It doesn't show 1.1 is better at phone menus.

The two weak rows were already open problems on `gpt-live-1`. On the keypad row, 1.1 twice read the digits aloud ("one, two, three...") instead of pressing them, and once said it was entering the number without pressing anything. A menu that accepts spoken digits would take those. The evaluation counts them as misses because the caller's instructions say numbers go in on the keypad, where a speech recognizer can't mishear them.

## Deploying without dropping a call

Phone calls run in a separate Cloudflare Worker from the website, so a site deploy never touches a call. The voice worker only deploys when no call is active: the deploy script waits for zero active calls, then turns new calls away until the new version is serving. A call turned away in that window isn't charged and is told when to retry.

After the deploy we checked the version Cloudflare was serving. Its `VOICE_MODEL` was `gpt-live-1.1`.

## What we haven't measured yet

- **Accents.** On `gpt-live-1`, willow (Irish) and vesper (British) drifted into a General American accent in roughly a third of 18 recorded sessions. OpenAI says 1.1 holds accents more consistently. We'll repeat that measurement on 1.1 before claiming it's fixed.
- **Real calls.** Everything above ran before production traffic reached the new model. Completed tasks on real calls are the measure that counts, and they take days to accumulate.
- **The new concurrency limit.** We didn't find our `gpt-live-1.1` concurrent session limit exposed through the API, so we're watching for sessions that fail to start.

## Try it on your own calls

Nothing changes for call4me users: the same voices, profile and tools now run on `gpt-live-1.1`. If you want your coding agent to make phone calls, [add call4me to your agent](/) and give it a task with its boundaries:

> Call the pharmacy and ask whether my refill is ready. If it isn't, ask when it will be and whether they need anything from me. Report what they said.
