---
title: "5 Grok Bot templates for everyday errands"
seoTitle: "5 useful Grok Bot templates for everyday errands"
subtitle: Copyable workflows for appointment searches, restaurant availability, service quotes, cancellation research and refund follow ups, with clear inputs and a useful finished result.
description: "Five Grok Bot workflow templates with copyable prompts, required inputs, approval points and result formats. Includes a downloadable prompt pack."
date: 2026-10-05
tags: grok, templates, ai agents, ai phone assistant
authors: nick
imageAlt: Five Grok Bot errand workflows, from a clear brief to a checked result
---

**A useful Grok Bot template saves you from explaining the same errand twice.** It tells the Bot what information to collect, which tools it needs, where it should stop and what the finished answer should contain.

Below are five workflows you can copy into a Bot today. [Download all five prompts](/static/blog/resources/grok-bot-templates/errand-prompts.txt), or copy the one you need. They are instructions you can adapt, not published Grok template install links. We have not run these five complete workflows in Grok Bot.

Our [existing Grok calling guide](/blog/grok-connectors-mcp-phone-calls) contains a real setup check and restaurant call. That call returned a general walk in policy from a recorded menu, but did not confirm space for our party. The templates below build that distinction into the result: a published policy, a live answer and an unanswered question should look different.

## What is a Grok Bot template?

