# Reliability review — 0.5.0

The principal usability gap was the TV APK requiring a separate computer and server address. The online build now uses GitHub Pages and the existing Firebase relay; the APK opens the planned Pages address directly. GitHub owner visibility/Pages settings and successful deployment are still required before claiming it live.

Shared `room-rules.js` keeps Node and online gameplay consistent: one-letter unused dictionary words, alternating turns, invalid submissions, timeouts, stale versions, rounds, championships and AI. Firebase phone inputs are tied to authenticated paths. Private checkpoints, request deduplication, per-tab presence and a host controller lease support recovery without exposing host data to phones. Actual database reconnects are exercised in browser tests.

Node request/body/connection limits, SSE recovery, offline indicators and idle-room cleanup remain in place. QR links preserve the Pages subpath and omit session credentials. Existing TV layout styling and remote controls are retained.

Verification includes Node regression tests, isolated Firebase access checks and browser sessions for all five modes, plus a temporary live Firebase room test that was cleaned up. No existing SA Trivia rooms or production rules were changed. Publication history was scanned for credential files and common secret formats before approving public source; public Firebase client identifiers are intentionally included.

Remaining priorities:

1. Enable GitHub Public visibility/Pages and verify the deployed URL and downloadable APK end to end.
2. Physical Android/Google/Fire TV testing: remote, keyboard, WebView, overscan, QR readability and installation.
3. Production abuse controls, host migration, expired-record cleanup, quota monitoring and account/recovery design. Client authority is suitable for friendly games, not a cheat-proof service.
4. Family-reviewed/localized dictionary, larger puzzle set, full Party Chaos modifiers, original audio and store distribution.

Online and Node modes differ in authority and persistence: online requires the TV host open and retains a Firebase checkpoint; Node has server authority and in-memory rooms. Neither provides finished persistent accounts.

## 0.8 follow-up

Added synchronized pause/resume, phone leave, disconnected-player removal while paused/in the lobby, connected-phone captain transfer, an explicit same-browser recovery button and TV heartbeat warnings. Removal preserves team assignments; an undersized match ends rather than silently changing its mode. Authorization and strict move-version/one-letter checks remain shared by Node and Firebase.

New match stats persist independently of the bounded event log. Difficulty decks use saved seeds and dictionary-verified routes. Word previews restrict input to one changed position. Music/effects volumes and TV text/margins are local preferences. Automated browser coverage includes the populated manager/summary/paused screens and three phone viewport sizes. Actual TV hardware and additional browser engines still need testing.
