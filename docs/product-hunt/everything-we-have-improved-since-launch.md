---
title: Everything we've improved in Call4me since launch
seoTitle: What's new in Call4me since launch
subtitle: Scheduled calls, your own caller ID, live listening, more international calling, and improvements shaped by your first calls.
description: See what's changed in Call4me since its September 30 launch, from scheduled calls and caller ID to recordings and better phone menu handling.
date: 2026-10-08
tags: product updates, call4me, ai phone assistant
authors: nick
imageAlt: What's new in Call4me since launch
---

I [introduced Call4me on Twitter](https://x.com/skeptrune/status/2105320262938009690) on September 30 because I wanted my assistant to handle phone calls without making me leave the conversation I was already having with it.

Since then, you've used it for everyday tasks like [booking a haircut with a preferred stylist](https://call4.me/blog/book-haircut-appointment) and [getting an oil change and tire rotation quote](https://call4.me/blog/les-schwab-oil-change). You've also told me where it gets stuck, what feels awkward, and what you want it to do next.

I've spent the time since launch working through that feedback. Here's what's changed.

## Schedule a call for later

You can now give your assistant the brief while you're thinking about it and have Call4me make the call later. That is useful when you've finished researching something but the business is closed.

Call4me keeps the schedule, so your agent session doesn't need to stay open. You can check the scheduled time, cancel before dialing, and come back in another session to retrieve the result. Give it the full details and the business's timezone, and leave enough credits for when the call starts.

The [scheduling guide](https://call4.me/blog/schedule-phone-calls-claude-code-codex) walks through the process, including how to change a time and check what actually happened.

## Listen while your assistant does the talking

You can listen to a call as soon as the business answers, or join while it is already underway. Nobody on the call can hear you, and the assistant keeps working. Press 1 when you want to take over.

I've also improved the existing handoff. When Call4me rings you to join a conversation, you press 1 before being connected, so your voicemail greeting doesn't get played to the business. Once you've taken over, your keypad works for phone menus. Press * or hang up your own phone to let the assistant continue.

You can also ask your agent to end a live call directly.

## Use your own number and choose how the caller introduces itself

You can verify your own phone number with a code and choose it as the caller ID for calls within that country. The business sees your number, and a return call reaches your phone directly.

There is also more control over the caller's identity. Give it an assistant name, or tell it which company it is calling from. A business call can introduce itself as “Jordan from Acme,” for example. Callbacks to the Call4me number can use that company identity too. Use a separate number for each company so callbacks reach the right identity.

For personal calls, the caller no longer has an assigned default persona. It identifies itself as your assistant when asked.

## Reach more businesses internationally

I've expanded international calling, including routes to supported European destinations, the UAE, and Japan that can use your Call4me US number.

You can buy and manage additional Call4me numbers through your account or assistant. Where Call4me has an active shared number in a country, you can use that route without buying your own number there. Availability still depends on the destination, carrier inventory, and local requirements.

International number orders now show a pending state while the carrier reviews them. I've also improved how interrupted orders are tracked, so a slow approval doesn't leave you wondering whether the purchase went through.

## Give longer tasks enough time

The short default call limit and the limit of two simultaneous calls are gone. Calls can keep going while your available credits cover them, within the maximum call duration.

You can still set a time limit for each task. That is especially useful when you want several calls running together: each call reserves credits against its allowed duration, so setting a budget leaves room for the others.

## Handle menus, holds, and voicemail more carefully

A lot of the work has been in the parts of a call nobody enjoys.

Phone menu handling now watches for repeated prompts and invalid input instead of simply repeating a route that failed. I've improved spoken requests for a representative, responses to language selection prompts, and keypad tones on international routes.

The caller has clearer instructions to stay quiet during recordings, hold music, and transfers. It also waits quietly while a person checks something, without the automatic “are you still there?” interruptions. Internal reasoning and stage directions should stay out of the spoken conversation.

Voicemail handling now distinguishes the greeting from the point where a message can actually be recorded. Automated call screening gets its own handling, and evidence that a person has answered takes priority over an earlier machine classification.

These are improvements to how the caller handles difficult situations. If it still gets stuck on a particular menu or conversation, please send me the call so I can investigate.

## Hear the voices and replay your calls

The new [voice preview page](https://call4.me/voices) lets you compare the available voices at phone audio quality before choosing one. There are samples in English, Mandarin Chinese, Hindi, Spanish, and Arabic.

You can also play and save available recordings directly from a completed call's account page, alongside its transcript and result. Your assistant can still retrieve recordings for you, as it could at launch.

The public examples now include more real calls with transcripts and timestamps you can click to hear the relevant moment. I've also fixed interruptions when switching between recordings. The [examples page](https://call4.me/examples) shows both the useful outcomes and the things a call left unresolved.

## Make setup and everyday use smoother

I've added more setup guides and real calling walkthroughs, improved connection instructions for Muse and Grok, published Call4me in the MCP Registry, and fixed an authentication discovery issue affecting Codex.

If a connection fails, the error is more specific about the problem. Call details also explain more clearly why a call ended. Emailed promotion links now apply the code before opening checkout.

Behind the scenes, website updates can go out without interrupting active calls. I've improved recovery when an audio connection is interrupted and the cleanup of calls that never started or whose hangup notification went missing, so their reserved credits can be released.

If you've already connected Call4me to your assistant, these improvements are available through the same account. The [Claude Code guide](https://call4.me/blog/claude-code-phone-calls) and [Codex guide](https://call4.me/blog/codex-phone-calls) are there if you need help getting connected again.

Thank you for trying it, sharing it, and telling me what needs work. Please keep sending me the calls you wish your assistant could handle better.

Nick
