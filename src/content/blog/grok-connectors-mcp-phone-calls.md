---
title: "Grok connectors and MCP: how to add custom tools to Grok (and make phone calls)"
seoTitle: Grok connectors and MCP servers, explained
subtitle: Set up custom tools on grok.com, in Grok Bot or through the xAI API. Then hear our actual Grok Bot restaurant call, including the partial answer and the menu problem.
description: "Add a custom Grok MCP connector and hear a real Grok Bot phone call. Setup, authentication, recording, transcript and what the call did not confirm."
date: 2026-10-01
updated: 2026-10-05
tags: grok, mcp, ai agents, ai phone assistant
authors: nick
imageAlt: Grok connectors and MCP servers, with phone calls as the worked example
---

**The short answer:** yes, Grok supports MCP. Grok connectors are how Grok reaches tools and data outside the chat, and besides the built-in ones (Gmail, Google Drive, Outlook, Salesforce and others), you can add any public MCP server as a custom connector. Where you add it depends on which Grok you use: on **grok.com** you add it yourself at grok.com/connectors, in **Grok Bot** you ask the Bot to add a custom MCP server, and with the **xAI API** you pass the server in the `tools` array of your request. The worked example below adds call4me, an MCP server that makes phone calls, so Grok can call a restaurant or a doctor's office for you.

We support Grok as one of the agents call4me works with, and the first version of our setup instructions mixed up grok.com and Grok Bot. So this page sorts out the three, using xAI's own docs.

## What are Grok connectors?

Grok connectors let Grok read and act on your other tools from inside a conversation. xAI's [connectors page](https://docs.x.ai/grok/connectors) lists three kinds:

- **Built-in connectors.** The docs list Google Drive, Gmail and Google Calendar, Outlook Mail and Calendar, SharePoint, OneDrive, Microsoft Teams, and Salesforce. You add one at grok.com/connectors, click **New Connector**, pick the service, and sign in.
- **Catalog connectors.** These are listed integrations you can choose from the connector catalog.
- **Custom connectors.** Any MCP server you point Grok at. This is the one that matters if the tool you want isn't on the list.

## Does Grok support MCP?

Yes. Grok's MCP support covers all three xAI products: the grok.com chat (custom connectors), Grok Bot (custom MCP servers), and the xAI API (remote MCP tools). Here's how xAI MCP support works in each.

| Where you use Grok | How you add an MCP server | Who adds it |
|---|---|---|
| Grok chat on grok.com | grok.com/connectors, **New Connector**, **Custom** | You, in settings |
| Grok Bot (desktop and mobile app) | Ask the Bot in chat, or **Setup**, **Plugins**, **Add** on a Team Bot | The Bot, from your chat message |
| xAI API | A `"type": "mcp"` entry in the request's `tools` array | Your code |

Two rules apply everywhere:

