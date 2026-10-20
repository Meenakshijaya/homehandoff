# Architecture

```mermaid
flowchart LR
  A[User voice or text request] --> B[Simulated Alexa+ / Fire TV frontend]
  B --> C[Local HomeHandoff API]
  C --> D[MCP tool layer]
  D --> E[Role permission check]
  E --> F[Local household-guide JSON data]
  F --> G[Permitted visual guide response]
```

The frontend calls `/api` through Vite's local proxy. HTTP endpoints under `/api/tools/*` are optional local demo wrappers; they call the same tool functions used by the separate MCP stdio JSON-RPC process in `mcp-server/mcp.js`. The local API and tool layer share `mcp-server/core.js` and persist the same guides, requests, and audit history in `mcp-server/data/household.json`.

Guide seeds live in `shared/seed-guides.json`, imported by both the TypeScript frontend and Node server. The frontend loads role-filtered guides through the session-bound API. Permission checks happen before MCP results include guide information. Search returns only a restriction sentence for an inaccessible match; step and location calls check permissions before reading their response fields.

## Prototype boundaries

- Device experience is a frontend simulation; no production Alexa+ or Fire TV APIs are configured.
- Demo account sessions and role approvals are local prototype authorization, not production identity or security.
- Standalone MCP role inputs are caller-supplied values and are not authenticated.
- The API binds to loopback by default and writes JSON in the project folder.
