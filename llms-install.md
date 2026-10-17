# Installing call4me in Cline

call4me is a hosted remote MCP server. There is nothing to clone, build, or run locally, and no
environment variables. Setup is one entry in Cline's MCP settings.

- Endpoint: `https://call4.me/mcp`
- Transport: Streamable HTTP (`"type": "streamableHttp"`)
- Auth: OAuth 2.1 in the browser (Google or X sign-in), or a call4me API key

## Option 1: OAuth (recommended)

Add this server to `cline_mcp_settings.json` (Cline: MCP Servers, Configure, Configure MCP Servers):

```json
{
  "mcpServers": {
    "call4me": {
      "type": "streamableHttp",
      "url": "https://call4.me/mcp",
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

The server answers unauthenticated requests with `401` and a standard
`WWW-Authenticate: Bearer resource_metadata=...` challenge. Cline shows an authenticate button for
the server; the user clicks it and signs in to call4me in the browser. Do not try to sign in for
the user.

## Option 2: API key

If OAuth is not available in the user's Cline version, ask the user to create an API key at
https://call4.me/account (they sign in there with Google or X), then use it as a bearer header:

```json
{
  "mcpServers": {
    "call4me": {
      "type": "streamableHttp",
      "url": "https://call4.me/mcp",
      "headers": {
        "Authorization": "Bearer <CALL4ME_API_KEY>"
      },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

Clients that cannot send headers can put the key in the path instead: `https://call4.me/mcp/<CALL4ME_API_KEY>`.
Treat the key like a password.

With the Cline CLI, the same setup is:

```bash
cline mcp add call4me https://call4.me/mcp --transport http
# or, with a key:
cline mcp add call4me https://call4.me/mcp --transport http --header "Authorization: Bearer <CALL4ME_API_KEY>"
```

## Verify

Once connected, call `call4me_get_balance`. It returns the account's credit balance and its
call4me numbers. Show the user their numbers: these are the numbers that may ring them when a
business needs them on the line. A new account's free US number is assigned on its first call.

Calls are paid from prepaid credits (loads start at $10, added at https://call4.me/account or with
`call4me_add_funds`). Do not place a test call to a real business just to check the install.

## Using it

The server's own instructions walk the agent through each call: pick a category, call
`call4me_get_requirements`, collect the details from the user, find the right number,
`call4me_place_call`, then poll `call4me_get_call` and answer any open question with
`call4me_answer_question`. More at https://call4.me and https://call4.me/examples.
