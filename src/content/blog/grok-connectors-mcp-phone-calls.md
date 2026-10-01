---
title: "Grok connectors and MCP: how to add custom tools to Grok (and make phone calls)"
seoTitle: Grok connectors and MCP servers, explained
subtitle: Grok can use custom MCP servers in three places, grok.com, Grok Bot, and the xAI API, and each one adds them differently. Here's what Grok connectors are, how to add your own, and a worked example that gives Grok a phone.
description: What Grok connectors are, whether Grok supports MCP, and how to add a custom MCP server on grok.com, in Grok Bot, and through the xAI API, with phone calls as the example.
date: 2026-10-01
tags: grok, mcp, ai agents, ai phone assistant
authors: nick
imageAlt: Grok connectors and MCP servers, with phone calls as the worked example
---

**The short answer:** yes, Grok supports MCP. Grok connectors are how Grok reaches tools and data outside the chat, and besides the built-in ones (Gmail, Google Drive, Outlook, Salesforce and others), you can add any public MCP server as a custom connector. Where you add it depends on which Grok you use: on **grok.com** you add it yourself at grok.com/connectors, in **Grok Bot** you ask the Bot to add a custom MCP server, and with the **xAI API** you pass the server in the `tools` array of your request. The worked example below adds call4me, an MCP server that makes phone calls, so Grok can call a restaurant or a doctor's office for you.

We support Grok as one of the agents call4me works with, and the first version of our setup instructions mixed up grok.com and Grok Bot. So this page sorts out the three, using xAI's own docs.

## What are Grok connectors?

Grok connectors let Grok read and act on your other tools from inside a conversation. xAI's [connectors page](https://docs.x.ai/grok/connectors) puts it this way:

> Connectors are available to all Grok users and let Grok access your external tools and data sources directly within a conversation.

There are two kinds:

- **Built-in connectors.** The docs list Google Drive, Gmail and Google Calendar, Outlook Mail and Calendar, SharePoint, OneDrive, Microsoft Teams, and Salesforce. You add one at grok.com/connectors, click **New Connector**, pick the service, and sign in.
- **Custom connectors.** Any MCP server you point Grok at. This is the one that matters if the tool you want isn't on the list.

## Does Grok support MCP?

Yes. Grok's MCP support covers all three xAI products: the grok.com chat (custom connectors), Grok Bot (custom MCP servers), and the xAI API (remote MCP tools). Here's how xAI MCP support works in each.

Yes, in all three places Grok runs, though each one sets it up differently:

| Where you use Grok | How you add an MCP server | Who adds it |
|---|---|---|
| Grok chat on grok.com | grok.com/connectors, **New Connector**, **Custom** | You, in settings |
| Grok Bot (desktop and mobile app) | Ask the Bot in chat, or **Setup**, **Plugins**, **Add** on a Team Bot | The Bot, from your chat message |
| xAI API | A `"type": "mcp"` entry in the request's `tools` array | Your code |

Two rules apply everywhere:

- **The server has to be on the public internet.** xAI's [tunneling page](https://docs.x.ai/grok/connectors/custom-mcp-tunneling) says Grok will reject `localhost` and private addresses like `192.168.x.x`. If you're running one on your laptop, you need a tunnel such as ngrok.
- **Streamable HTTP or SSE only.** The [API docs](https://docs.x.ai/developers/tools/remote-mcp) say "Only Streaming HTTP and SSE transports are supported." A server you start as a local command won't work on grok.com or through the API.

## How to add a custom MCP server on grok.com

This is the one most people mean by "Grok connectors". xAI's instructions, word for word:

> To add a custom MCP connector: Go to grok.com/connectors. Click **New Connector**, then select **Custom**. Enter the MCP server URL and complete any required authentication.

Grok then finds the tools the server offers and makes them available in your chats, the same way as the built-in connectors.

One thing that trips people up: **the Grok chat can't add a connector for you.** If you paste a setup prompt into grok.com that says "add this MCP server", Grok has no tool to do it. You do this step yourself in settings, then come back to the chat.

On **Grok Business and Enterprise** plans there's an extra step first. According to xAI's [connector management page](https://docs.x.ai/grok/connector-management), a team admin adds the server in the xAI console (console.x.ai, **Grok Business**, **Connectors**, **+ Add Connector**, **Other**, then the MCP server URL). After that, team members connect it on grok.com/connectors.

## What is Grok Bot?

Grok Bot is xAI's app for AI teammates you keep around. In xAI's words, it "gives you Bots you can keep around: AI teammates with names, jobs, and context that compounds over time" ([Grok Bot docs](https://docs.x.ai/grok-bot)). The parts that matter for adding tools:

- **Each Bot has its own computer.** Bots work on a persistent cloud computer with a browser, files, and a terminal, and keep working while your laptop is closed.
- **You set it up by messaging it.** "Setup is a message, not a workflow builder." That's also how you add a custom MCP server, as shown below.
- **It runs everywhere.** macOS, Windows, Linux, iOS, and Android.
- **It comes with Cursor or SuperGrok.** It's included with every paid individual Cursor plan and the Cursor Teams plan, and you can link a SuperGrok, SuperGrok Plus, or SuperGrok Heavy subscription instead.

That makes it different from the grok.com chat: grok.com answers questions and uses the connectors you add in settings, while a Bot does multi-step work and can wire up its own tools when you ask.

## How to add an MCP server to Grok Bot

Grok Bot is xAI's agent app: each Bot has its own cloud computer with a browser, files, and a terminal, and you work with it by messaging it ([Grok Bot docs](https://docs.x.ai/grok-bot/get-started)). Unlike the grok.com chat, a Bot can set up its own tools. For a Team Bot, xAI's [Team Bots page](https://docs.x.ai/grok-bot/team-bots) says the Bot's **Setup** section has **Plugins**, **Secrets**, **Skills**, and **Files**, and you "Choose **Add** on any row, or ask the Bot in chat."

Custom MCP servers come in two types:

- **Remote HTTPS**, a server at a public URL. This is the right choice for anything that needs a key or a sign-in.
- **Command**, a server the Bot starts on its own computer. xAI warns that teammates can read a Command server's arguments, so never put a credential in them.

The quickest way is to ask in chat:

> Add a custom MCP server called call4me at https://call4.me/mcp/YOUR-KEY (remote HTTPS, no headers, no auth).

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

call4me is an MCP server that places real phone calls. Your agent hands it a goal ("book a table for four at seven"), a voice caller talks to the business like a person would, and your agent gets the outcome and transcript back. It works in Claude Code, Codex, ChatGPT and Claude, and the same server works in Grok.

**1. Get your server URL.** Sign in at [call4.me](https://call4.me). Your personal server URL is on [your account page](https://call4.me/account). It has your key in it, so treat it like a password.

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

## Let your agent make the call

If you use Grok, paste this into a chat once call4me is connected:

> Use call4me for phone calls. Call [business] at [phone number] and [what you want done]. Before dialing, check call4me_get_requirements and ask me for anything missing in one message. Ask me before agreeing to anything that costs money, and tell me the result in one or two lines.
