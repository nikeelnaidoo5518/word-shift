# Reliability review

Reviewed the restored v0.2 source on 2026-11-13. The initial 11 automated tests passed.

## Fixed in this pass

- Check join capacity and lobby phase after reading the body, preventing concurrent/slow requests from overfilling a room or joining an active match.
- Require the current version for moves; return current state on version conflicts so controllers can recover.
- Ignore older client snapshots when SSE and HTTP responses arrive out of order.
- Restrict mode selection to owned configuration keys and reject non-object JSON bodies.
- Parse request URLs inside the error boundary using a fixed base.
- Remove a results-renderer access to a nonexistent secondary button.
- Clear the previous champion ID on restart.
- Apply finale doubling to the final scheduled round, including round seven for Team Battle.
- Preserve input focus during mobile Submit taps so layout changes do not swallow the first click.
- Restore saved sessions when refreshing their own join link.
- Correct lobby round count and the unreviewed dictionary label.

## Remaining work, in priority order

1. Public-internet resource controls: room and SSE connection limits, bounded move history, slow request handling, cross-origin request policy, and proxy-aware rate limiting with an explicit trusted-proxy policy. The current per-IP POST limit can group all players behind a hosting proxy and does not bound GET/SSE usage.
2. Room lifecycle: explicit leave/kick/rejoin behavior, disconnected-player visibility, spectator TV sessions, and expiry based on player activity. Automatic timeouts currently refresh room activity, allowing unattended playing rooms to outlive the advertised two-hour expiry.
3. Durable state and deployment: rooms currently disappear on restart; multiple server instances cannot share rooms. Select a hosting provider and storage model before deploying. Health check exists at `/api/health`. Use one instance until shared room ownership is implemented.
4. Party Chaos: named modifiers currently change announcements/timers; special effects such as Memory Round and Mystery Bonus are not implemented. Preserve the one-letter/unused-word/next-player rule when defining effects.
5. Accounts, original audio, dictionary family review/localization, more puzzles, and broader real-device/browser QA remain unfinished.

GitHub Actions configuration is included for Node 20/22/24, but cannot be verified remotely until the project is published. It adds no runtime dependencies.

## Verification

- 14 Node tests pass on the available Node 24 runtime; JavaScript syntax checks pass.
- Chromium smoke flow passes with separate desktop-host and mobile-guest contexts: join link, ready/start, three alternating legal moves, results, next round, and join-link refresh restoration, with no browser exceptions. This is emulation, not real-device or cross-browser QA.

## Android TV preview (0.3.0)

Added a sideloadable Android APK, native server setup and recovery menu, TV launcher assets, D-pad navigation isolated behind `?tv=1`, build script and APK build workflow. The server serves the new `tv.js`; ordinary phone controls and game rules are unchanged. APK compilation/signature/manifest checks, native address tests, and a Chromium remote-only room/start plus phone-joining flow pass. This does not implement server hosting, a standalone on-TV game server, a spectator role or store release. Physical Android/Google/Fire TV testing remains outstanding. See `android-tv/README.md`.

## Same-Wi-Fi QR joining (0.3.1)

Added an offline MIT-licensed QR encoder and a high-contrast lobby code with a four-module quiet zone. Join URLs use only the server origin and room code; host session tokens and TV parameters are excluded. Hosts using loopback can choose a discovered network interface; address discovery does not trust Host/Forwarded headers. Copying a loopback URL is blocked. QR encoding uses no external service or runtime npm package. Existing game rules are unchanged. The initial TV server connection is still required.

Node tests: 17 pass. Independent QR screenshot decoding and phone join verification are provided by scripts/qr-smoke.cjs. Physical phone-camera and TV testing remains outstanding.

## TV screen fitting follow-up

Kept a 4% inset around TV content. Fixed a clipped victory screen on 960×540 TV/WebView viewports by sizing the trophy/title against height and tightening victory spacing. Long player names can wrap inside player cards instead of widening the screen. Added `scripts/tv-layout.cjs` to check 12 screens/states across four TV resolutions, including long names and tied champions. Phone styles and game rules are unchanged. This layout update is delivered by the server; no APK reinstall is needed.
