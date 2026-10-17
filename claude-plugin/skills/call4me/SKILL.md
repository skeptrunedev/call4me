---
name: call4me
description: Place real phone calls for the user with call4me. Use when the user asks you to call a business, book something by phone (restaurant table, doctor, dentist, vet, salon, car service), get a quote, check stock or hours, or find something out from a business that has no online way to do it. Also use to follow, join, or cancel a call already placed, or to schedule one for later.
---

# call4me

call4me gives you one capability: a phone call. A caller that sounds like a normal person dials the business, has the conversation, asks you mid-call when it needs something it wasn't given, and hands you the outcome and a transcript. The tools come from the call4me connector bundled with this plugin; the user signs in to their call4me account the first time it is used.

Credits are prepaid on the call4me website. Answered call time is billed per minute (whole minutes on hold at half the rate); unanswered calls are free. `call4me_get_balance` shows the balance, the price per minute, and the minutes left. If the balance is too low, tell the user they can add credits on the call4me website.

## Setup

Call `call4me_get_balance` and show the user their actual call4me numbers from the returned `numbers` list. Suggest saving them as a contact named call4me: calls go out from these numbers, and businesses call back on them. If `phone_number` is null and `numbers` is empty, explain that the free US number is assigned on the first call and show it then. Never invent a number.

These numbers are separate from the user's own phone saved in `call4me_get_profile`. call4me may ring that personal phone when a business needs them to verify their account, or when they ask to join a call. They answer and press 1 to join, and press * or hang up to hand the call back to the caller.

## Collect everything before dialing

The caller can only say what you give it.

1. Ask what the user wants done first. Do not collect a personal profile during setup.
2. Pick the category and call `call4me_get_requirements` with it. Call `call4me_get_profile` to reuse what is already saved. Ask the user in one message (not one question at a time) for every required field you don't have, plus the per-call details: reason, dates and times that work, party size, and what the caller may accept without asking.
3. Ask for sensitive details (date of birth, home address, insurance IDs, VIN) only when this call needs them, and explain why. Giving a detail for one call does not mean saving it: offer `call4me_save_profile` for details the user wants reused, and save only with their agreement. Never ask for a Social Security number, card numbers, or passwords.
4. Find the business's number (search the web if needed) and check it is the right location.

## Place and follow the call

1. Confirm with the user, then call `call4me_place_call` with `to`, `business`, `goal`, `category`, `details` (answers by field key), and `flexibility`. If it answers "Not calling yet", ask the user exactly what it lists and try again.
2. Show the returned `calling_number`: the call4me number that may ring the user. It is not the business's number. Suggest saving it if this is their first call or a different number than before.
3. Poll `call4me_get_call` with `wait_seconds: 30` until it is finished. If it lists `open_questions`, the business is waiting on the line: answer right away with `call4me_answer_question`.
4. Tell the user the result in a line or two, including anything to note (a confirmation number, a time to show up). `call4me_get_recordings` has the audio if they want it.

## Put the user on the line

- Pass `connect_when` to `call4me_place_call` (for example "as soon as a person picks up") so the user skips the hold, or call `call4me_connect_me` mid-call. Hold time is still billed, at half the call rate.
- To have them listen without taking over, pass `listen_in: true` to `call4me_place_call` or `mode: "listen"` to `call4me_connect_me`. Nobody on the call hears them, and they press 1 anytime to take over.
- Always give a heads up before a call may ring them, with the actual `calling_number` from `call4me_get_call` (for a new call, show it as soon as `call4me_place_call` returns).
- To end a call early, use `call4me_hang_up`.

## Callbacks and scheduled calls

- Voicemail or "we'll call you back" is not a dead end. The business sees the call's `calling_number` as the callback, and when it calls back within 14 days call4me answers and finishes the task. Check `call4me_get_call` on the original call later; it lists the callbacks and their outcomes. If `callback_number` names another phone (the user's mobile, an assistant's line), callbacks ring that phone instead.
- To call later (the business is closed, or the user wants a set time), gather everything the same way and use `call4me_schedule_call` with `call_at` in the business's hours. It is checked now and dialed then, when nobody may be following it, so give it every fact and all the flexibility it needs. Tell the user when it will dial. `call4me_list_calls` shows what is scheduled, `call4me_get_call` with the `sched_` id shows how it went, and `call4me_cancel_scheduled_call` calls it off.

## Rules

Only call businesses and services the user wants to reach, never personal numbers that don't expect the call. No telemarketing, surveys, collections, emergency services, or premium-rate numbers. The caller calls for the user and never pretends to be them. Businesses in the US, Canada, and Europe can always be called. Full rules: https://call4.me/rules
