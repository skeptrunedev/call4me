---
title: OpenAI realtime voices on a real phone call: marin vs cedar vs gleam vs meridian
seoTitle: OpenAI realtime voices on a real phone call
subtitle: Hear marin, cedar, gleam and meridian in five languages, then inspect repeated calls captured at the receiving end. We test dates, times, reference codes and corrections, with the recordings and transcription disagreements included.
description: "Compare OpenAI realtime voices marin, cedar, gleam and meridian on real SIP calls. Hear samples and inspect date, time, code and correction tests."
date: 2026-09-30
updated: 2026-10-07
tags: ai voice, openai, phone calls, ai phone assistant
authors: nick
imageAlt: OpenAI realtime voices on a real phone call, four voices compared
---

**The short answer:** call4me's caller can speak in four OpenAI realtime voices: **marin** (the default), **cedar**, **gleam** and **meridian**. Our original samples let you compare delivery at 8 kHz phone quality. The October 4 tests below add repeated carrier SIP calls captured at the receiving end, including a corrected appointment and a reference code. Those are different kinds of evidence: a sample can show how a voice sounds, while a received call can test whether facts survive the route.

In the original English samples, gleam was slowest and cedar was fastest. That describes one line per voice, rather than a general reliability ranking. All four introduce themselves as your assistant, with no name of their own.

If you are adding calling to an existing coding agent, [our Claude Code guide](/blog/claude-code-phone-calls) and [Codex guide](/blog/codex-phone-calls) cover MCP installation and an actual call workflow. This page focuses on the voice and what arrives at the other end.

## Received call test: dates, times, codes and corrections

On October 4, 2026 (Pacific time), we ran three calls per voice to an isolated receiving endpoint we control. Each call used `gpt-live-1`, the same instructions, the same recorded receiver prompts and Telnyx carrier SIP routing. Both sides streamed mono 8 kHz PCMU. The receiving application captured the caller channel after it passed through the carrier.

This is a controlled SIP experiment, not a call to a public telephone number or a test of a particular handset. The evaluation bridge uses the voice model directly. It does not run call4me's full production calling workflow, menu tools or agent supervision. For a real business call started by an agent, see [the Grok Bot recording](/blog/grok-connectors-mcp-phone-calls#an-actual-grok-bot-call-october-4).

### The fixed task

| Field | Initial request | After the receiver's correction |
| :--- | :--- | :--- |
| Appointment date | October 12, 2026 | October 22, 2026 |
| Time | 7:15 PM | 6:45 PM |
| Time zone | Pacific | Pacific |
| Reference code | B7Q29, letters and digits said separately | B7Q29, unchanged |

These are synthetic test facts, rather than anyone's appointment or private reference code. The caller was told not to make a booking or perform an action.

The receiver played these same three prompts in every call:

1. “This is the automated voice test line. Please read the appointment date, time, time zone and reference code.”
2. “Correction. Change the appointment to October twenty second, twenty twenty six, at six forty five P M Pacific time. Keep the same reference code. Please read back the corrected date, time, time zone and reference code.”
3. “Thank you. The test is complete. Goodbye.”

The receiver voice was `ash` from `gpt-4o-mini-tts`, generated once for the whole set and converted to PCMU. The runner waited for a spoken reply and two seconds of quiet before advancing, with a 100 second safety cap. Voice order changed between rounds. Setup pilots validated the fixture before this twelve call set; they are excluded from the results.

### What the scores mean

We sent each initial and corrected readback window from the received WAV to two separate OpenAI transcription models, `whisper-1` and `gpt-4o-transcribe`. Neither received the expected date, time, code, a language hint or a transcript prompt. We checked their text against the known facts. Each voice therefore has six readbacks, including three corrections.

The metric is **automated recognizability**. It measures what these transcription models recovered from this route, voice, wording and test harness. It is not a human listening score or proof that an unrecognized code was spoken incorrectly. The caller model's own output transcript is diagnostic evidence only, and does not determine the score.

