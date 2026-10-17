# call4me

call4me makes real phone calls to businesses for you. Tell Claude what you need, like a table for four on Saturday, a vet appointment next week, a quote from a plumber, or whether a store has something in stock, and call4me phones the business, talks to whoever answers, and reports back with the outcome and a transcript.

## What's in the plugin

- **call4me connector**: the remote MCP server at `https://call4.me/claude/mcp`. You sign in with your call4me account (Google or X) the first time Claude uses it.
- **call4me skill**: teaches Claude the call flow: collect everything the business will ask for before dialing, place the call, follow it live, answer the caller's questions mid-call, ring you in when the business needs you, and summarize the result.

## Use it

Add it from the Claude directory, or in Claude Code run:

```
/plugin install call4me --marketplace skeptrunedev/call4me
```

Then connect the call4me connector (in Claude Code, `/mcp`, pick call4me, and sign in) and ask Claude:

- "Call Nopa in San Francisco and book a table for 4 this Saturday around 7pm."
- "Call the hardware store near me and ask if they have a 20 amp GFCI outlet in stock."
- "Find a plumber nearby and call to get a quote for fixing a leaking kitchen faucet."

Claude asks for anything the call needs in one message, confirms, and dials. You can join any call from your own phone (press 1 to take over, * to hand it back), listen in silently, or schedule a call for when the business opens.

## Data and billing

The plugin runs no local code. Claude sends call details (the business's number, the goal, and the facts you give it for the call) to call4me at call4.me, which places the call and stores the call record, transcript, and recording in your account. Profile details are saved only when you agree. Calls use prepaid credits from your call4me account; answered time is billed per minute and unanswered calls are free. Credits are bought on the call4me website, never in the chat.

call4me only calls businesses and services you want to reach, never personal numbers, emergency services, or premium-rate numbers. A call can fail or end without the result you wanted, so check anything important.

- Website: https://call4.me
- Support: https://call4.me/support
- Privacy: https://call4.me/privacy
- Terms: https://call4.me/terms
