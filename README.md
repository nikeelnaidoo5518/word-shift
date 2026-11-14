# WORD SHIFT

**Every Letter Counts.** A browser-based word-ladder party game with a TV-sized board and phone controllers.

## Run a local game

1. Install Node.js 20 or newer.
2. In this folder run `npm start`.
3. Open the `localhost` address printed in the terminal on the main screen.
4. Choose a mode and create a room, then share the displayed five-character code and host address with players on the same Wi‑Fi.
5. Players open that address, choose the same mode, enter the code and a nickname, then tap **Ready**. The host starts when everyone is ready.

No packages, accounts, or external dictionary calls are required. The server binds to the local network so phones can join. It is intended for trusted home Wi‑Fi; it is not yet hardened for public internet hosting.

## What works

- Five playable modes: Classic Multiplayer, Head-to-Head, Player vs Computer, Team Battle, and Party Chaos.
- Mode-specific round counts, timers, turn order, modifiers, round wins, and championship conditions.
- Two to four human players in multiplayer modes; Team Battle seats four players Blue–Red–Blue–Red.
- Seven curated round puzzles with rotating first player, live room state, and target completion.
- Phone entry with touch keyboard or device keyboard; TV board shows the shared ladder, current turn, scores, and countdown.
- Server-authoritative move checks: player turn, exact one-letter change, local dictionary membership, used words, room state, timer, and stale submissions.
- Invalid submissions and timeouts pass the turn. Dead ends trigger a limited ladder reset. The server scores valid moves and doubles the Grand Finale.
- The computer opponent uses the same legal word graph, with five difficulty levels and server-controlled response timing.
- Head-to-Head and bot matches use first-to-three round wins; Team Battle uses first-to-four; score ties are resolved by round wins and team points.
- Room codes and session tokens, nickname filtering, request size and rate limits, reconnectable browser sessions, host reassignment after disconnect, visible offline/reconnect status, and two-hour expiry based on player activity.
- Responsive Desert Luxe styling and no scrolling in the main play screens.

## Current scope

This is a playable local-network prototype. Persistent accounts, hosted deployment, public-internet hardening, original audio assets, and production device/browser QA are not included. Rooms and scores live in server memory and disappear when the server stops.

The bundled English word list is offline and includes 32,511 lowercase entries from 3–8 letters. Its source attribution and license text are in `THIRD_PARTY_NOTICES.txt`. The list is not yet family-vetted or localized for South African English, and the current round puzzle selection is a small hand-reviewed set.

## Development

- `npm test` runs the game-engine and HTTP room tests using Node's built-in test runner.
- `server.js` is the dependency-free HTTP/SSE host and authoritative game server.
- `game-engine.js` contains the indexed word graph, shortest-path search, and move rules.
- `client.js` manages the TV and phone views and reconnectable room sessions.

## Reliability follow-up

See [REVIEW.md](REVIEW.md) for fixes and prioritized remaining work. Move requests now require the current `version`; stale requests return the current player-specific state. Automated CI is configured for Node 20, 22, and 24 once published to GitHub.

Party Chaos modifier names currently label rounds and timer variations; their additional special effects are not implemented. The lobby word pack is unreviewed English, not a family-vetted pack. Public hosting and persistent rooms remain future work.

Optional browser smoke test: start the server, then run `node scripts/browser-smoke.cjs` with Playwright available separately. Set `PLAYWRIGHT_MODULE` to its module path if needed, `BROWSER_EXECUTABLE` for an installed Chromium, and `BASE_URL` to override `http://127.0.0.1:4173`. This test uses isolated desktop/mobile browser contexts; it does not add a production npm dependency.

## Install on Android TV / Google TV

A [downloadable TV APK preview](downloads/word-shift-tv-preview.apk) and [installation instructions](android-tv/README.md) are included. It adds a TV launcher, full-screen WebView, server-address setup, remote focus/navigation, and a reconnect menu. The existing computer/hosted Node server is still required; the TV APK does not run the server. Physical-TV testing and app-store publication are not complete.

## Scan to join on the same Wi-Fi

After connecting the TV app to the server and creating a room, the lobby shows a QR code. Players connect their phones to the same Wi-Fi, scan it with the camera, and enter a nickname. The room code is filled in automatically. No QR service, internet connection, or npm package is needed. The game server must stay running.

When a computer hosts through `localhost`, the lobby uses a network address instead; if several adapters are available, choose the Wi-Fi address in the lobby's address selector. Guest/client-isolated Wi-Fi or a computer firewall can block joining even on the same network. A manually entered room code and copied join link remain available. The QR never contains the host's session token.

`node scripts/qr-smoke.cjs` optionally verifies the displayed QR with an independent decoder and follows the scanned URL in a separate phone browser. It uses the existing Playwright variables plus `JSQR_MODULE` pointing to a separately installed `jsqr` module; these are development-only tools.

TV layout checks: `node scripts/tv-layout.cjs` (same optional Playwright variables) checks 12 screens/states at 960×540, 1280×720, 1920×1080, and 3840×2160, including four players with long names and a four-way championship tie. Controls, QR, board, and scores must stay inside an overscan-safe area. Set `SHOTS` to an output directory for small-TV reference screenshots. These are browser viewport checks; physical-TV overscan and vendor WebView behavior still need device testing.

## Connection recovery and server limits

Phones show a reconnect notice when the event connection drops; TV/lobby player cards show OFFLINE. Reopening the same browser session restores the player seat. Temporary server errors keep the saved session. If the room expires or the server restarts, clients return to the join screen instead of reconnecting forever. A disconnected host has a 15-second grace period before another connected player takes over. Disconnects keep the original player seat and scores; explicit leave/kick controls and a spectator-only TV role remain future work.

Rooms expire after two hours without a player request or event-stream connection. Automatic timeouts, bot moves, and keepalives do not extend this activity timestamp. Expiry closes event streams and cancels pending AI timers. Recent move/timeout events are limited to 100; the full used-word set and ladder are retained, so unused-word rules and scoring are unchanged.

This single-process server caps rooms at 200, sockets at 1,200, event streams at 800 globally / 12 per room / 2 per player, and rate-limit entries at 5,000. Oversized bodies receive JSON 413; the byte limit is 2,048 including UTF-8. Incomplete bodies time out after five seconds. Stalled event clients with more than 256 KiB queued are disconnected to reconnect normally. Cross-origin browser POST/event-stream requests are rejected.

For HTTPS termination behind a hosting proxy, set `PUBLIC_ORIGIN` to the public game origin (for example `https://game.example`). Only if using a trusted proxy, set `TRUST_PROXY_ADDRESSES` to its exact socket IP addresses, comma separated. Forwarded addresses are ignored by default; wildcard/CIDR trust is not accepted. The proxy must set/append the real client address in `X-Forwarded-For`, preserve event streaming without buffering, and permit idle intervals longer than the 15-second keepalive. These limits and proxy settings do not provide hosted deployment or persistent rooms.

Optional `node scripts/reconnect-smoke.cjs` starts its own test server and verifies real SSE disconnection, same-seat recovery, transient restore errors, and room-expiry cleanup using the separately available Playwright installation.

## Free online deployment

[Deploy WORD SHIFT on Render](https://render.com/deploy?repo=https://github.com/nikeelnaidoo5518/word-shift) using the included Free-plan `render.yaml`. See [DEPLOYMENT.md](DEPLOYMENT.md) for private GitHub connection steps, free-plan sleep/usage limits, and live verification. The server automatically uses Render's HTTPS origin. Deployment is prepared, not yet live: connecting a Render account is still required. Once the deployed URL is known, it can be built into the TV app to remove manual address entry.