For dates we require the correct month, day and year. For times we accept punctuation differences, including `7.15`, `7:15` and `715`, but require PM. “Pacific” or its abbreviation “PT” must appear for the named zone; this does not score a UTC offset. For the code we ignore spaces and punctuation, but require exactly `B7Q29`. An omitted code or `B7229` fails that field. We do not repair code characters using the expected answer.

### Results from all twelve calls

Counts below are successful recognitions out of six readbacks per voice. “Both” means both transcription models recovered the field from the same window. All three corrected dates and times per voice were recovered by both models.

| Voice | Date, both | Time, both | Named zone, both | Code, Whisper | Code, GPT 4o |
| :--- | ---: | ---: | ---: | ---: | ---: |
| marin | 6/6 | 6/6 | 6/6 | 2/6 | 2/6 |
| cedar | 6/6 | 6/6 | 6/6 | 5/6 | 6/6 |
| gleam | 6/6 | 6/6 | 6/6 | 5/6 | 6/6 |
| meridian | 6/6 | 6/6 | 6/6 | 6/6 | 5/6 |

Across all 24 readbacks, both models recovered the exact reference code in 17. They disagreed on three, and both missed or changed it on four. Our default marin had the fewest exact code recognitions in this particular set. That is a reason to test the facts your own calls depend on, rather than choosing from a description like “warm” or “synthetic.” Three calls per voice are too few to establish a general voice ranking.

The disagreements are concrete:

* Cedar round 1, initial readback: Whisper returned `B7229`, while GPT 4o returned `B7Q29`.
* Meridian round 2, corrected readback: Whisper returned `B7Q29`, while GPT 4o returned the incomplete `B72`.
* Gleam round 2, initial readback: Whisper returned `B7229`, while GPT 4o returned `B7Q29`.

The caller model’s own output text contains the intended `B7Q29` in every call. That does not settle how its spoken characters sounded at the receiving end. We preserve the failed recognitions rather than replacing them with the intended text.

Transcription context matters too. On meridian round 1, Whisper’s full MP3 transcription returned October 12 for the corrected appointment, while both models recovered October 22 from the corrected WAV window. On cedar round 3, GPT 4o abbreviated Pacific Time as PT in the initial window. The scorer accepts that named zone abbreviation. These examples show why one automatic transcript is a weak substitute for checking a recording and its known facts.

### Hear every received call and inspect the scored text

Each player is the complete caller channel captured by the receiver. The receiver’s voice is on a separate track, so its prompts appear as silence here. The WAV links are the exact initial and corrected windows submitted to ASR, rather than complete calls. Transcripts below are machine outputs, not human verified words. Code punctuation is simplified for readability; the [downloadable result ledger](/static/blog/received-voice-results-2026-10-04.json) preserves the returned text, hashes, expected facts and field scores.

#### marin

<details>
<summary>Round 1, 1:01, trial t1</summary>

<audio controls preload="none" src="/static/blog/received-t1-marin.mp3" style="width:100%"><a href="/static/blog/received-t1-marin.mp3">Listen to marin, round 1</a></audio>

Captured duration: 60.76 seconds. Missing packet time: 20 ms. The initial stream offset is separately preserved as 20 ms.

**0:11** Initial readback. [Download the scored WAV window](/static/blog/received-t1-marin-initial.wav).

**Whisper:** Appointment date is October 12, 2026. Time is 7.15 p.m. Pacific Time. Reference code is B 7 2 3 1.

**GPT 4o transcription:** Appointment date is October 12, 2026. Time is 7:15 PM Pacific Time. Reference code is B 7

**0:41** Corrected readback. [Download the scored WAV window](/static/blog/received-t1-marin-corrected.wav).

**Whisper:** October 22, 2026 at 6.45 p.m. Pacific time. Reference code is B.

**GPT 4o transcription:** October 22, 2026 at 6:45 p.m. Pacific Time. Reference code is B

</details>

<details>
<summary>Round 2, 1:06, trial t8</summary>

