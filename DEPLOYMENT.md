# Free online hosting with Render

The repository is prepared for a Render **Free Web Service**. A running Node service is required; static-only hosting cannot run the multiplayer room server. Deployment still needs the repository owner's Render account and GitHub authorization. No live hosted URL has been created from this workspace.

## Deploy

1. Open [Deploy WORD SHIFT on Render](https://render.com/deploy?repo=https://github.com/nikeelnaidoo5518/word-shift).
2. Sign in or create a Render account. Connect GitHub and grant Render access to the private **nikeelnaidoo5518/word-shift** repository. Grant access only to that repository if you prefer.
3. Use the included `render.yaml` Blueprint. Confirm the web service is on **Free**, and create/deploy it. The Blueprint provisions no database or disk and does not select a paid plan.
4. Wait for the service to show **Live**, then open the exact HTTPS URL Render provides. Do not guess the hostname: Render may add a suffix.
5. Confirm `/api/health` on that URL returns `{"ok":true,...}`. Create a room in two browser sessions, join, tap Ready, and test moves. This live verification has not yet been performed here.
6. Send that HTTPS URL back to this chat. It can then be embedded into the TV APK to replace the initial server-address screen. Until that updated APK is built, the current preview accepts the hosted URL in its address field.

If the deploy link cannot select the private repository, install [Render's GitHub App](https://github.com/apps/render) for WORD SHIFT, then create **New → Blueprint** from that repository. Alternatively create **New → Web Service** with the manual settings below.

## Manual settings

| Setting | Value |
| --- | --- |
| Repository | `nikeelnaidoo5518/word-shift` |
| Branch | `main` |
| Runtime | Node |
| Build command | `npm test` |
| Start command | `npm start` |
| Instance plan | **Free** |
| Health check | `/api/health` |
| Environment | `NODE_VERSION=22`, `HOST=0.0.0.0` |

Render supplies `PORT` and `RENDER_EXTERNAL_URL` automatically. The server uses the latter for same-origin HTTPS validation behind Render's proxy. `PUBLIC_ORIGIN` can override it when using a custom domain. Forwarded client IPs remain untrusted by default, so the existing POST limit can be shared by clients behind Render's proxy. Configure explicit trusted proxy addresses only when verified; do not add wildcard proxy trust.

Automatic deploys are disabled in the Blueprint so repository updates do not restart an ongoing match. Deploy changes manually from the Render dashboard when players have finished. Use one service instance: the current room state is not shared between servers.

## Free-plan behavior

Checked against Render's official documentation on 2026-11-14:

- Node web services have a Free plan, with managed HTTPS and a Render subdomain.
- Free services spin down after 15 minutes without inbound traffic; waking takes about one minute. A quiet lobby may disconnect even if its SSE connection was open.
- The workspace includes 750 free instance hours per month. Bandwidth/build usage has separate included limits; without a payment method, exceeding applicable limits can suspend services or builds. Adding a payment method can allow usage charges. Keep the service on Free and review the account's usage settings.
- Instances can restart, and the filesystem is ephemeral. WORD SHIFT currently stores rooms in memory, so sleep, restarts, and deployments lose the current rooms. Persistent rooms/accounts have not been implemented.
- Internet is required on the TV and phones. They no longer need a computer running the server, and can join from different networks.

This is free hobby/testing hosting, not a promise of an always-on production service. Do not use artificial keepalive traffic to bypass the provider's idle policy.

Official sources: [Free plan and limits](https://render.com/docs/free), [Blueprint configuration](https://render.com/docs/blueprint-spec), [automatic environment variables](https://render.com/docs/environment-variables), [private repository deploy buttons](https://render.com/docs/deploy-to-render).
