# APEX Track Lab — game project handoff

## Request
Build an F1-inspired game where the player draws the track, selects cars from 2000 to the present, and drives in realistic-feeling graphics.

## Delivered version
- Freehand track drawing, automatic loop closing, draggable nodes, double-click insertion, undo, road-width selection, and four original presets.
- 306 season/chassis catalogue entries across 2000–2026, including 11 constructors in 2026. Team/chassis search and season/era selection.
- Browser-based Three.js 3D driving with painted formula cars, wings, exposed suspension, grooved early-era tyres, halo from 2018, asphalt, curbs, barriers, trees, hills, grandstands and shadows.
- Chase, cockpit and orbit cameras; daylight, golden-hour and overcast lighting; opt-in synthesized engine sound.
- Keyboard/touch controls; acceleration, braking, reverse, steering, off-road grip loss, grid reset and pause.
- Timed laps, ordered lap checkpoints, minimap, local personal-best records and circuit import/export.

## Files
- APEX-Track-Lab.html: standalone playable game, embedding the rendering engine and all game modules. Optional online fonts have system-font fallbacks.
- APEX-Track-Lab-source.zip: complete editable source, Three.js and its MIT license, checks, source references and README.
- APEX-preview.jpg: browser preview of the game.

## Implementation
Source modules: dist/app.js (UI, saving, selection and integration), dist/engine.js (3D world and driving), dist/track-editor.js (geometry/editor/validation), dist/cars.js (catalogue and references), dist/styles.css, dist/index.html.
Source directory in the original local workspace: /home/iram/Documents/Codex/2026-10-05/ma/work/apex-lab.
Start source locally: python3 -m http.server 4173 --directory dist.
Checks: node test-physics.mjs.

## Verified
Syntax checks, catalogue ID uniqueness and every season, valid presets, crossing rejection, editor/road spline length agreement, acceleration, braking, steering direction, reverse speed cap, lap checkpoint requirements. Browser rendered successfully; race launch, cockpit switch, pause, non-default-width session restoration, standalone rendering, circuit save and load were checked.

## Current limits
This is a single-player procedural 3D prototype, not a photorealistic licensed F1 simulator. Shared era-specific models and representative colors are interpretations. No scanned exact chassis, official telemetry, AI opponents or multiplayer. The catalogue does not include every chassis serial number, aero update, driver livery, or test-only design.

## Hosting status
A private, unpublished Site named APEX — Track Lab was registered with project ID appgprj_6ac38d968d80819183cb159df25213b0. Reuse this ID instead of creating a duplicate. Publishing did not occur: automatic approval review rejected creating a replacement Git write credential without explicit user approval. Do not retry that action without resolving the approval requirement. All local game files are available independently.