<audio controls preload="none" src="/static/blog/received-t8-marin.mp3" style="width:100%"><a href="/static/blog/received-t8-marin.mp3">Listen to marin, round 2</a></audio>

Captured duration: 66.16 seconds. Missing packet time: 0 ms. The initial stream offset is separately preserved as 20 ms.

**0:10** Initial readback. [Download the scored WAV window](/static/blog/received-t8-marin-initial.wav).

**Whisper:** Appointment date, October 12, 2026, time, 7.15 p.m. pacific time. Reference code, B7Q29.

**GPT 4o transcription:** Appointment Date: October 12, 2026. Time: 7:15 PM Pacific Time. Reference Code: B7Q29.

**0:43** Corrected readback. [Download the scored WAV window](/static/blog/received-t8-marin-corrected.wav).

**Whisper:** Appointment date, October 22, 2026, time, 645 p.m. Pacific time. Reference code B7229.

**GPT 4o transcription:** Appointment Date: October 22, 2026. Time: 6:45 PM Pacific Time. Reference Code: B7229.

</details>

<details>
<summary>Round 3, 1:06, trial t11</summary>

<audio controls preload="none" src="/static/blog/received-t11-marin.mp3" style="width:100%"><a href="/static/blog/received-t11-marin.mp3">Listen to marin, round 3</a></audio>

Captured duration: 65.92 seconds. Missing packet time: 0 ms. The initial stream offset is separately preserved as 20 ms.

**0:11** Initial readback. [Download the scored WAV window](/static/blog/received-t11-marin-initial.wav).

**Whisper:** Appointment date is October 12, 2026. Time is 7.15 p.m. Pacific Time. Reference code is B7Q29.

**GPT 4o transcription:** Appointment date is October 12, 2026. Time is 7:15 pm Pacific Time. Reference code is B 7 Q 2 9.

**0:43** Corrected readback. [Download the scored WAV window](/static/blog/received-t11-marin-corrected.wav).

**Whisper:** Corrected appointment date is October 22, 2026. Time is 645 PM Pacific Time. Reference code is B7229.

**GPT 4o transcription:** Corrected appointment date is October 22, 2026. Time is 6:45 PM Pacific Time. Reference code is B72Q9

</details>

#### cedar

<details>
<summary>Round 1, 1:06, trial t2</summary>

<audio controls preload="none" src="/static/blog/received-t2-cedar.mp3" style="width:100%"><a href="/static/blog/received-t2-cedar.mp3">Listen to cedar, round 1</a></audio>

Captured duration: 65.76 seconds. Missing packet time: 20 ms. The initial stream offset is separately preserved as 20 ms.

**0:11** Initial readback. [Download the scored WAV window](/static/blog/received-t2-cedar-initial.wav).

**Whisper:** The appointment date is October 12, 2026. The time is 7.15 p.m. Pacific Time. The reference code is B7229.

**GPT 4o transcription:** The appointment date is October 12, 2026. The time is 7:15 PM Pacific Time. The reference code is B7Q29.

**0:43** Corrected readback. [Download the scored WAV window](/static/blog/received-t2-cedar-corrected.wav).

**Whisper:** The corrected appointment date is October 22, 2026. The time is 645 p.m. Pacific Time. The reference code is B7Q29.

**GPT 4o transcription:** The corrected appointment date is October 22, 2026. The time is 6:45 PM Pacific time. The reference code is B7Q29.

</details>

<details>
<summary>Round 2, 1:10, trial t7</summary>

<audio controls preload="none" src="/static/blog/received-t7-cedar.mp3" style="width:100%"><a href="/static/blog/received-t7-cedar.mp3">Listen to cedar, round 2</a></audio>

Captured duration: 70.08 seconds. Missing packet time: 20 ms. The initial stream offset is separately preserved as 20 ms.

**0:10** Initial readback. [Download the scored WAV window](/static/blog/received-t7-cedar-initial.wav).

**Whisper:** Appointment Date October 12, 2026 Time 7.15 PM Pacific Time Reference Code B7Q29

**GPT 4o transcription:** Appointment Date: October 12, 2026 Time: 7:15 PM Pacific Time Reference Code: B7Q29

