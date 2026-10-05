# APEX — Track Lab

A browser racing game with a freehand circuit editor and a 2000–2026 formula-car archive.

## Play

Open `APEX-Track-Lab.html` from the separate standalone download in a modern browser with WebGL enabled. It contains the rendering library and game code. Internet access is only used for optional display fonts.

For this source package, run `python3 -m http.server 4173 --directory dist` from this folder, then visit http://localhost:4173.

1. Draw a continuous loop, or choose a preset.
2. Use Edit nodes to move corners. Double-click adds a node. Undo restores the preceding shape.
3. Choose any season from 2000 through 2026, then select a car.
4. Press Go racing.

Controls: W/Up accelerates; S/Down brakes then reverses; A/D or Left/Right steers; C changes camera; R returns to the grid; Escape pauses. Touch steering and pedals appear on small screens. Sound is opt-in. Controller: R2 / RT accelerates, L2 / LT brakes then reverses, and the left stick or D-pad steers. Connect a controller and press a button to activate it.

Tracks, the last setup and best laps are stored in this browser when browser storage is available. JSON export/import lets you keep a portable circuit copy. Records are separate for each car, circuit shape and width.

## Scope

306 season/chassis entries span 27 seasons. Includes named race-used variants; excludes test-only designs, individual chassis serial numbers, every aerodynamic update and every driver or event-specific livery. Source links appear in the game.

3D vehicles are original, shared procedural interpretations with era-specific proportions, details and representative team colors. They are not exact licensed replicas, photorealistic scans, or official simulation models. Performance and sound are game tuning. Single-player time trials and private remote rooms for 2–4 friends; no AI opponents.

## Checks

Run `node test-physics.mjs` (Node 18+). It checks catalogue IDs and coverage, valid presets, crossing rejection, agreement between editor and road spline lengths, acceleration, braking, steering, reverse and lap checkpoints.

Browser checks covered rendering, session restoration at a non-default track width, race launch, camera switching and pause. Photorealistic assets and complete historic aerodynamic simulation are outside this version's scope.

## Dependencies

Three.js 0.160.1, MIT license, included at dist/assets/THREE-LICENSE.txt. Optional Google Fonts: DM Sans and Barlow Condensed.

## Graphics refresh — October 5, 2026
Weather-matched sky reflections, clear-coated paint, rounded chassis sections and tyre shoulders, textured asphalt and grass, rubber racing-line shading, and varied broadleaf trees. The root index.html and standalone edition include the updated engine. Physics checks pass; browser rendering and race mode verified.

Reference-inspired night update: default Night race lighting, six nearby floodlights, circuit lamp poles, safety mesh, green guide markers, cockpit start camera, and live steering display. Older cars retain their period cockpit without a halo.

## Remote multiplayer (2–4 friends)

Run `npm start` from this folder with Node 18 or newer, then open `http://localhost:4173`. The server serves the game and private multiplayer rooms together, with no package installation required.

For friends in different locations, deploy this folder to a Node/Docker host that provides a public HTTPS URL. Use `node server.mjs` as the start command, or the included Dockerfile. The server respects the host's `PORT` environment variable. Use one running instance: rooms are held in memory and reset when the server restarts. Any reverse proxy must support unbuffered server-sent events, preserve the Host header, and set X-Forwarded-Proto to the original scheme. Static-only hosting and opening the downloaded HTML file directly do not provide a multiplayer server.

1. Everyone opens the same hosted game URL and selects a car.
2. The host chooses a circuit, enters their name under Race with friends, and selects Create room.
3. The host copies the invite link and sends it to up to three friends.
4. Friends open the link, enter their names, and select Join room.
5. Once at least two drivers have joined, the host selects Start race.

The host's circuit is shared automatically and setup is locked while in a room. Live opponent cars and lap counts are shown. Each driver controls their own car; pausing affects only that driver. Cars pass through each other. This is casual shared free driving with unlimited laps, not competitive server-validated racing. There is no fixed finish or collision system. Late joins are rejected after the start; leave and create a new room to race again. A departing host transfers hosting to the next driver. Drivers who lose contact for 15 seconds are removed and must rejoin a waiting room. Keep the tab active while playing.

Run `npm test` to check physics and multiplayer: capacity, invites, shared state, authorization, movement relay, malformed positions, host transfer and cleanup. Run `python3 build-standalone.py` after source edits to rebuild both single-file copies.

### Current temporary play link

https://collector-loans-higher-definitions.trycloudflare.com