- **The server has to be on the public internet.** xAI's [tunneling page](https://docs.x.ai/grok/connectors/custom-mcp-tunneling) says Grok will reject `localhost` and private addresses like `192.168.x.x`. If you're running one on your laptop, you need a tunnel such as ngrok.
- **Streamable HTTP or SSE only.** The [API docs](https://docs.x.ai/developers/tools/remote-mcp) say "Only Streaming HTTP and SSE transports are supported." A server you start as a local command won't work on grok.com or through the API.

## How to add a custom MCP server on grok.com

This is the one most people mean by "Grok connectors". In xAI's [setup instructions](https://docs.x.ai/grok/connectors), open grok.com/connectors, click **New Connector**, select **Custom**, enter the server URL and complete authentication.

Grok then finds the tools the server offers and makes them available in your chats, the same way as the built-in connectors.

One thing that trips people up: **the Grok chat can't add a connector for you.** If you paste a setup prompt into grok.com that says "add this MCP server", Grok has no tool to do it. You do this step yourself in settings, then come back to the chat.

On **Grok Business and Enterprise** plans there's an extra step first. According to xAI's [connector management page](https://docs.x.ai/grok/connector-management), a team admin adds the server in the xAI console (console.x.ai, **Grok Business**, **Connectors**, **+ Add Connector**, **Other**, then the MCP server URL). After that, team members connect it on grok.com/connectors.

## What is Grok Bot?

Grok Bot is xAI's app for persistent AI teammates that keep context across tasks ([Grok Bot docs](https://docs.x.ai/grok-bot/overview)). The parts that matter for adding tools:

- **Each Bot has its own computer.** Bots work on a persistent cloud computer with a browser, files, and a terminal, and keep working while your laptop is closed.
- **You set it up by messaging it.** That's also how you add a custom MCP server, as shown below.
- **It runs everywhere.** macOS, Windows, Linux, iOS, and Android.
- **It comes with Cursor or SuperGrok.** It's included with every paid individual Cursor plan and the Cursor Teams plan, and you can link a SuperGrok, SuperGrok Plus, or SuperGrok Heavy subscription instead.

That makes it different from the grok.com chat: grok.com answers questions and uses the connectors you add in settings, while a Bot does multi-step work and can wire up its own tools when you ask.

## How to add an MCP server to Grok Bot

Grok Bot is xAI's agent app: each Bot has its own cloud computer with a browser, files, and a terminal, and you work with it by messaging it ([Grok Bot docs](https://docs.x.ai/grok-bot/get-started)). Unlike the grok.com chat, a Bot can set up its own tools. For a Team Bot, xAI's [Team Bots page](https://docs.x.ai/grok-bot/team-bots) says the Bot's **Setup** section has **Plugins**, **Secrets**, **Skills**, and **Files**, and you "Choose **Add** on any row, or ask the Bot in chat."

Custom MCP servers come in two types:

- **Remote HTTPS**, a server at a public URL. This is the right choice for anything that needs a key or a sign-in.
- **Command**, a server the Bot starts on its own computer. xAI warns that teammates can read a Command server's arguments, so never put a credential in them.

The quickest way is to ask in chat:

> Add a custom MCP server called call4me at `https://call4.me/mcp/YOUR-KEY` (remote HTTPS, no headers, no auth).

Say "custom MCP server" so the Bot doesn't go looking for a ready-made plugin with a similar name instead.

### What happened when we tried it

We ran this on October 1, 2026 in the Grok Bot desktop app on a Mac, with a real call4me account.

1. **The app wanted an update first.** It opened to a mandatory "Restart to update" screen, so we restarted it before doing anything else.
2. **There was no form for this.** We looked through the integrations marketplace and the installed plugins screen and found no obvious place to type in a custom MCP server. So we went back to the chat.
3. **The chat did all of it.** We asked the Bot to add a custom remote server named `call4me` at our personal call4me URL, HTTPS, no headers, no extra authentication. There was no separate approval dialog. The Bot set it up from the conversation and reported that `call4me` was connected and exposed **15 tools**.
4. **Then we asked it something real:** "Use call4me to check my balance." The Bot called the new tool and came back with the balance, worked out that it was about 32 minutes of calls at $0.25 a minute, noted that UAE calls cost $0.40 a minute, confirmed the monthly reload was off, and listed the account's calling numbers. That last part is the giveaway that it was reading live account data, not echoing our prompt back.

That's the whole setup: one message, and the Bot connects it. Check the URL is right before you send it.

Treat that personal URL like a password: it has your key in it. Paste it only into the Bot's chat, not into anything you share.

### The Team Bot credential trap

How a plugin signs in decides whose account the Bot uses. From the Team Bots table:

| Plugin | Whose access the Bot uses |
|---|---|
| Signs in with an account (OAuth) | The person talking to the Bot |
| Configured with a key or token | The Bot's own credential, the same for everyone |
| Custom MCP server, Remote HTTPS | The Bot's own credential, or each person's sign-in if the server uses OAuth |

So on a **Team Bot**, a URL with your personal key in it means every teammate who asks the Bot to do something does it on your account. For call4me, that means calls billed to you. On a Team Bot, add the sign-in version (`https://call4.me/mcp`) so each teammate connects their own account. On your own personal Bot, the key URL is simpler.

## How to use MCP servers with the xAI API

If you're building your own Grok agent, the API connects to MCP servers for you. You add the server to the `tools` array, and xAI handles the connection. The settings, from the [remote MCP docs](https://docs.x.ai/developers/tools/remote-mcp):

| Setting | Required | What it does |
|---|---|---|
| `server_url` | Yes | The MCP server's URL. Streaming HTTP or SSE only. |
| `server_label` | Yes | A name for the server, used to label its tools |
| `authorization` | No | A token sent in the Authorization header |
| `headers` | No | Extra headers (`extra_headers` in the native SDK) |

This mirrors xAI's own example, with call4me as the server:

```bash
curl https://api.x.ai/v1/responses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $XAI_API_KEY" \
  -d '{
  "model": "grok-4.7",
  "input": [
    { "role": "user", "content": "Call Rosa'\''s Kitchen at +1 555 010 0199 and book a table for 4 tonight around 7." }
  ],
  "tools": [
    {
      "type": "mcp",
      "server_url": "https://call4.me/mcp/YOUR-CALL4ME-KEY",
      "server_label": "call4me"
    }
  ]
}'
```

This uses the personal server URL, which carries your key, so there's nothing else to configure. call4me also accepts the key as an `Authorization: Bearer` header on `https://call4.me/mcp`, which is what the `authorization` setting is for, but xAI's docs don't say whether it adds the `Bearer ` prefix for you, so the key URL is the safer choice. We haven't run this exact request against xAI's API ourselves.

## Worked example: give Grok a phone with call4me

### An actual Grok Bot call, October 4

We went beyond the October 1 balance check. In Grok Bot 0.63.0 on a Mac, we reopened the existing Bot with its installed call4me connector and asked it to make one informational call to [Foreign Cinema's published number](https://foreigncinema.com/location-hours/), +1 415 648 7600. The app required sign in again; after signing in, the existing conversation and connector were available.

The question was whether four people could walk in for dinner that Sunday evening, and what arrival time the restaurant recommended. We allowed three minutes, with no booking, purchase, callback, message or call to our own phone.

| Step | What we observed |
| :--- | :--- |
| Start the call from Grok Bot | A real call was created, `call_vbphp5uiz7j2k9py`, with the requested restaurant, goal and three minute cap |
| Follow the result | Grok reported the recorded menu and returned the completed call's partial outcome and transcript |
| Stop the call | The call record names `call4me_hang_up` as the reason it ended. This was a stop from the Bot's tool workflow |
| Retrieve a recording | Grok returned the recording metadata. We separately matched the downloaded WAV to the exact provider call leg |
| Confirm the requested facts | The recording says walk ins are accepted and dinner starts at 5 PM. No person confirmed space for four or a recommended arrival time |

This establishes a real calling workflow in the tested personal Grok Bot conversation. It does not establish a call through grok.com, the xAI API or a Team Bot.

### Hear the complete call

The recording lasts 1 minute 49 seconds. The original audio and timing are preserved, with loudness normalization. It contains the restaurant's recording, a brief caller interjection and automated prompts. No live staff member spoke.

<audio controls preload="metadata" src="/static/blog/grok-foreign-cinema-walk-ins.mp3" style="width:100%"><a href="/static/blog/grok-foreign-cinema-walk-ins.mp3">Listen to the Grok Bot call</a></audio>

<details>
<summary>Recording transcript</summary>

The transcript uses independent speech transcription checked against the saved call transcript. Unclear or disputed words are marked. The audio is the primary evidence.

**0:00** Restaurant recording: Hello, and thank you for calling Foreign Cinema. To reach our main line or make a reservation, press one. For private dining, press two. Please leave a voicemail so we may return your call as we may be assisting another guest.

**0:17** Restaurant recording: Dinner is served seven days a week beginning at five PM. Weekend brunch begins at ten thirty AM. Films begin at sunset in our outdoor courtyard and play continuously until closing.

**0:31** Restaurant recording: Reservations are encouraged, and walk ins are warmly accepted.

**0:36** Restaurant recording: Laszlo, our classic cocktail bar, is open daily, features the Foreign Cinema menu with weekend brunch service starting at eleven AM. No cover charge or reservations required. Street parking is available, as is the Mission Bartlett parking garage at twenty first Street.

**0:59** Caller: [Brief unclear interjection. The saved call transcript renders this as “Um, hmm.”]

**1:15** Automated prompt: To inquire for a reservation, please leave a message after the tone.

**1:32** Automated prompt: I did not hear you. Please try again.

**1:40** Automated prompt: I did not hear you. Please try again.

**1:48** Automated prompt: [Final words are unclear. The saved call transcript ends “Sorry, you're”; independent transcriptions disagree about the rest.]

</details>

The menu route did not produce a person. We did not capture a native keypad action trace, so this recording cannot establish which digit was sent or grade menu navigation as successful. The caller also made a brief sound while the recording played, and the Bot stopped the call after further automated prompts. **Immediate silent hangup was not demonstrated.** Grok's summary said no voicemail was left; we did not obtain a mailbox receipt or other independent confirmation of that claim.

The useful result was narrower than the request: the menu supplied a general walk in policy, while the party size and arrival time questions remained unanswered. That distinction matters when your agent turns a call into an answer. The [phone calling MCP comparison](/blog/phone-calling-mcp-comparison) contains separate Vapi and Bland menu attempts; it is not a matched performance test against this call.

### A prompt you can adapt

> Use call4me to make one informational call to [business] at [published number]. Ask [questions]. Do not book, buy anything or request a callback. Cap the call at three minutes. Follow call4me_get_call until it ends, then return the actual call id, confirmed facts and unanswered questions. Retrieve recording metadata with call4me_get_recordings. Do not make a second call.

Use explicit permission and spending limits that fit your own task. If no message may be left, say so, and check the recording before treating a summary's “no voicemail” claim as verified.

### Troubleshooting the tested workflow

| Symptom | What to check |
| :--- | :--- |
| The app opens to sign in instead of your Bots | Sign back into the account that owns the Bot. This happened on our October 4 run; our existing setup was available afterward |
| Setup reports tools, but you have not tested access | Ask for `call4me_get_balance`. Our October 1 run verified live account data. A connector being listed is a weaker check |
| Grok shows “Connecting to Call4me” | In this run the activity label stayed visible while a real call was in progress. It did not mean that the call had failed. Use the returned call id to check the call state |
| The answer says “completed,” but your question is unresolved | Inspect the outcome and recording. This call ended normally with a partial result, rather than a human answer |
| A recording link stops working | Ask `call4me_get_recordings` for fresh metadata. Grok returned a temporary provider link; the reviewed player above uses a static export |

### Setup reference for the three Grok surfaces

call4me is an MCP server that places real phone calls. Your agent hands it a goal ("book a table for four at seven"), a voice caller talks to the business like a person would, and your agent gets the outcome and transcript back. It works in Claude Code, Codex, ChatGPT and Claude, and the same server works in Grok.

**1. Get your server URL.** Sign in at [call4.me](https://call4.me). Your personal server URL is on [your account page](/login?next=/account). It has your key in it, so treat it like a password.

**2. Add it to Grok.**

- **grok.com:** go to grok.com/connectors, **New Connector**, **Custom**, and paste your personal URL. Or paste `https://call4.me/mcp` and sign in to call4me when asked.
- **Grok Bot:** tell your Bot "Add a custom MCP server called call4me at [your personal URL] (remote HTTPS, no headers, no auth)". On a Team Bot, use `https://call4.me/mcp` instead (see the credential trap above).
- **xAI API:** the `tools` entry in the example above, with your key in the URL.

**3. Check the tools showed up.** Once connected, Grok can see tools like these:

| Tool | What it does |
|---|---|
| `call4me_place_call` | Calls a business with a goal, the facts it needs, and what it may agree to |
| `call4me_get_call` | Follows a call: status, live transcript, and the outcome when it ends |
| `call4me_answer_question` | Answers a question the caller asks mid-call, while the business waits |
| `call4me_connect_me` | Rings your phone to join the call, or just to listen in |
| `call4me_get_requirements` | Lists what a kind of call needs before dialing (a doctor's office needs a date of birth, a restaurant needs a party size) |
| `call4me_get_balance` | Shows your credits and your call4me phone numbers |

Ask Grok to run `call4me_get_balance` first. If it answers with your balance, everything is connected.

**4. Ask for a call.** Grok turns your request into a tool call that looks like this:

```json
{
  "name": "call4me_place_call",
  "arguments": {
    "to": "+1 555 010 0199",
    "business": "Rosa's Kitchen",
    "category": "restaurant",
    "goal": "Book a table for 4 tonight (Thu Oct 1) around 7pm under Khami.",
    "flexibility": "anything between 6:30 and 8 is fine"
  }
}
```

Then it keeps checking `call4me_get_call` until the call ends and tells you what happened. If the restaurant asks something the caller doesn't know, like "is a booth OK?", the question comes back to Grok to answer while they wait.

For tasks to use after setup, copy our [five Grok Bot phone calling templates](/blog/grok-bot-templates). Then [save a reusable skill](/blog/grok-bot-reusable-skills) or [check a shared template's recipient setup](/blog/grok-bot-template-troubleshooting). Our [Grok Bot versus Meta Muse comparison](/blog/grok-bot-vs-meta-muse) includes identical research briefs for trying both agents.

## Let your agent make the call

If you use Grok, paste this into a chat once call4me is connected:

> Use call4me for phone calls. Call [business] at [phone number] and [what you want done]. Before dialing, check call4me_get_requirements and ask me for anything missing in one message. Ask me before agreeing to anything that costs money, and tell me the result in one or two lines.
