# Car catalogue verification

The game catalogue exports 306 selectable season/chassis entries spanning every season from 2000 through 2026. Each entry has a unique ID, numeric year, team name, model, CSS hex colors, engine badge/configuration, and one of the requested five era keys. A Node import check validated all required fields, all colors and ID uniqueness.

Coverage means the principal race-entered design for each constructor/season plus named race-used evolutions. It does not mean individual chassis serial numbers, every aerodynamic package, every driver-specific paint scheme, or test-only designs. McLaren MP4-18, Toyota TF101 and other never-raced designs are excluded. The same car appearing in two seasons has a separate season entry. Force India and Racing Point Force India are separate 2018 entrant entries for VJM11. Midland's 2006 takeover is shown in one M16 entry as “Midland / Spyker MF1”.

## Verification highlights

- All 2025 chassis names/engine marques checked against the [FIA Australian GP media kit](https://www.fia.com/sites/default/files/media_kit_-_2025_australian_grand_prix_.pdf).
- All 2026 chassis names checked against the [FIA Chinese GP media kit, page 18](https://www.fia.com/sites/default/files/media_kit-formula_1_heineken_chinese_grand_prix_2026.pdf). The current grid has eleven teams; Cadillac is **MAC-26**, Audi **R26**, Racing Bulls **VCARB 03**. Current [F1 team profiles](https://www.formula1.com/en/teams) verify 2026 power-unit suppliers: Alpine uses Mercedes, Aston Martin Honda, Red Bull and Racing Bulls Red Bull Ford, and Cadillac Ferrari.
- [Honda's official Jordan EJ11 history](https://global.honda/en/F1/machine/2001_JordanHondaEJ11/) explicitly confirms the otherwise easily missed EJ11B raced from Hungary 2001.
- [Minardi's official PS01 retrospective](https://www.minardi.it/en/minardi-ps01-fernando-alonsos-star-is-born/) confirms the PS01B race evolution.
- [McLaren's historical wins list](https://www.mclaren.com/racing/heritage/mclaren-tops-the-post-66-grand-prix-wins-list/) explicitly lists MP4-17D (2003) and MP4-19B (2004).
- [Toyota's TF106B analysis](https://toyotagazooracing.com/archive/ms/en/F1archive/team/tf106/analysis_b.html) and [2006 Monaco race preview](https://toyotagazooracing.com/archive/ms/public/en/gp/07_monaco/preview.html) establish the TF105B/TF106B history and TF106B race debut.
- Ferrari's 2002 carry-over is labelled F2001B, consistent with [RM Sotheby's provenance of the Australian GP winner](https://rmsothebys.com/stories/michael-schumacher-s-2002-australian-grand-prix-winning-f2001b/). The early-2003 F2002 evolution is labelled F2002B; some sources shorten it to F2002.
- Contemporary reporting documents [Jaguar R3B's 2002 race debut](https://www.autosport.com/f1/news/jaguar-drivers-reserve-judgement-on-r3b-5060366/5060366/), [R5B at the 2004 Chinese GP](https://au.motorsport.com/f1/news/trouble-free-morning-for-jaguar/1176281/), and [Renault R23B at Silverstone 2003](https://www.autosport.com/f1/news/renault-introduces-r23b-for-silverstone-5025259/5025259/).
- [Formula 1's 2016 season preview](https://www.formula1.com/en/latest/article/the-2016-season-preview-new-rules-teams-drivers-races.3NMOis0uMLex150BiUtkc4) confirms VJM08B's use in the second half of 2015.
- Toro Rosso's 2006 STR1 is assigned the restricted 3.0L V10 engine and `v10` handling era, while the rest of that season is V8.

## Graphics and handling caveat

Hex colors are artistic period/team approximations, not measured paint values. Shared procedural geometry is not an exact scan of each named chassis. Performance comes from the game's own tuning; no measured vehicle specifications or historical performance rankings are claimed. Do not describe 306 catalogue entries as 306 individually licensed, exact 3D car models. The app should expose this short distinction in its About or source information.

Checked 5 October 2026. Historical coverage was assembled from the known season grids with targeted source checks for variants; it was not exhaustively audited against every race's entry sheet.