Started October 5, 2026 using Cloudflare Quick Tunnel. Keep this computer awake and both server processes running. This link is temporary and changes when the tunnel is restarted; it is not permanent hosting. The browser now exchanges room snapshots with ordinary HTTP requests, which work through Quick Tunnel without SSE. The optional SSE endpoint remains available for other clients.

To start again: run `HOST=127.0.0.1 PORT=4173 npm start`, then in another terminal run `./tools/cloudflared tunnel --url http://127.0.0.1:4173 --no-autoupdate`. Share the new HTTPS address printed by Cloudflare. Only the game and its room API are served.

### Room chat

Create or join a room to see Room chat. Messages are shared with everyone in that room, in the lobby and during driving. Press Enter or Send to send; Escape leaves the message field so you can drive again. Collapse Room chat to save space; new messages show an unread count. Typing clears held driving inputs and does not trigger steering, camera, or reset shortcuts. The last 50 messages are kept while the room exists (300 characters per message); room history disappears when the room closes or the server restarts.

## Installable app (Android, PC, iPhone)

The `dist` folder is now a PWA: app icons, standalone launch, and a versioned offline game cache. Use one stable HTTPS address for installation and saved progress. A temporary tunnel is suitable for a preview, but installed apps stop reaching the server when its address changes. This package does not publish a website or create app-store binaries.

Start with `node server.mjs` (no npm or dependency installation needed). For production, deploy this folder to a Node host with HTTPS and use `node server.mjs` as its start command. This preserves multiplayer and chat. A static HTTPS host can instead serve `dist`, with single-player only. Do not upload the standalone HTML as the PWA entry point.

- Android: open the hosted address in Chrome and select Install app.
- Windows/Linux PC: use Chrome or Edge and the address-bar install icon.
- iPhone: open in Safari, choose Share → Add to Home Screen, and enable Open as Web App if shown.

Open the game online once and wait for “Ready for offline single-player racing” in the installation dialog. Single-player then works offline; multiplayer and chat still require a running server and internet. Saves belong to the browser/app on each device; export circuits before switching devices or addresses. Browser storage can be cleared by the user or operating system.

Graphics now offer Auto, Smooth, and High. Auto selects lower resolution and 1024px shadows on touch devices; High uses up to 2× display resolution and 2048px shadows. Off-track dust uses a fixed particle pool. The speed display has improved contrast. Physics, camera behavior, cars, track editing, multiplayer, and chat are retained.

For releases, bump the cache version in `dist/sw.js` whenever cached game files change. Updates activate after all old app windows close; no forced reload during a race. Rebuild the standalone edition using `python3 build-standalone.py`. It remains playable as a single file, but app installation requires the hosted edition.

### Realism pass
Darker fine-grain asphalt, worn kerbs, gravel shoulders, curved tyre deposits, carbon-fibre weave, tyre microtexture, brake discs, sculpted sidepods, and soft contact shadows beneath every car. Procedural clouds and revised daylight/golden-hour/night light balance add depth without external asset downloads. Guidance markers are subtler. Handling and fixed driving cameras remain unchanged. This is a procedural visual upgrade, not photorealistic scanned cars or a new simulation physics model.

### Circuit environment update
Continuous rolling terrain replaces the flat horizon strips. Grass now has broad color variation, dry patches and subtle mowing bands. A numbered ten-bay garage building with reflective upper glazing and canopies, plus three additional covered grandstands, gives the circuit more context. New building footprints are checked against the full custom track before placement. Both standalone HTML editions are rebuilt; offline cache version is v10.

### F1 24-inspired presentation pass
Daylight now starts by default with stronger directional contrast and weather-specific exposure. Finer asphalt, turquoise runoff strips, corner approach distance boards and APEX barrier panels add circuit detail. Modern cars have smoother chassis sections, cooling louvres, floor fences and revised clear-coat paint. The race HUD uses dark timing panels, a red accent and animated rev lights driven by the existing speed/gear model. These remain original procedural graphics, not an exact reproduction of F1 24.

Verified in the browser in race mode; controller, physics and multiplayer regression checks pass. Both standalone editions are rebuilt; offline cache is v12.

### Surface and aero detail update
World-space asphalt grain and roughness variation fade with distance to limit shimmer. Car reflections now include a dark ground horizon; curved aerofoil wings replace rectangular flaps, and tyres include curved sidewall markings. High graphics uses 4096px directional shadows; Smooth retains 1024px shadows. Both standalone editions are rebuilt and offline cache is v13. Controller, physics and multiplayer checks pass.
