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
- Room codes and session tokens, nickname filtering, request size and rate limits, reconnectable browser sessions, host reassignment after disconnect, and two-hour in-memory room expiry.
- Responsive Desert Luxe styling and no scrolling in the main play screens.

## Current scope

This is a playable local-network prototype. QR generation, persistent accounts, hosted deployment, public-internet hardening, original audio assets, and production device/browser QA are not included. Rooms and scores live in server memory and disappear when the server stops.

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
