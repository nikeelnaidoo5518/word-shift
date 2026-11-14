# Online deployment

WORD SHIFT now supports the same architecture as SA Trivia: a static GitHub Pages frontend and Firebase anonymous authentication/Realtime Database. No always-running Node host or separate computer is required. The TV runs authoritative gameplay while open.

## GitHub settings

The owner approved public source. The connected GitHub app can publish code but receives HTTP 403 for repository administration. The owner must set:

1. Repository Settings → General → Danger Zone → Change visibility → Public.
2. Settings → Pages → Build and deployment → Source → GitHub Actions.

Then run **Publish online WORD SHIFT** under Actions, or push to main. Its workflow tests, builds and deploys `dist/`. Intended address: https://nikeelnaidoo5518.github.io/word-shift/ . Verify the deployment before distributing the TV APK, which opens this address automatically.

## Firebase compatibility

The build uses public web client identifiers for the owner's existing SA Trivia Firebase project. Anonymous sign-in and its existing access rules were verified using one temporary WORD SHIFT room, two browser sessions and a legal move; that room was deleted afterward. No production rules or existing game rooms were changed.

WORD SHIFT uses `rooms/W` plus its five-character room code and checks `state.game === 'word-shift'`. Creation avoids existing records. Host checkpoints and request ledgers use host-private input data; phones write only their own membership/inputs and read their own feedback. `firebase/compatible.rules.json` is a reference/test fixture, not an instruction to redeploy another game's rules.

Do not deploy emulator configuration. Normal builds use `online/firebase-config.js`; only `WORDSHIFT_EMULATORS=1` builds use the demo project and loopback endpoints. CI emulator tests are isolated from production.

Firebase Spark quotas and project settings are shared with the other game. No paid plan is required by this implementation, but free usage limits still apply. TV closure stops turns/AI processing; same-browser reload restores the private checkpoint. Account loss/device changes cannot restore host ownership. Expired records left after host closure need a cleanup policy.

## Verification

Before calling a release live: confirm a successful Pages deployment, open the public URL, create a TV room, scan the QR on a separate phone, play alternating moves, reload the host, and remove the QA room. Install and test the APK on a physical TV separately. Browser and emulator success do not verify physical hardware.

## Optional Node hosting

`npm start` retains the dependency-free HTTP/SSE server. `render.yaml` remains an optional Render setup, not the chosen online deployment. For another HTTPS proxy, configure `PUBLIC_ORIGIN`; trust only exact proxy socket IPs through `TRUST_PROXY_ADDRESSES`. Preserve SSE streaming. Node rooms remain in memory and disappear on server restart.
