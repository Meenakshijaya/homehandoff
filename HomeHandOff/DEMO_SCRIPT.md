# HomeHandoff demo script (2–3 minutes)

## Setup

Run `pnpm dev`, then open `http://localhost:5173/`.

## Walkthrough

**0:00–0:20 — Judge role selection**

Click **Explore as Babysitter** on the welcome screen, or use `babysitter@demo.com` / `BabyDemo123!` in **Demo Access**. Note that the fixed demo credentials are for local judging and are not production security.

**0:20–0:40 — Search**

Search “How do I restart the Wi-Fi?” Open the household’s saved Restart Wi-Fi guide and show that it contains the home's saved directions.

**0:40–1:00 — TV Mode**

Open **TV Mode**. Show the big step and role label. Press **Next Step**, **Replay Step**, and **Alexa, show the location**. Explain these frontend device controls are simulated.

**1:00–1:20 — Restricted guide response**

Run this local HTTP wrapper call in PowerShell while signed in as Babysitter:

```powershell
Invoke-RestMethod -Uri http://localhost:3001/api/tools/get_guide_location -Method Post -ContentType 'application/json' -Body '{"guideId":"water-motor-switch","role":"Babysitter"}'
```

Show that `result` is exactly `This guide is restricted by the homeowner.` and contains no location, step, or safety details.

**1:20–1:40 — Homeowner Developer Demo**

Click **Switch Demo Role**, then choose **Explore as Homeowner** (or use `homeowner@demo.com` / `HomeDemo123!`). In **Developer Demo**, show the Connected status and click **Search Wi-Fi guide as Babysitter**. Show the JSON response returned by the local API wrapper that calls the shared MCP tool function.

**1:40–2:05 — Requests**

Click **Request Water Motor access** in Developer Demo, then open **Requests**. Approve or reject the request and show the local prototype authorization change. The panel also exposes direct step and restricted-location tool calls.

**2:05–2:30 — Persistence and honest close**

Create a small example guide, refresh, and show that it persists in `mcp-server/data/household.json` and is searchable. End by stating: the app has a local MCP stdio tool server and local JSON API with role checks; Alexa+ voice interaction and Fire TV casting are simulated; there is no production Alexa+ deployment or real Fire TV API. Demo authentication and local authorization are not production security.

## Direct MCP stdio smoke check

Configure a compatible MCP client to launch `node` with the absolute path to `mcp-server/mcp.js`. These newline-delimited JSON-RPC messages can also be piped to `pnpm run mcp:stdio`:

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"demo","version":"1"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"search_home_instruction","arguments":{"query":"internet is not working","role":"Babysitter"}}}
{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"get_guide_location","arguments":{"guideId":"water-motor-switch","role":"Babysitter"}}}
```

The last call returns only the required restriction sentence.
