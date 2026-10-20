# HomeHandoff

A role-aware household guide library with a local JSON API and a local MCP tool server for household-specific instructions.

## Problem

Household know-how often lives in one person's memory, texts, or scattered notes. Someone caring for the home may need a clear, approved answer while the homeowner is away.

## Solution

Homeowners save instructions once. The local server persists them as JSON, checks the selected household role, and returns only saved, permitted information. The browser presents those instructions as visual, step-by-step guides.

## Features

- Searchable local household guide library with roles and favorites.
- Guided steps, helpful feedback, restricted routes, and local access requests.
- Local demo accounts, homeowner review workflow, versions, and homeowner-only activity history.
- A working local MCP stdio tool layer with five household-guide tools.
- HTTP testing wrappers for the same MCP tool functions and a live Developer Demo panel.
- TV Mode with a seeded Fire TV walkthrough, simulated Alexa command chips, and simulated Fire TV cast controls.
- Household voice notes recorded with the browser MediaRecorder API and stored as audio blobs in IndexedDB on the current browser/device.
- Seed guides are stored server-side in `shared/seed-guides.json`; the browser receives only guides allowed for its authenticated session.

## Tech stack

React, TypeScript, Vite, Node.js 24+ built-in HTTP/filesystem APIs, local JSON persistence, and MCP stdio JSON-RPC tool methods. No paid services, API keys, or generative AI are used.

## Exact hackathon technology

The selected device track is Alexa+. This repo implements a local MCP stdio server exposing `search_home_instruction`, `get_guide_step`, `get_guide_location`, `request_guide_access`, and `create_household_guide`. The UI can call equivalent local HTTP wrappers for the demo. It does not connect to a live Alexa+ deployment or Fire TV APIs.

The official `@modelcontextprotocol/sdk` could not be installed in this environment: pnpm's registry lookup returned `ENOTFOUND registry.npmjs.org`. The local server therefore implements the MCP stdio JSON-RPC initialize, `tools/list`, and `tools/call` methods directly. It is SDK-free and should be verified with a compatible MCP client before relying on broader protocol features.

## Run locally

Requirements: Node.js 24 or newer and pnpm.

Run the frontend and local API together in one terminal:

```powershell
pnpm install
pnpm dev
```

## Netlify build preparation

`netlify.toml` configures Node 24, the production build (`pnpm run build`), the `dist` publish directory, `netlify/functions`, and the SPA fallback. The frontend continues to call same-origin `/api/...` routes: Vite proxies them to the local HTTP API in development, and `netlify/functions/api.mjs` proxies them to the production HTTP API after deployment. Browser voice recognition and speech synthesis remain frontend browser APIs; saved guide search still goes through the role-enforcing API.

**The Netlify Function is a reverse proxy, not a replacement backend.** The existing HTTP API writes `mcp-server/data/household.json` and `auth.json` to disk, and its signed-in sessions are kept in a process-local `Map`. Netlify Functions are ephemeral and do not provide a persistent local disk or a single long-lived process, so moving `http.js` or `mcp.js` directly into a Function would lose guide/account writes and break sessions across invocations. For full existing functionality, host the existing Node API as a long-running service with persistent storage mounted at `mcp-server/data`, run one API instance for this prototype, and set the Netlify runtime variable `HOMEHANDOFF_API_URL` to that service's HTTPS origin (for example `https://your-api-host.example.com`, with no `/api` suffix). The `start` script is `pnpm start`; the service binds to the hosting platform's `PORT` and `0.0.0.0`.

The existing MCP stdio process is still available locally with `pnpm run mcp:stdio`. Netlify does not keep that stdin/stdout process running. The HTTP `/api/tools/<tool_name>` wrappers on the long-running API invoke the same MCP core functions and remain available through the Function proxy. This project does not currently expose remote MCP over HTTP.

If `HOMEHANDOFF_API_URL` is unset or unreachable, the Function returns a clear JSON `503`/`502`; the app may still offer its existing browser-only demo fallback, but that is not server-backed authentication or shared persistent data. Do not treat that fallback as a complete production deployment.

### Deploy from Windows

1. Deploy the Node API separately before publishing the frontend. Use a persistent Node service, configure its start command as `pnpm start`, and mount a persistent disk at the deployed project's `mcp-server/data` directory. Keep it to one instance for this prototype because the current session store is process-local. Confirm the API host's `https://.../health` returns `{"status":"ok"}` and that its HTTPS `/api/tools/demo` endpoint returns the two smoke-test results. Do not use a `localhost` address in Netlify settings; Netlify Functions cannot reach your laptop's localhost.
2. In Netlify, import the frontend repository (or use the CLI below). Set the build command to `pnpm run build`, publish directory to `dist`, and base directory to the repository root. The Functions directory is already configured as `netlify/functions`.
3. In **Site configuration → Environment variables**, add `HOMEHANDOFF_API_URL` with the API's HTTPS origin only, such as `https://your-api-host.example.com`. Make it available to Functions (Netlify environment variables in `netlify.toml` are not runtime Function variables). No frontend `VITE_*` API variable is needed because requests stay same-origin.
4. From PowerShell in this project folder, install and build, then log in and link the site:

   ```powershell
   pnpm.cmd install
   pnpm.cmd run build
   pnpm.cmd dlx netlify-cli login
   pnpm.cmd dlx netlify-cli init
   ```

   Choose the existing Netlify site or create one. The `netlify.toml` supplies the build and publish settings. If setting the API variable from the terminal, use `pnpm.cmd dlx netlify-cli env:set HOMEHANDOFF_API_URL https://your-api-host.example.com` (the value is the public backend origin, not a secret). Then deploy a preview and production:

   ```powershell
   pnpm.cmd dlx netlify-cli deploy --build
   pnpm.cmd dlx netlify-cli deploy --build --prod
   ```