A product template packages a Bot for someone else to add as their own copy. It can include instructions, selected context, skills and supported plugins. xAI warns that custom MCP servers, scripts and code may need separate setup. [Official template guide](https://x.ai/bot/guides/templates-for-grok-bot).

The workflows here are the content to put into your Bot before you share it. After a workflow works for you, [save its method as a skill](/blog/grok-bot-reusable-skills). If you want to distribute a product template, verify the recipient's setup using our [template troubleshooting checklist](/blog/grok-bot-template-troubleshooting).

## Set up only the access your task needs

You can start all five workflows with public websites and your own documents. For a task that needs a phone answer, connect [Call4Me using our Grok Bot setup guide](/blog/grok-connectors-mcp-phone-calls#how-to-add-an-mcp-server-to-grok-bot), then ask the Bot to run `call4me_get_balance`. Check that the returned account data belongs to you. This checks access without placing a call.

Before a call, tell the Bot which businesses it may contact and your call duration limit. Agree separately on the cost of using the calling service and anything the business might charge. Permission to ask about a quote does not mean permission to accept it.

For an account task, give the Bot the relevant receipt or conversation rather than access to your whole inbox when that is enough. Keep credentials out of prompts you plan to share.

## 1. Find an appointment that actually fits

**Use this when:** an appointment search keeps producing offices without a confirmed opening that works for you.

Give the Bot your location, appointment type, date range, time zone, travel limit and any provider preferences. For a medical appointment, decide what personal information it may disclose before contact. Insurance participation and your own coverage are separate questions.

```text
Help me find [appointment type] near [location], within [travel limit],
between [start date] and [end date]. My available times, with time zone,
are [windows]. My provider or insurance preferences are [preferences].

Start with public provider websites. Return a shortlist with source links
and the exact unanswered questions. Do not infer availability from office
hours or assume a provider accepts my specific insurance plan.

Before calling, show me the proposed businesses, published phone numbers,
questions and maximum duration per call. Wait for my permission to call.
If approved, check call4me_get_requirements and ask for missing information
in one message. Do not book, provide payment details or agree to fees.

Return provider, location, offered slot with time zone, whether that slot
is held, coverage questions, source and what I need to do next.
If a slot was not confirmed, say availability is unknown.
```

**What a useful result contains:** a table of specific options, with a separate field for whether an opening was actually offered. A provider being open on Tuesday is not evidence of a Tuesday appointment.

**Check before relying on it:** ask which answers came from a person, which came from a website and which are still missing. Time sensitive openings can disappear before you book.

## 2. Check restaurant availability before making plans

**Use this when:** you need to know whether a restaurant can accommodate your party, rather than whether its website says walk ins are welcome.

```text
Check [restaurant] for a party of [size] on [date] around [time and time zone].
Our flexibility is [alternate times]. Relevant needs are [accessibility,
seating or dietary questions]. Do not invent a dietary need.

Check the restaurant's own website and booking page first. Distinguish a
visible reservation slot from a general walk in policy. If the answer
needs a call, show me the published number, questions and duration limit,
then wait for my permission.

If I approve a call, ask about space for this party, recommended arrival
time, wait estimate and any deposit or cancellation conditions. Do not
reserve, pay, request a callback or leave a voicemail without approval.

Return confirmed facts, their source, unresolved questions and the next
step. If only a menu answers, label its statements as recorded policy,
not a live availability confirmation.
```

**What a useful result contains:** an answer to the specific party and date, or a plain statement that availability is unresolved. The distinction matters even when a call is marked complete.

**Check before relying on it:** inspect the transcript or recording if the summary turns a general policy into a guaranteed table. Our [actual Grok restaurant call](/blog/grok-connectors-mcp-phone-calls#an-actual-grok-bot-call-october-4) is an example of a narrower result.

Here is how that existing October 4 call should read in this template's output format:

| Field | Supported result |
| :--- | :--- |
| Restaurant and request | Foreign Cinema, dinner for four that evening |
| Confirmed policy | Recorded menu says walk ins are accepted |
| Availability for four | Unconfirmed |
| Recommended arrival time | Unanswered |
| Source | Restaurant recording in the completed call |
| Next step | Obtain a specific availability answer before treating the plan as confirmed |

## 3. Compare service quotes on the same scope

**Use this when:** you have several headline quotes but cannot tell whether they cover the same job.

```text
Help compare providers for [service] at [location]. The exact scope is
[items, dimensions, condition and access constraints]. My timing is
[window]. My requirements are [requirements].

Find suitable providers from their own websites. Draft one scope brief
to use for every provider. Ask me to review it before contacting anyone.
Show proposed recipients, published contact details and contact method.

If I approve contact, ask each provider about the same scope: what is
included, exclusions, possible extra charges, earliest availability,
whether an onsite visit is required and how long the estimate is valid.
Do not accept a quote, schedule work, pay a deposit or send photos without
my approval. Do not supply a budget I have not given you.

Return comparable quotes with scope, inclusions, exclusions, estimate
versus confirmed quote, availability, source and missing information.
Do not rank a provider as cheapest while material charges remain unknown.
```

**What a useful result contains:** one row per provider and the same scope in every row. For junk removal, for example, access stairs, item volume and disposal restrictions can change what a headline estimate means.

**Check before relying on it:** choose an unresolved field and ask the Bot to trace it to the provider's answer. A missing charge should remain unknown, not become zero. [Download a comparison worksheet](/static/blog/resources/grok-bot-templates/service-comparison.csv).

## 4. Research cancellation before changing the account

**Use this when:** you want to understand the deadline, required method and consequences before cancelling a subscription.

```text
Help me understand how to cancel [service]. My relevant plan information
is [plan and renewal date, if known]. Start with official cancellation
instructions and the documents I provide.

Separate public policy from terms specific to my account. Identify the
cancellation method, renewal cutoff, required account holder steps,
fees stated in my terms and whether cancelling affects remaining access.
If the policy or account terms are missing, mark the answer unknown.

Prepare the exact steps and any questions for support. Do not cancel,
change billing, accept a retention offer or contact support yet. If an
answer requires contact, show me the proposed questions and ask first.

Return the policy source and date checked, account facts, unresolved
questions, proposed next action and the approval needed to perform it.
```

**What a useful result contains:** an actionable plan, with the renewal cutoff tied to your account documents where available. A generic policy may not establish the terms you agreed to.

**Check before relying on it:** make sure the Bot has not treated a cancellation guide as a cancellation receipt. If you later authorize cancellation, require confirmation and a reference from the service.

## 5. Follow up on a refund without promising an outcome

**Use this when:** a promised refund is overdue and you need a clear status rather than another generic support answer.

```text
Help follow up on my refund from [merchant]. The purchase reference is
[reference], the relevant timeline is [dates], and I will provide the
receipt and prior support messages. Use only the documents I provide.

Build a short factual timeline. Separate a refund request, merchant
approval and payment actually received. Identify the missing evidence.
Draft the support questions and let me review before any contact.

If I approve contact, ask whether the refund was approved, when it was
submitted, where it was sent, the reference available to me and the
stated next step if it has not arrived. Do not accept store credit,
close the case, change payment details or threaten legal action.

Return merchant confirmed facts, documents that support them, questions
still open and the next check I need to make with the payment provider.
Do not label the refund received unless there is evidence of receipt.
```

**What a useful result contains:** a status and reference you can act on. A merchant saying it issued a refund is a different fact from money arriving in your account.

**Check before relying on it:** compare the summary with the support response and your payment record. Keep an unresolved discrepancy visible.

## Test a workflow before you turn it into a template

Start with preparation only. Replace the bracketed inputs, give the Bot the relevant documents and ask it to produce a proposed action without contacting anyone. Check three things: it asks for missing facts, it produces the promised output and it stops before the approval boundary.

Next, test an awkward input. Remove the date, provide conflicting availability or omit an account reference. The Bot should identify the gap rather than quietly guess. These are suggested checks for your setup, not results from a test we have already run.

Once an authorized task produces a useful result, save the corrected process as a [reusable Grok skill](/blog/grok-bot-reusable-skills). If you share it, include the setup steps too. The next person needs their own working access, not just a good prompt.
