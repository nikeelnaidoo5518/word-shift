# Reliability review — 0.5.0

The public GitHub Pages game and existing Firebase relay are live. The TV app opens it directly and stays display-only; phones take all player seats and turns.

Shared `room-rules.js` keeps Node and online gameplay consistent: one-letter unused dictionary words, alternating turns, invalid submissions, timeouts, stale versions, rounds, championships and AI. Firebase phone inputs are tied to authenticated paths. Private checkpoints, request deduplication, per-tab presence and a host controller lease support recovery without exposing host data to phones. Actual database reconnects are exercised in browser tests.

Node request/body/connection limits, SSE recovery, offline indicators and idle-room cleanup remain in place. QR links preserve the Pages subpath and omit session credentials. Existing TV layout styling and remote controls are retained.

Verification includes Node regression tests, isolated Firebase access checks and browser sessions for all five modes, plus a temporary live Firebase room test that was cleaned up. No existing SA Trivia rooms or production rules were changed. Publication history was scanned for credential files and common secret formats before approving public source; public Firebase client identifiers are intentionally included.

Remaining priorities:

1. Keep verifying the deployed URL and downloadable APK end to end.
2. Physical Android/Google/Fire TV testing: remote, keyboard, WebView, overscan, QR readability and installation.
3. Production abuse controls, host migration, expired-record cleanup, quota monitoring and account/recovery design. Client authority is suitable for friendly games, not a cheat-proof service.
4. Family-reviewed/localized dictionary, more puzzle content and store distribution.

Online and Node modes differ in authority and persistence: online requires the TV host open and retains a Firebase checkpoint; Node has server authority and in-memory rooms. Neither provides finished persistent accounts.

## 0.8 follow-up

Added synchronized pause/resume, phone leave, disconnected-player removal while paused/in the lobby, connected-phone captain transfer, an explicit same-browser recovery button and TV heartbeat warnings. Removal preserves team assignments; an undersized match ends rather than silently changing its mode. Authorization and strict move-version/one-letter checks remain shared by Node and Firebase.

New match stats persist independently of the bounded event log. Difficulty decks use saved seeds and dictionary-verified routes. Word previews restrict input to one changed position. Music/effects volumes and TV text/margins are local preferences. Automated browser coverage includes the populated manager/summary/paused screens and three phone viewport sizes. Actual TV hardware and additional browser engines still need testing.

## 0.9 verification focus

Shared-rule/HTTP tests cover solvable category endpoints, private hint budgets, custom validation before creation, quick/daily formats, concurrent phone votes, discussion timing, Chaos events, shortest replay, badges and new-match hint resets. Browser checks exercise TV/phone hint-budget recovery, hint privacy between phones, daily record deduplication, voting across word lengths, real huddle/reveal timing and score multipliers. Layout checks include setup, voting, replay, records, hint and event screens with the existing TV calibration options.

Hint words live only in the host-private checkpoint and the intended player's private feedback. Public state contains usage counts, not current clues. Full shortest routes are withheld until the round ends. No production Firebase rules or other games' rooms need changing.