5. On the public site, verify `/health` and `/api/health` both return `{"status":"ok"}` and `/api/tools/demo` returns JSON. Sign in with a demo role and test guide search and permissions. Allow microphone access, press the Ask HomeHandoff microphone, ask a saved question, and verify it opens the permitted guide and reads Step 1. Also test typed Ask, next/repeat controls, and a restricted guide. Browser speech-recognition support varies by browser and microphone policy; use typed input and on-screen controls as fallbacks.

Open the frontend at [http://localhost:5173/](http://localhost:5173/). The backend health check is [http://localhost:3001/health](http://localhost:3001/health), and the MCP tool smoke endpoint is [http://localhost:3001/api/tools/demo](http://localhost:3001/api/tools/demo). The development launcher checks for occupied ports and picks a free port; read its startup output if it selected a port other than the defaults.

To run them in separate terminals instead:

```powershell
pnpm run dev:server
```

```powershell
pnpm run dev
```

The Vite frontend proxies `/api` to port 3001. The root `pnpm dev` command starts the frontend and local API together.

Run the standalone MCP stdio process for an MCP client:

```powershell
pnpm run mcp:stdio
```

Configure an MCP client to launch `node` with the absolute path to `mcp-server/mcp.js`. MCP messages use newline-delimited JSON-RPC over stdin/stdout; server diagnostics are sent to stderr.

## Test MCP tools locally

The browser's Homeowner **Developer Demo** panel calls the real local HTTP wrappers. It displays the JSON from each call, including the Babysitter Wi-Fi search and restricted Water Motor response.

For a direct stdio smoke check, send JSON-RPC lines to `pnpm run mcp:stdio` from PowerShell or an MCP client. Example calls are in `DEMO_SCRIPT.md`. The API wrappers are `POST /api/tools/<tool_name>` on port 3001 and call the same tool functions as MCP; they are local testing endpoints, not Alexa+ device integration.

## Demo accounts

- The welcome screen offers one-click **Explore Demo** access for each role. For manual sign-in, these demo credentials also work:
  - Homeowner: `homeowner@demo.com` / `HomeDemo123!`
  - Babysitter: `babysitter@demo.com` / `BabyDemo123!`
  - Family Member: `family@demo.com` / `FamilyDemo123!`
- Choose **Switch Demo Role** in the app header to return to role selection without refreshing. **Reset Demo Data** restores seeded guides and clears demo requests/favorites/history while preserving user-created guides.
- A separate homeowner account can still be created from the login screen. Existing household accounts remain supported.
- One-click role cards use a dedicated local `/api/demo-session` route; they do not submit demo credentials through registered-account login. The server still applies the selected role to guide and homeowner-only API permissions.
- If the local API is unavailable, role cards can enter a browser-only judging mode using bundled seed guides plus cached user guides. Its role filtering is simulated, not secure authorization; custom guide edits and contact/access requests in that mode stay in this browser.
- “Contact Homeowner” creates a browser-local request for the homeowner to review. It does not send a message or notification. Access requests remain separate and require explicit homeowner approval.
- `babysitter@homehandoff.demo` / `babysitter123`
- `guest@homehandoff.demo` / `guest123`

The role selector can preview other roles only during an authenticated Homeowner session. Babysitter and Guest accounts stay on their account role and cannot switch into Homeowner mode. Sessions are held in memory and use a local HttpOnly cookie; restarting the API signs users out.

## Persistence and privacy

The server creates `mcp-server/data/household.json` on first use and merges newly added seed guides by ID. Existing same-ID guide records and user-created guides are preserved. Existing browser guides and requests are merged on a Homeowner login without overwriting same-ID server records. Homeowner credentials are saved as salted scrypt hashes in the ignored local file `mcp-server/data/auth.json`; the first run asks you to create them. Do not delete either data file unless you intend to reset household data or credentials.

This is a local prototype, not production-grade authentication or authorization. The local API hashes passwords with Node.js scrypt, but sessions are held in memory, development uses HTTP, and this app does not provide a hardened identity provider, rate limiting, account recovery, CSRF protections, or production key/session management. The judge demo credentials are fixed and public by design. Real deployments need a properly secured backend or identity provider, HTTPS, secure session management, and server-side authorization; a frontend role selector or local browser storage alone cannot protect restricted information. Keep sensitive household details out of this demo. Voice notes remain in this browser's IndexedDB and are not uploaded or shared between devices. Alexa+ command chips and Fire TV playback/casting remain simulated; no live device integration is configured.

## Build and lint

```powershell
pnpm run build
```

There is no lint script configured in the current project.

## Open-source license

MIT. See [LICENSE](LICENSE).

