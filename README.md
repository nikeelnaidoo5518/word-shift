# WORD SHIFT

**Every Letter Counts.** A TV word-ladder game with phone controllers, five modes, and the original Desert Luxe design.

## Online TV version

The new online build uses GitHub Pages and the existing Firebase project used by SA Trivia. It needs internet and an open TV game screen; it needs no separate computer or manually entered server address.

Play online: https://nikeelnaidoo5518.github.io/word-shift/ . GitHub Pages is enabled and the public game was verified with separate TV/phone sessions.

Install the [Android TV preview APK](downloads/word-shift-tv-preview.apk), launch WORD SHIFT, create a room, and scan its QR with phone cameras. Enter nicknames and tap Ready. The QR fills in the room code. Phones may use the same Wi-Fi or another internet connection. Keep the TV open and awake throughout the match.

[TV installation and controls](android-tv/README.md) · [Deployment](DEPLOYMENT.md) · [Review and limits](REVIEW.md)

## Gameplay

Change exactly one letter to make a valid unused word. Every submission passes the turn; invalid words and timeouts also pass it. The shared rules validate turns, dictionary membership, used words, deadlines, and stale requests.

Classic, Head-to-Head, Player vs Computer, Team Battle, and Party Chaos remain available. Round scores, championships, five computer difficulties, and team seats are preserved. Party Chaos special modifier effects beyond existing timer variations remain future work.

The TV app is display-only: choose a mode, select Create game, then players scan the QR and join on phones. The TV takes no seat or turns. Each player taps Ready; start on the TV or the first phone (captain). That phone can also advance rounds and end the match. Keep the TV open. Browser-hosted play without `?tv=1` still supports a playing host.

## Run locally without online services

Install Node.js 20+, run `npm start`, and open the printed address. Phones use the printed same-Wi-Fi address or scan the room QR. This alternative still runs the original authoritative Node HTTP/SSE server without npm dependencies. Rooms live in process memory. Local host reassignment and request/connection limits remain available.

## Development and checks

- `npm test`: Node engine, shared game rules, room API, security limits, QR links, and recovery regression tests.
- `npm run setup:online`: install the separate online development dependencies.
- `npm run build:online`: generate `dist/` for GitHub Pages using public Firebase client identifiers.
- `npm run test:firebase`: isolated demo Firebase Auth/database emulators, access-rule checks, separate browser sessions, all five modes, restoration and reconnect tests. Requires Java 21+ and Chromium/Playwright. No production Firebase records are used.

Optional browser scripts in `scripts/` use separately installed Playwright (`PLAYWRIGHT_MODULE`, `BROWSER_EXECUTABLE`, `BASE_URL`). TV layout checks cover four viewport sizes; they do not replace physical-TV testing.

`game-engine.js` holds the 32,511-word graph and AI; `room-rules.js` shares gameplay between Node and the TV host; `online/transport.js` relays phones through Firebase; `client.js` preserves the existing interface. See `THIRD_PARTY_NOTICES.txt` for dictionary and bundled SDK licenses.

## Current limits

Online rooms use anonymous browser identity and a private host checkpoint, allowing reload recovery in the same browser. These are not persistent user accounts. The TV remains the authority and must stay connected; online host transfer is not implemented. The friendly-game model is not cheat-proof against a modified host client. Firebase free quotas are shared with SA Trivia and do not guarantee unlimited service.

Rooms expire after two hours without human activity. A running host removes expired records; records left by closed hosts need later cleanup. The dictionary is not family-vetted or localized. Store publication, production abuse protection, and broader physical-device/browser QA remain unfinished.

## 0.6 controls and music

The top Menu button offers Resume, End game (host only), Return to start, How to play, Options and Music. The host returning to start ends the shared match; a guest returning leaves their local view. Ending stops timers and further submissions for everyone. TV Back/Menu → Game menu opens the same controls in the updated APK. The menu does not pause a running turn.

The side counter shows successful shifts this round and your contribution; the phone also shows both counts. Invalid submissions do not count and still pass the turn. Counters reset each round. Created by **Nikeel Naidoo**.

An original, softly synthesized classical-style waltz plays after a user interaction. Music can be muted in Menu or Options, remembers your choice, and pauses in hidden tabs. Phones default to muted to avoid several devices playing together. No third-party recording or audio service is used.
