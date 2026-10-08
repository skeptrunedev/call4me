---
title: "Grok Bot calling skill: a draft method and review checklist"
seoTitle: "Grok Bot calling skill draft and checklist"
subtitle: Download a draft restaurant inquiry method, with documented saving controls and checks for fresh inputs and call evidence.
description: "A draft Grok Bot restaurant inquiry skill based on xAI documentation. Download the method and review its setup, permissions and expected results."
date: 2026-10-05
updated: 2026-10-07
tags: grok, skills, ai agents, ai phone assistant
authors: nick
imageAlt: A draft Grok Bot calling method with saving and reuse checks
---

**This is a draft restaurant inquiry method for a Grok Bot skill.** Its instructions request fresh inputs, a Call4Me access check and a report of unanswered questions.

[Download the complete draft method](/static/blog/resources/grok-bot-reusable-skills/restaurant-inquiry-method.md) and [the prompt to save it](/static/blog/resources/grok-bot-reusable-skills/save-skill.txt). The method is a Markdown file to review and attach to your Bot.

The save and reuse steps below follow xAI documentation; we have not verified them for this draft in the app. Our [October 4 Grok call](/blog/grok-connectors-mcp-phone-calls#an-actual-grok-bot-call-october-4) separately verified a working Call4Me connection and restaurant inquiry.

## Skill, routine or template?

Grok's [skills and routines documentation](https://docs.x.ai/grok-bot/skills-routines-and-automations) describes a skill as reusable task instructions and a routine as the rule for when a Bot should run a workflow. Your private skill library is shared across your own Bots, but each Bot still needs appropriate access.

A Bot template gives another person their own copy. Our [phone inquiry prompts](/blog/grok-bot-templates) are instruction files. For sharing, use the [recipient setup checklist](/blog/grok-bot-template-troubleshooting).

For the restaurant example, start with a skill you invoke deliberately. A recurring routine is usually unnecessary for a dinner plan whose date, party size and authorization change each time.

## Start from the result you actually obtained

Our existing restaurant call reached a recorded menu. It confirmed a general walk in policy, but did not confirm space for four people or a recommended arrival time. The result was partial.

That is useful material for a skill because it exposes a rule a simple happy path might miss: **a completed call can leave the task unresolved.** The skill should distinguish recorded policy from a live availability answer and keep unanswered questions in its final output.

## Separate the reusable method from private facts

Keep keys, signed recording links and personal contact details out of a shareable method. A skill needs to describe a connector requirement; it does not need to contain a credential.

## A complete instruction file you can adapt

The [draft method](/static/blog/resources/grok-bot-reusable-skills/restaurant-inquiry-method.md) specifies required inputs, account checks, permission for one call, a duration cap and the expected result. It includes failure handling and instructions to follow the same call ID before considering another call.

It covers an inquiry. Booking a table needs separate permission, acceptable times and cost limits.

## Ask Grok to save the reviewed method

Attach the file, or paste the instructions, then use this prompt:

> Create a skill called Restaurant availability inquiry from the attached method. Preserve its evidence checks, failure handling and approval boundaries. Do not copy the restaurant, dates, keys, recording links or personal details from our previous task. Show me the skill instructions before saving, then tell me how to invoke the saved skill. Do not create a routine or make a call.

The documentation says the desktop composer uses `/` to reference saved skills. If yours is missing, check **Marketplace**, **Your plugins**, **Manage plugins and skills**, then **Private skills**. These are documented controls; the saved skill still needs a test before you rely on it. [Official skills instructions](https://docs.x.ai/grok-bot/skills-routines-and-automations).

## Check reuse with preparation only

Open another Bot under your account and invoke the saved skill. Give it a different restaurant and ask for preparation only:

> Use Restaurant availability inquiry for [new restaurant], [date], [party size] and [time with time zone]. Check Call4Me access and required inputs, then show the call brief with a proposed [minutes] talk time cap. Do not place any call, book, leave a message or contact anyone.

Check that the output refers to the new request. If the Bot cannot access Call4Me, that is a connector setup issue; the method should explain the missing prerequisite rather than claim it made a call.

This second Bot check establishes reuse in your account when you run it successfully. It does not establish distribution to someone else's account. Use the [recipient setup checklist](/blog/grok-bot-template-troubleshooting) for that.

<span id="try-the-cases-that-break-a-weak-skill"></span>

## Review the expected behavior

[Download the validation matrix](/static/blog/resources/grok-bot-reusable-skills/validation-cases.csv). The expected behavior below is a requirement for your test, not an observed result from our app.

| Input or situation | Expected behavior |
| :--- | :--- |
| A complete request with preparation only | Research and proposed questions, no call |
| No date or time zone | Ask for those facts before contact |
| A different restaurant in a second Bot | Use the new inputs and check that Bot's access |
| Missing Call4Me connector | Explain the dependency and stop before a call |
| A recording says walk ins are welcome | Report policy without asserting party availability |
| A supplied transcript ends without the requested answer | Keep the question unresolved |
| A reservation would require a deposit | Ask for the specific approval before commitment |
| A tool returns an error after a call was created | Check the existing call before proposing another |

For the transcript and error cases, provide a clearly labelled simulated example and keep external tools disabled. You can test the reasoning without calling a business.

## Keep the skill useful as tools change

Update the method when a connector, website or output format changes. Repeat the relevant validation cases after each edit. Preserve the evidence and approval rules even when the successful path becomes simpler.

For other tasks, adapt the [service quote, cancellation and refund inquiry prompts](/blog/grok-bot-templates).