**0:42** Corrected readback. [Download the scored WAV window](/static/blog/received-t7-cedar-corrected.wav).

**Whisper:** Appointment date, October 22nd, 2026, time 645 p.m. Pacific time. Reference code B7Q29.

**GPT 4o transcription:** Appointment Date: October 22, 2026, Time: 6:45 PM Pacific Time, Reference Code: B7Q29

</details>

<details>
<summary>Round 3, 1:09, trial t12</summary>

<audio controls preload="none" src="/static/blog/received-t12-cedar.mp3" style="width:100%"><a href="/static/blog/received-t12-cedar.mp3">Listen to cedar, round 3</a></audio>

Captured duration: 68.76 seconds. Missing packet time: 20 ms. The initial stream offset is separately preserved as 20 ms.

**0:12** Initial readback. [Download the scored WAV window](/static/blog/received-t12-cedar-initial.wav).

**Whisper:** Appointment Date October 12, 2026 Time 7.15pm Pacific Time Reference Code B7Q29

**GPT 4o transcription:** Appointment Date: October 12, 2026. Time: 7:15 p.m. PT. Reference Code: B7Q29

**0:44** Corrected readback. [Download the scored WAV window](/static/blog/received-t12-cedar-corrected.wav).

**Whisper:** Corrected appointment date, October 22, 2026. Time 645 p.m. Pacific Time. Reference code B7Q29.

**GPT 4o transcription:** Corrected appointment date: October 22, 2026. Time: 6:45 PM (Pacific Time). Reference code: B7Q29.

</details>

#### gleam

<details>
<summary>Round 1, 1:09, trial t3</summary>

<audio controls preload="none" src="/static/blog/received-t3-gleam.mp3" style="width:100%"><a href="/static/blog/received-t3-gleam.mp3">Listen to gleam, round 1</a></audio>

Captured duration: 69.36 seconds. Missing packet time: 20 ms. The initial stream offset is separately preserved as 20 ms.

**0:11** Initial readback. [Download the scored WAV window](/static/blog/received-t3-gleam-initial.wav).

**Whisper:** Appointment date October 12, 2026, time 7.15 p.m. Pacific time. Reference code is B7Q29.

**GPT 4o transcription:** Appointment date October 12, 2026. Times 7:15 PM Pacific Time. Reference code is B7Q29

**0:45** Corrected readback. [Download the scored WAV window](/static/blog/received-t3-gleam-corrected.wav).

**Whisper:** Corrected appointment date, October 22, 2026, time, 645 p.m., Pacific time. Reference code, B7Q29.

**GPT 4o transcription:** Corrected appointment date October 22, 2026. Time 6:45 p.m. Pacific Time. Reference Code B7Q29.

</details>

<details>
<summary>Round 2, 1:09, trial t6</summary>

<audio controls preload="none" src="/static/blog/received-t6-gleam.mp3" style="width:100%"><a href="/static/blog/received-t6-gleam.mp3">Listen to gleam, round 2</a></audio>

Captured duration: 69.26 seconds. Missing packet time: 20 ms. The initial stream offset is separately preserved as 20 ms.

**0:11** Initial readback. [Download the scored WAV window](/static/blog/received-t6-gleam-initial.wav).

**Whisper:** Appointment date is October 12, 2026. Time is 7.15 PM Pacific Time. Reference code is B7229.

**GPT 4o transcription:** Appointment date is October 12, 2026, time is 7:15 PM Pacific Time. Reference code is B7Q29.

**0:44** Corrected readback. [Download the scored WAV window](/static/blog/received-t6-gleam-corrected.wav).

**Whisper:** Corrected appointment date is October 22, 2026. Time is 645 p.m. Pacific Time. Reference code is B7Q29.

**GPT 4o transcription:** Corrected appointment date is October 22, 2026. Time is 6:45 PM Pacific Time. Reference code is B7Q29.

</details>

<details>
<summary>Round 3, 1:06, trial t9</summary>

