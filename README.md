# Picnic Ball

**[Play the live game](https://picnic-ball.onrender.com)** · **[Public source repository](https://github.com/oreomans21/picnic-ball)**

A mouse-only, online two-player food baseball game. Unofficial fan project inspired by [Google’s Fourth of July 2019 Doodle](https://doodles.google/doodle/fourth-of-july-2019/). Not affiliated with or endorsed by Google.

The final direction is a fullscreen cartoon game: a real Three.js 3D field, illustrated articulated 2D characters, a Phaser input/HUD client, and an authoritative Node.js WebSocket server. The earlier beige interface and flat SVG fields are superseded.

## Run locally

Requires Node.js 22.12 or newer and npm. Tested here with Node 26.13.0 on Windows.

```sh
npm ci --include=dev
npm run build
npm start
```

Open **http://localhost:8787**. This one process serves the built frontend, art assets, `/health`, and WebSockets on the same port. No database, account, API key, or paid dependency is required.

For two players on a trusted local network, open `http://YOUR-COMPUTER-LAN-IP:8787` on each computer. Both must use the same address. Create a room, share the six-character code, join, and click Ready on both computers. Network/firewall permissions are managed by the computer owner.

For development:

```sh
npm run dev
```

Vite runs on port 5173 and the source server on 8787. The client selects the correct development WebSocket address automatically. Production uses the current origin and switches to `wss://` with HTTPS.

## Play

Use **Take a practice swing** for five replayable lessons. The Menu contains Practice, Animation studio, and How to play.

- Pitch: click Fastball, Curveball, or Changeup; aim inside the box; hold the mouse on the field; release near the green meter segment. The target locks when you press. Pitch choices, target, and meter are hidden from the batter. You have 12 seconds.
- Bat: move the aiming ring and click once as the ball approaches. The authored swing takes 180 ms to reach contact; aim and timing determine the result. Repeated clicks cannot create extra swings.
- Run: after fair contact, the batter is selected but stays put. Click a highlighted base or its large bottom button. Select other runners using their buttons. Stop, Return, and All advance are explicit commands.
- Defend: fielders chase, scoop, and catch automatically. When possession is secured, click a highlighted base or its bottom button to throw. Throws cannot be changed after commitment.

Three strikes retire a batter. Four balls award first base and move only forced runners. Three outs switch sides. Away bats first. Three innings, empty-base extras if tied, skipped unnecessary final home turn, and walk-offs are supported. Rematches swap home and away.

Caught flies require runners who left their original bases to return before advancing (tagging up). Uncaught fouls are dead and restore runners; a foul cannot be strike three. Force outs, tags, double plays, home runs, and third-out scoring are implemented. No steals, leads, bunts, pickoffs, dropped-third-strike advancement, infield-fly rules, or wild-pitch advancement.

After eight seconds without runner progress, a throw, or a possession change, a five-second warning appears. If inactivity continues, runners between bases (including an uncommanded batter) are out. A play otherwise ends only when surviving runners stop safely, no command/throw is pending, and the defense holds the ball.

## Deploy one Render Free service

Use the included **[render.yaml](render.yaml)**. Do not create a separate static site or database.

1. Put this folder’s contents at the root of a GitHub/GitLab repository. Commit `package-lock.json`, `render.yaml`, `client`, `server`, `shared`, `public`, `scripts`, and configuration files. Do not commit `node_modules`, `dist`, `build`, secrets, or local environment files.
2. In [Render](https://dashboard.render.com), choose **New → Blueprint**, connect that repository, and select this `render.yaml`.
3. Confirm the single resource is a **Web Service**, its compute plan is **Free**, and there are **no paid resources**. Keep one instance.
4. Build command: `npm ci --include=dev && npm run build`. Start command: `npm start`. Health check: `/health`.
5. Render supplies `PORT`; the app listens on `0.0.0.0` and that port. Do not hard-code an external port or add a second WebSocket service. Render supplies TLS and `RENDER_EXTERNAL_URL`; same-origin clients are accepted automatically.
6. When the deployment is Live, open the service’s `https://…onrender.com` URL. Create and join a room from two separate browsers. The invitation link uses this same public origin.
7. Verify `/health` returns `ok:true`, `maxRooms:2`, and the expected `players`. Play a short match and check Render logs for the `match-bandwidth` record.

Alternatively create a Web Service manually with the same settings and choose **Free** explicitly. If this folder is inside a larger repository, set Root Directory to its repository-relative folder.

**Deployed and verified on Render Free on November 5, 2026:** [picnic-ball.onrender.com](https://picnic-ball.onrender.com). One Node web service in Frankfurt serves the frontend, local fonts/art, HTTP endpoints, and secure WebSockets. There are no databases or other Render resources. The source repository is public with the owner's approval.

The existing service is `srv-dbmbgrdbedkc73bpci6g`; use the live link rather than creating another service. The steps above describe reproducing the deployment in another account.

CLI deployment uses the same settings:

```sh
render login
render workspace set
render services create --name picnic-ball --type web_service \
  --repo https://github.com/oreomans21/picnic-ball --branch main \
  --runtime node --plan free --num-instances 1 --region frankfurt \
  --build-command "npm ci --include=dev && npm run build" \
  --start-command "npm start" --health-check-path /health \
  --env-var NODE_ENV=production --env-var NODE_VERSION=22.22.0 \
  --output json --confirm
```

For the existing service, future code pushes to `main` auto-deploy. Documentation-only commits can use `[skip render]` to preserve active in-memory matches. To deploy manually: `render deploys create srv-dbmbgrdbedkc73bpci6g --wait --output json`.

### Environment

| Variable              | Default                  | Purpose                                                     |
| --------------------- | ------------------------ | ----------------------------------------------------------- |
| `PORT`                | `8787`                   | Render-provided listening port in production                |
| `NODE_ENV`            | unset locally            | `production` on Render                                      |
| `PUBLIC_ORIGIN`       | unset                    | Optional canonical HTTPS origin outside Render              |
| `RENDER_EXTERNAL_URL` | supplied by Render       | Automatic canonical origin                                  |
| `ALLOWED_ORIGINS`     | localhost/127.0.0.1:5173 | Comma-separated additional frontend origins, only if needed |

The included Dockerfile also serves the whole application from one process. Example: `docker build -t picnic-ball .` then `docker run --rm -p 8787:8787 -e PORT=8787 picnic-ball`. Docker execution was not available/tested here.

### Render Free constraints

Checked against official Render documentation on **November 5, 2026**:

- Free web services spin down after 15 minutes without inbound HTTP or WebSocket traffic; waking generally takes about a minute. The first HTTP visit may show Render’s own loading screen before this application can run. Within the app, failed connections retry with bounded backoff and explain startup delays.
- Free instance allocation: 512 MB RAM and 0.1 CPU. One instance, **two rooms and four seated players maximum**. No database or persistent disk.
- A workspace receives **750 free instance hours/month**, **5 GB outbound bandwidth/month on Hobby**, and **500 Starter build minutes/month**. These allowances are shared with other services. WebSocket responses and static-file responses both consume bandwidth.
- Free instances can restart. All rooms are in memory and are erased on restart, deploy, or spin-down. A surviving room accepts its room-specific reconnection token for 60 seconds and resumes after a three-second countdown. A missing room gives an explicit lost-match explanation and a New game action.
- Simulation and snapshot timers stop when all rooms are waiting, paused, or finished. A coarse five-second lifecycle/heartbeat check remains. No external keep-alive traffic is generated. Idle waiting rooms expire after 15 minutes; finished rooms after five minutes. Fully vacated waiting/finished rooms release their slot immediately.
- Free compute does **not** guarantee zero account charges if a payment method is attached and bandwidth/build allowances are exceeded. For a strictly free account, do not add a payment method; Render instead suspends affected service/builds at the applicable limits. Check current dashboard allowances before deployment.

Sources: [Free services](https://render.com/docs/free), [WebSockets](https://render.com/docs/websocket), [Bandwidth allowances](https://render.com/docs/outbound-bandwidth), [Build minutes](https://render.com/docs/build-pipeline), [Free compute specifications](https://render.com/articles/from-side-project-to-production-scaling-your-first-app).

## Architecture and bandwidth

- `shared/engine.ts`: fixed 60 Hz authoritative simulation, explicit phases, deterministic ball/running/fielding rules. Browser rendering never determines outcomes.
- `server/index.ts`: isolated private rooms, role/sequence/rate/legal-action checks, 20 Hz active snapshots, room tokens, origin checks, startup/restart lifecycle, static HTTP serving with gzip.
- `shared/wire.ts`: tuple-packed fielders/runners/players and transmission-only numeric rounding; negotiated WebSocket compression. Input messages declare actions, never outcomes.
- `client/main.ts`: room/practice flows, clock measurement, interpolation, context controls, reconnect state.
- `client/scene.ts`: Phaser pointer routing and screen-space aiming/base overlays.
- `client/world.ts`: actual 3D geometry, fixed-upright illustrated character planes, contact shadows, camera transition, ball height and effects. Static scenery is merged by material; static shadow maps are cached.
- `client/art.ts`: authored vector shapes, joint pose keys, facial expressions, equipment, and eleven clips. Front/rear/side views share a stable rig. High-resolution rasterization is used for the batter and pitcher.

Pitch-contact compensation maps the client timestamp using its measured clock offset and evaluates the current pitch’s parametric history, capped at 100 ms. Swing contact is resolved at its 180 ms animation event. Inputs outside the supported age are rejected; completed plays, outs, and scores are never rewound. Above 150 ms RTT, the client displays a connection warning.

**Measured match:** a 212.908-second, three-inning browser match with 55 pitches used **7,175,665 bytes (6.84 MiB) of decoded WebSocket payload across both players**, including room setup and the rematch request. There were 9,132 received frames. Server log for the match recorded 7,173,730 uncompressed outbound bytes and 46,178 input bytes. These are application-payload measurements, **not TLS/IP overhead or a Render bill**; negotiated WebSocket compression reduces on-wire payload. The built entry JavaScript was approximately 495 kB gzipped, plus about 5.4 kB gzipped HTML/CSS and 265 kB gzipped local variable font per uncached client. Preview atlases are not downloaded during gameplay. See `evidence/full-match-report.json` for raw measurements.

Using decoded payload as a conservative planning value for WebSocket data, plus about 1.53 MB of uncached frontend files for two players, this tested short match is roughly **8.7 MB before transport overhead**. Match length and input activity vary; do not treat this as a fixed per-match quota or assume unlimited free play. Monitor Render’s actual Outbound Bandwidth metric.

## Art, animation and evidence

`public/art/manifest.json` lists clips, event markers, durations, loops, views, frame dimensions, anchors, and atlas paths. Twelve transparent preview sheets cover four food designs × three views. Runtime uses original articulated vectors, rather than enlarging preview frames. All nine lineup accessories are generated consistently from the same designs.

Open **Menu → Animation studio** to inspect every clip, choose a food and view, replay a clip, pause, or review at quarter speed. `docs/REFERENCE.md` distinguishes observed reference details from original multiplayer/3D additions. `evidence/visual-contact-sheet.png`, the dimensional-slice recordings, and gameplay captures document the checkpoint. Old reference loading screens are evidence of the initial loading problem, not game assets.

## Verification and limitations

```sh
npm test
npm run build
```

The test suite includes a real 60-second forfeit test, so allow about 70 seconds. It covers counts, walks, foul/catch rules, force/tag/double-play logic, manual running, tag-ups, third-out scoring, home runs, side changes, extras, walk-offs, pause/resume, rematches, input validation, room capacity/isolation, delayed input, and restart loss.

Browser checks require separately installed test browsers: `npx playwright install ffmpeg firefox` and an installed Chrome/Edge. Start `npm run dev`, then run `npm run verify:browser`. Full online match check: start the built server, set `TEST_ORIGIN` to its local HTTP URL, then `npx tsx scripts/full-match.ts`. These scripts use real mouse controls, with read-only timing instrumentation.

Observed checks:

- Chrome 156: five practice lessons completed with mouse controls; full two-context match, home run, final screen, and rematch completed without page errors. Rendered at 1280×720, 1440×900, and 1920×1080.
- Edge 156.0.4314.58: practice rendering smoke check passed. Full-match coverage was Chrome only.
- Firefox 157 test binary could not launch (`spawn UNKNOWN`); Firefox compatibility remains unverified.
- A 1920×1080 headless Chrome run on an Intel Core Ultra 5 125U / Intel integrated Graphics, using ANGLE Direct3D11, averaged **59.82 reported render FPS over the last 600 samples** without video recording. Concurrent video/browser checks were around 36 FPS. This is a short local result, not a guarantee for every live-play scene or Render client.
- No connection between separate physical computers was available. The public Render service passed a two-browser HTTPS/WSS smoke test, including room creation/joining, ready states, pitching, contact, a manual run command, a defensive throw, pause and a real 60-second forfeit, without page errors. Observed RTT was approximately 85 ms. This was not a two-match load test. A 75 ms delayed input path was also tested locally; broad real-world latency/jitter fairness and browser RTT-warning behavior still need wider verification.
- Sprites are authored vector rigs rendered onto fixed upright planes, not volumetric characters. Rear/side drawings share the rig, and the camera deliberately maintains one azimuth to avoid rotating-cardboard behavior. The camera zooms rather than orbiting.

See `evidence/browser-report.json`, `evidence/performance.json`, `evidence/full-match-report.json`, and `evidence/render-verification.json`. Do not interpret unperformed checks as passes.