<audio controls preload="none" src="/static/blog/received-t9-gleam.mp3" style="width:100%"><a href="/static/blog/received-t9-gleam.mp3">Listen to gleam, round 3</a></audio>

Captured duration: 66.48 seconds. Missing packet time: 0 ms. The initial stream offset is separately preserved as 20 ms.

**0:11** Initial readback. [Download the scored WAV window](/static/blog/received-t9-gleam-initial.wav).

**Whisper:** Appointment date, October 12, 2026, time, 715 PM Pacific Time. Reference code B7Q29.

**GPT 4o transcription:** Appointment Date: October 12, 2026. Time: 7:15 PM Pacific Time. Reference Code: B7Q29.

**0:43** Corrected readback. [Download the scored WAV window](/static/blog/received-t9-gleam-corrected.wav).

**Whisper:** Appointment date, October 22, 2026, time, 645 p.m., Pacific time. Reference code B7Q29.

**GPT 4o transcription:** Appointment date October 22, 2026. Time: 6:45 PM Pacific Time. Reference code B7Q29

</details>

#### meridian

<details>
<summary>Round 1, 1:06, trial t4</summary>

<audio controls preload="none" src="/static/blog/received-t4-meridian.mp3" style="width:100%"><a href="/static/blog/received-t4-meridian.mp3">Listen to meridian, round 1</a></audio>

Captured duration: 66.02 seconds. Missing packet time: 0 ms. The initial stream offset is separately preserved as 20 ms.

**0:10** Initial readback. [Download the scored WAV window](/static/blog/received-t4-meridian-initial.wav).

**Whisper:** The appointment is on October 12, 2026 at 7.15pm Pacific Time. Reference code is B7Q29.

**GPT 4o transcription:** The appointment is on October 12, 2026, at 7:15 PM Pacific Time. Reference code is B7Q29.

**0:43** Corrected readback. [Download the scored WAV window](/static/blog/received-t4-meridian-corrected.wav).

**Whisper:** The appointment is October 22, 2026, at 6.45 p.m. Pacific Time. Reference code is B7Q29.

**GPT 4o transcription:** The appointment is October 22nd, 2026, at 6:45 PM Pacific Time. Reference code is B7Q29.

</details>

<details>
<summary>Round 2, 1:03, trial t5</summary>

<audio controls preload="none" src="/static/blog/received-t5-meridian.mp3" style="width:100%"><a href="/static/blog/received-t5-meridian.mp3">Listen to meridian, round 2</a></audio>

Captured duration: 62.76 seconds. Missing packet time: 0 ms. The initial stream offset is separately preserved as 20 ms.

**0:11** Initial readback. [Download the scored WAV window](/static/blog/received-t5-meridian-initial.wav).

**Whisper:** Appointment Date October 12, 2026 Time 7.15 PM Pacific Time Reference Code B7Q29

**GPT 4o transcription:** Appointment Date: October 12, 2026. Time: 7:15 PM Pacific Time. Reference Code: B7Q29

**0:42** Corrected readback. [Download the scored WAV window](/static/blog/received-t5-meridian-corrected.wav).

**Whisper:** Appointment date, October 22, 2026, time, 645 p.m. Pacific time. Reference code B7Q29.

**GPT 4o transcription:** Appointment Date: October 22, 2026, Time: 6:45 PM Pacific Time, Reference code: B72

</details>

<details>
<summary>Round 3, 1:07, trial t10</summary>

<audio controls preload="none" src="/static/blog/received-t10-meridian.mp3" style="width:100%"><a href="/static/blog/received-t10-meridian.mp3">Listen to meridian, round 3</a></audio>

Captured duration: 67.18 seconds. Missing packet time: 0 ms. The initial stream offset is separately preserved as 20 ms.

**0:11** Initial readback. [Download the scored WAV window](/static/blog/received-t10-meridian-initial.wav).

**Whisper:** Appointment Date October 12, 2026 Time 7.15 PM Pacific Time Reference Code B7Q29

**GPT 4o transcription:** Appointment date: October 12, 2026. Time: 7:15 pm, Pacific Time. Reference code: B7Q29.

**0:44** Corrected readback. [Download the scored WAV window](/static/blog/received-t10-meridian-corrected.wav).

**Whisper:** Appointment date, October 22, 2026, time, 645 p.m., Pacific Time, reference code B7Q29. B7Q29. Thank you.

**GPT 4o transcription:** Appointment Date: October 22, 2026. Time: 6:45 PM (Pacific Time). Reference Code: B7Q29.

</details>


### Repeat the experiment

The [call fixture](https://github.com/skeptrunedev/call4me/blob/main/scripts/eval-received-voices.mjs) and [analysis command](https://github.com/skeptrunedev/call4me/blob/main/scripts/analyze-received-voices.mjs) are in our repository. The fixture requires your own Telnyx account, an owned caller ID, an OpenAI key, FFmpeg and a tunnel. It creates a separate SIP application restricted to your own connections, and deactivates that application at the end. It does not change a customer's phone number routing.

```bash
node --env-file=.dev.vars --import tsx scripts/eval-received-voices.mjs \
  --out /private/voice-evidence \
  --cloudflared /path/to/cloudflared \
  --ffmpeg /path/to/ffmpeg \
  --from YOUR_OWNED_NUMBER --trials 3

node --env-file=.dev.vars scripts/analyze-received-voices.mjs \
  --out /private/voice-evidence --ffmpeg /path/to/ffmpeg
```

These are paid carrier and model calls, not a free offline test. Keep the raw evidence outside git. Review the source audio and independent export transcription before publishing anything. Our static players preserve the complete received caller channel, including silence while the receiver speaks. We normalize loudness and export MP3 without shortening it or adding the receiver's synthetic voice to the capture. The separate WAV downloads are the exact scored readback windows, without loudness normalization, so you can run your own transcription model on the same inputs.

The packet assembler preserves the actual 8 kHz sample clock and inserts silence for missing packets instead of joining the surrounding words. Packet gap totals are included with each recording. This matters when comparing delivery: a recording assembled with the wrong timestamp unit can appear much longer than the call.

If you are choosing an architecture rather than a voice, [the cascaded stack versus GPT Live guide](/blog/cascaded-voice-stack-vs-gpt-live) explains the components. These trials do not compare those architectures or establish a ranking against Vapi, Bland or Twilio.

## Listen to all four direct voice samples at phone quality

Every original sample is the same line, recorded directly from the voice model in 8 kHz μ law. These samples did not traverse a carrier or a receiving phone. They show delivery at the source codec, without establishing exactly what a business hears. The simulated business greeting was "Hi, thanks for calling Rosa's Kitchen, how can I help you?"

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

We measured each sample's speaking speed, typical pitch, and pitch movement (in semitones, between its lowest and highest tenth of voiced speech).

| Voice | Length | Words per minute | Typical pitch | Pitch movement |
|---|---:|---:|---:|---:|
| marin (default) | 6.1 s | 215 | 222 Hz | 10.2 semitones |
| cedar | 5.9 s | 222 | 160 Hz | 9.7 semitones |
| gleam | 7.2 s | 184 | 232 Hz | 11.8 semitones |
| meridian | 6.2 s | 213 | 129 Hz | 10.5 semitones |

One take per voice and one line, so treat the numbers as a description of these samples rather than a law. Two things still stand out:

- **gleam takes its time.** It's about 15% slower than the others and has the most melody in it. That's the voice our early user liked best after calling himself with three of them.
- **cedar is quick and flat.** It's the fastest and moves its pitch the least. The same user said it sounded synthetic.

## Every voice in the five most spoken languages

All four voices speak the five most spoken languages by total speakers in Ethnologue 2025: English, Mandarin Chinese, Hindi, Spanish, and Standard Arabic. English is above. These samples were recorded the same way, from GPT-Live at 8 kHz, and a separate speech transcription model checked that every full line was spoken.

### Mandarin Chinese

> <span lang="zh">您好！我是Alex的助理。我想订今晚七点左右四个人的位子，请问还有空位吗？</span>

Hello! I'm Alex's assistant. I'd like to book a table for four tonight around seven. Is there still space?

**marin** (default)

<audio controls preload="metadata" src="/static/voices/marin-zh.mp3" style="width:100%"><a href="/static/voices/marin-zh.mp3">listen to marin</a></audio>

**cedar**

<audio controls preload="metadata" src="/static/voices/cedar-zh.mp3" style="width:100%"><a href="/static/voices/cedar-zh.mp3">listen to cedar</a></audio>

**gleam**

<audio controls preload="metadata" src="/static/voices/gleam-zh.mp3" style="width:100%"><a href="/static/voices/gleam-zh.mp3">listen to gleam</a></audio>

**meridian**

<audio controls preload="metadata" src="/static/voices/meridian-zh.mp3" style="width:100%"><a href="/static/voices/meridian-zh.mp3">listen to meridian</a></audio>

### Hindi

> <span lang="hi">नमस्ते! Alex की तरफ़ से कॉल है। आज रात करीब सात बजे चार लोगों के लिए टेबल मिल सकती है क्या?</span>

Hello! Calling for Alex. Could we get a table for four people tonight around seven?

**marin** (default)

<audio controls preload="metadata" src="/static/voices/marin-hi.mp3" style="width:100%"><a href="/static/voices/marin-hi.mp3">listen to marin</a></audio>

**cedar**

<audio controls preload="metadata" src="/static/voices/cedar-hi.mp3" style="width:100%"><a href="/static/voices/cedar-hi.mp3">listen to cedar</a></audio>

**gleam**

<audio controls preload="metadata" src="/static/voices/gleam-hi.mp3" style="width:100%"><a href="/static/voices/gleam-hi.mp3">listen to gleam</a></audio>

**meridian**

<audio controls preload="metadata" src="/static/voices/meridian-hi.mp3" style="width:100%"><a href="/static/voices/meridian-hi.mp3">listen to meridian</a></audio>

### Spanish

> <span lang="es">¡Hola! Llamo de parte de Alex. Quería reservar una mesa para cuatro esta noche, alrededor de las siete. ¿Tienen algo disponible?</span>

Hi! I'm calling for Alex. I wanted to book a table for four tonight, around seven. Do you have anything available?

**marin** (default)

<audio controls preload="metadata" src="/static/voices/marin-es.mp3" style="width:100%"><a href="/static/voices/marin-es.mp3">listen to marin</a></audio>

**cedar**

<audio controls preload="metadata" src="/static/voices/cedar-es.mp3" style="width:100%"><a href="/static/voices/cedar-es.mp3">listen to cedar</a></audio>

**gleam**

<audio controls preload="metadata" src="/static/voices/gleam-es.mp3" style="width:100%"><a href="/static/voices/gleam-es.mp3">listen to gleam</a></audio>

**meridian**

<audio controls preload="metadata" src="/static/voices/meridian-es.mp3" style="width:100%"><a href="/static/voices/meridian-es.mp3">listen to meridian</a></audio>

### Arabic

> <span lang="ar" dir="rtl">مرحباً! أتصل من طرف أليكس. أودّ حجز طاولة لأربعة أشخاص الليلة حوالي الساعة السابعة. هل لديكم شيء متاح؟</span>

Hello! I'm calling for Alex. I'd like to book a table for four tonight around seven. Do you have anything available?

**marin** (default)

<audio controls preload="metadata" src="/static/voices/marin-ar.mp3" style="width:100%"><a href="/static/voices/marin-ar.mp3">listen to marin</a></audio>

**cedar**

<audio controls preload="metadata" src="/static/voices/cedar-ar.mp3" style="width:100%"><a href="/static/voices/cedar-ar.mp3">listen to cedar</a></audio>

**gleam**

<audio controls preload="metadata" src="/static/voices/gleam-ar.mp3" style="width:100%"><a href="/static/voices/gleam-ar.mp3">listen to gleam</a></audio>

**meridian**

<audio controls preload="metadata" src="/static/voices/meridian-ar.mp3" style="width:100%"><a href="/static/voices/meridian-ar.mp3">listen to meridian</a></audio>

Arabic taught us something useful: transcription models misheard our first wording, <span lang="ar" dir="rtl">أتصل نيابةً عن</span> ("calling on behalf of"), on phone audio for three of the four voices. We switched to the plainer <span lang="ar" dir="rtl">أتصل من طرف</span> ("calling for"), and all four came through clearly. Pick plain, common phrasing for calls in another language.

French is sixth, but we've used it on real calls to businesses in Montreal. The caller held whole calls in French when asked to "speak French first", and once replied in French on its own when the business answered in French. To pick a language, tell your agent "speak Spanish first"; it puts that in the call request. There's no separate language parameter. The [voices page](/voices) has every voice in all five languages.

## Which voice to pick, and when

- **Leave it on marin** if you don't have a preference. It's the voice in the recordings across [our other posts](/blog): restaurants, a dentist, a gym, retailers, and phone trees.
- **Try gleam if you prefer the slower original sample.** One early user liked it. That preference does not establish better outcomes at a busy front desk.
- **Pick meridian if you want a lower voice.** It's the lowest of the four by a wide margin.
- **Try cedar if you prefer the faster original sample.** One early user called it synthetic. That is a subjective reaction, and does not measure whether dates or codes are recovered correctly.

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

Until September 30, marin had a name: Sarah Harris. The other three voices didn't. It started with good intentions. On September 28 we fixed a worse problem: early on, when a business asked who was calling, the caller sometimes gave the account owner's name, as if it were them. We changed it to introduce itself as the owner's assistant, and gave the default voice a name so "what's your name?" had an answer.

We went back through every call with a transcript, 109 real conversations, and counted:

- The caller called itself **Sarah in 54** of them.
- People on the line **asked the caller's name 6 times**, across 5 calls. In two of those calls, both before the September 28 fix, the caller answered with the owner's name. That's the bug the persona was meant to replace.
- People on the line **called it "Sarah" back in 6 calls**, like the hauler in [our junk removal post](/blog/junk-removal-cost) who signed off with "Sounds good, Miss Sarah".
- People on the line **asked if they were talking to an AI 2 times.** It said yes both times and kept going.

An early user placed three test calls to himself and said marin introducing itself as "Sarah" was odd. We removed that default name to make its instructions consistent with the other voices.

The instruction change:

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

The current personal caller instructions say to get to the request without an introduction, and identify itself as the assistant if asked. Instructions describe intended behavior; the recording establishes what happened.

<span id="how-to-tell-if-a-voice-is-ai-on-a-phone-call"></span>

## What the AI questions establish

The two explicit AI questions count what people asked. They do not measure how many recognized the caller as AI without asking.

The caller is instructed to answer honestly when asked directly. This excerpt remains in the current instructions:

```text
Only if they ask directly whether you're an AI, a bot, or a real person, don't deny it:
say it lightly and keep going, e.g. "Ha, yeah, I'm an AI assistant working for Alex.
Just trying to grab that table for four at seven." If they'd rather not deal with an AI,
thank them and hand off to hang up (end_call).
```

<span id="how-to-make-an-ai-voice-sound-more-human-on-the-phone"></span>

## The phone audio setting

The caller uses this 8 kHz format. The samples above let you compare voices at that format:

```json
{ "audio": { "format": { "type": "audio/pcmu", "rate": 8000 }, "output": { "voice": "marin" } } }
```

## How we recorded the original direct samples

The original five language samples come from [our recording script](https://github.com/skeptrunedev/call4me/blob/main/scripts/record-voice-samples.mjs). It opens one voice session per voice, plays the synthetic business greeting in at 20 ms per frame, and keeps the model's reply directly. It does not dial a carrier endpoint. One detail worth knowing if you build something similar: the voice model streams audio for the whole session, silence included, so "no more audio" never tells you it's done talking. The transcript does:

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
