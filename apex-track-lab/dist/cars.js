// Season/chassis catalogue, 2000–2026. Names are historical; this is not licensed
// vehicle CAD or telemetry. Colors are representative artistic approximations.
// Repeated chassis across seasons remain separate season entries. Named, raced
// B-spec evolutions are included; test-only cars (MP4-18, TF101, etc.) are not.
// Performance and procedural body geometry are game tuning, not source data.

const TEAMS = {
  ferrari: ['Ferrari', '#e92732', '#ffffff'],
  mclaren: ['McLaren', '#ff8700', '#16191f'],
  williams: ['Williams', '#176de5', '#79dbff'],
  benetton: ['Benetton', '#37aada', '#fff34c'],
  bar: ['BAR', '#eeeae1', '#dc2338'],
  jordan: ['Jordan', '#ffd82f', '#151515'],
  arrows: ['Arrows', '#ff6c20', '#1f2528'],
  sauber: ['Sauber', '#143b79', '#25cba6'],
  jaguar: ['Jaguar', '#07583e', '#ece8dd'],
  minardi: ['Minardi', '#20262a', '#f2f2e8'],
  prost: ['Prost', '#194eaa', '#d2d5d7'],
  toyota: ['Toyota', '#f0eee9', '#e42738'],
  renault: ['Renault', '#ffe136', '#1b1d23'],
  redbull: ['Red Bull Racing', '#182c5b', '#f8d038'],
  honda: ['Honda', '#f0f0e9', '#d52232'],
  bmwsauber: ['BMW Sauber', '#f0f2f2', '#214782'],
  tororosso: ['Toro Rosso', '#18316b', '#cc2737'],
  midland: ['Midland / Spyker MF1', '#bfc3c5', '#ef3033'],
  superaguri: ['Super Aguri', '#f0efea', '#eb3342'],
  spyker: ['Spyker', '#f57924', '#efefec'],
  forceindia: ['Force India', '#f5f2e9', '#e96725'],
  brawn: ['Brawn GP', '#f2f3ed', '#c8f13d'],
  mercedes: ['Mercedes', '#abb4b8', '#29d7c2'],
  lotusracing: ['Lotus Racing', '#134532', '#dfc950'],
  teamlotus: ['Team Lotus', '#164633', '#e4c65b'],
  lotus: ['Lotus', '#191b1d', '#cba35c'],
  hrt: ['HRT', '#b8babe', '#ad2837'],
  virgin: ['Virgin Racing', '#34353a', '#e4283c'],
  caterham: ['Caterham', '#197848', '#f1d344'],
  marussia: ['Marussia', '#eb3441', '#1f252b'],
  manormarussia: ['Manor Marussia', '#e72d3d', '#f4f2ed'],
  manor: ['Manor Racing', '#2287c9', '#f23b32'],
  haas: ['Haas', '#b9babe', '#e83039'],
  rpforceindia: ['Racing Point Force India', '#e99fbf', '#28344f'],
  racingpoint: ['Racing Point', '#ed9fc5', '#237abb'],
  alfaromeo: ['Alfa Romeo', '#ecebe5', '#861c31'],
  alphatauri: ['AlphaTauri', '#edf0ee', '#182842'],
  alpine: ['Alpine', '#1998df', '#ee9bc2'],
  astonmartin: ['Aston Martin', '#086953', '#c4e94c'],
  rb: ['RB', '#2854db', '#f0f1f0'],
  racingbulls: ['Racing Bulls', '#eeeef0', '#244bc9'],
  audi: ['Audi', '#c6c8cc', '#f74126'],
  cadillac: ['Cadillac', '#e2e1db', '#24262a'],
};

// Each row: team key | chassis design(s) | engine marque/badge.
const SEASONS = {
  2000: `ferrari|F1-2000|Ferrari
mclaren|MP4-15|Mercedes
williams|FW22|BMW
benetton|B200|Supertec
bar|002|Honda
jordan|EJ10,EJ10B|Mugen-Honda
arrows|A21|Supertec
sauber|C19|Petronas
jaguar|R1|Cosworth
minardi|M02|Fondmetal
prost|AP03|Peugeot`,
  2001: `ferrari|F2001|Ferrari
mclaren|MP4-16|Mercedes
williams|FW23|BMW
benetton|B201|Renault
bar|003|Honda
jordan|EJ11,EJ11B|Honda
arrows|A22|Asiatech
sauber|C20|Petronas
jaguar|R2|Cosworth
minardi|PS01,PS01B|European
prost|AP04|Acer`,
  2002: `ferrari|F2001B,F2002|Ferrari
mclaren|MP4-17|Mercedes
williams|FW24|BMW
renault|R202|Renault
bar|004|Honda
jordan|EJ12|Honda
arrows|A23|Cosworth
sauber|C21|Petronas
jaguar|R3,R3B|Cosworth
minardi|PS02|Asiatech
toyota|TF102|Toyota`,
  2003: `ferrari|F2002B,F2003-GA|Ferrari
mclaren|MP4-17D|Mercedes
williams|FW25|BMW
renault|R23,R23B|Renault
bar|005|Honda
jordan|EJ13|Ford Cosworth
sauber|C22|Petronas
jaguar|R4|Cosworth
minardi|PS03|Cosworth
toyota|TF103|Toyota`,
  2004: `ferrari|F2004|Ferrari
mclaren|MP4-19,MP4-19B|Mercedes
williams|FW26|BMW
renault|R24|Renault
bar|006|Honda
jordan|EJ14|Ford Cosworth
sauber|C23|Petronas
jaguar|R5,R5B|Cosworth
minardi|PS04B|Cosworth
toyota|TF104,TF104B|Toyota`,
  2005: `ferrari|F2004M,F2005|Ferrari
mclaren|MP4-20|Mercedes
williams|FW27|BMW
renault|R25|Renault
bar|007|Honda
jordan|EJ15,EJ15B|Toyota
sauber|C24|Petronas
redbull|RB1|Cosworth
minardi|PS04B,PS05|Cosworth
toyota|TF105,TF105B|Toyota`,
  2006: `ferrari|248 F1|Ferrari
mclaren|MP4-21|Mercedes
williams|FW28|Cosworth
renault|R26|Renault
honda|RA106|Honda
bmwsauber|F1.06|BMW
redbull|RB2|Ferrari
tororosso|STR1|Cosworth
midland|M16|Toyota
toyota|TF106,TF106B|Toyota
superaguri|SA05,SA06|Honda`,
  2007: `ferrari|F2007|Ferrari
mclaren|MP4-22|Mercedes
williams|FW29|Toyota
renault|R27|Renault
honda|RA107|Honda
bmwsauber|F1.07|BMW
redbull|RB3|Renault
tororosso|STR2|Ferrari
spyker|F8-VII,F8-VIIB|Ferrari
toyota|TF107|Toyota
superaguri|SA07|Honda`,
  2008: `ferrari|F2008|Ferrari
mclaren|MP4-23|Mercedes
williams|FW30|Toyota
renault|R28|Renault
honda|RA108|Honda
bmwsauber|F1.08|BMW
redbull|RB4|Renault
tororosso|STR2B,STR3|Ferrari
forceindia|VJM01|Ferrari
toyota|TF108|Toyota
superaguri|SA08A|Honda`,
  2009: `ferrari|F60|Ferrari
mclaren|MP4-24|Mercedes
williams|FW31|Toyota
renault|R29|Renault
brawn|BGP 001|Mercedes
bmwsauber|F1.09|BMW
redbull|RB5|Renault
tororosso|STR4|Ferrari
forceindia|VJM02|Mercedes
toyota|TF109|Toyota`,
  2010: `ferrari|F10|Ferrari
mclaren|MP4-25|Mercedes
williams|FW32|Cosworth
renault|R30|Renault
mercedes|MGP W01|Mercedes
bmwsauber|C29|Ferrari
redbull|RB6|Renault
tororosso|STR5|Ferrari
forceindia|VJM03|Mercedes
lotusracing|T127|Cosworth
hrt|F110|Cosworth
virgin|VR-01|Cosworth`,
  2011: `ferrari|150° Italia|Ferrari
mclaren|MP4-26|Mercedes
williams|FW33|Cosworth
renault|R31|Renault
mercedes|MGP W02|Mercedes
sauber|C30|Ferrari
redbull|RB7|Renault
tororosso|STR6|Ferrari
forceindia|VJM04|Mercedes
teamlotus|T128|Renault
hrt|F111|Cosworth
virgin|MVR-02|Cosworth`,
  2012: `ferrari|F2012|Ferrari
mclaren|MP4-27|Mercedes
williams|FW34|Renault
lotus|E20|Renault
mercedes|F1 W03|Mercedes
sauber|C31|Ferrari
redbull|RB8|Renault
tororosso|STR7|Ferrari
forceindia|VJM05|Mercedes
caterham|CT01|Renault
hrt|F112|Cosworth
marussia|MR01|Cosworth`,
  2013: `ferrari|F138|Ferrari
mclaren|MP4-28|Mercedes
williams|FW35|Renault
lotus|E21|Renault
mercedes|F1 W04|Mercedes
sauber|C32|Ferrari
redbull|RB9|Renault
tororosso|STR8|Ferrari
forceindia|VJM06|Mercedes
caterham|CT03|Renault
marussia|MR02|Cosworth`,
  2014: `ferrari|F14 T|Ferrari
mclaren|MP4-29|Mercedes
williams|FW36|Mercedes
lotus|E22|Renault
mercedes|F1 W05 Hybrid|Mercedes
sauber|C33|Ferrari
redbull|RB10|Renault
tororosso|STR9|Renault
forceindia|VJM07|Mercedes
caterham|CT05|Renault
marussia|MR03|Ferrari`,
  2015: `ferrari|SF15-T|Ferrari
mclaren|MP4-30|Honda
williams|FW37|Mercedes
lotus|E23 Hybrid|Mercedes
mercedes|F1 W06 Hybrid|Mercedes
sauber|C34|Ferrari
redbull|RB11|Renault
tororosso|STR10|Renault
forceindia|VJM08,VJM08B|Mercedes
manormarussia|MR03B|Ferrari`,
  2016: `ferrari|SF16-H|Ferrari
mclaren|MP4-31|Honda
williams|FW38|Mercedes
renault|R.S.16|Renault
mercedes|F1 W07 Hybrid|Mercedes
sauber|C35|Ferrari
redbull|RB12|TAG Heuer
tororosso|STR11|Ferrari
forceindia|VJM09|Mercedes
manor|MRT05|Mercedes
haas|VF-16|Ferrari`,
  2017: `ferrari|SF70H|Ferrari
mclaren|MCL32|Honda
williams|FW40|Mercedes
renault|R.S.17|Renault
mercedes|F1 W08 EQ Power+|Mercedes
sauber|C36|Ferrari
redbull|RB13|TAG Heuer
tororosso|STR12|Renault
forceindia|VJM10|Mercedes
haas|VF-17|Ferrari`,
  2018: `ferrari|SF71H|Ferrari
mclaren|MCL33|Renault
williams|FW41|Mercedes
renault|R.S.18|Renault
mercedes|F1 W09 EQ Power+|Mercedes
sauber|C37|Ferrari
redbull|RB14|TAG Heuer
tororosso|STR13|Honda
forceindia|VJM11|Mercedes
rpforceindia|VJM11|Mercedes
haas|VF-18|Ferrari`,
  2019: `ferrari|SF90|Ferrari
mclaren|MCL34|Renault
williams|FW42|Mercedes
renault|R.S.19|Renault
mercedes|F1 W10 EQ Power+|Mercedes
alfaromeo|C38|Ferrari
redbull|RB15|Honda
tororosso|STR14|Honda
racingpoint|RP19|Mercedes
haas|VF-19|Ferrari`,
  2020: `ferrari|SF1000|Ferrari
mclaren|MCL35|Renault
williams|FW43|Mercedes
renault|R.S.20|Renault
mercedes|F1 W11 EQ Performance|Mercedes
alfaromeo|C39|Ferrari
redbull|RB16|Honda
alphatauri|AT01|Honda
racingpoint|RP20|Mercedes
haas|VF-20|Ferrari`,
  2021: `ferrari|SF21|Ferrari
mclaren|MCL35M|Mercedes
williams|FW43B|Mercedes
alpine|A521|Renault
mercedes|F1 W12 E Performance|Mercedes
alfaromeo|C41|Ferrari
redbull|RB16B|Honda
alphatauri|AT02|Honda
astonmartin|AMR21|Mercedes
haas|VF-21|Ferrari`,
  2022: `ferrari|F1-75|Ferrari
mclaren|MCL36|Mercedes
williams|FW44|Mercedes
alpine|A522|Renault
mercedes|F1 W13 E Performance|Mercedes
alfaromeo|C42|Ferrari
redbull|RB18|RBPT
alphatauri|AT03|RBPT
astonmartin|AMR22|Mercedes
haas|VF-22|Ferrari`,
  2023: `ferrari|SF-23|Ferrari
mclaren|MCL60|Mercedes
williams|FW45|Mercedes
alpine|A523|Renault
mercedes|F1 W14 E Performance|Mercedes
alfaromeo|C43|Ferrari
redbull|RB19|Honda RBPT
alphatauri|AT04|Honda RBPT
astonmartin|AMR23|Mercedes
haas|VF-23|Ferrari`,
  2024: `ferrari|SF-24|Ferrari
mclaren|MCL38|Mercedes
williams|FW46|Mercedes
alpine|A524|Renault
mercedes|F1 W15 E Performance|Mercedes
sauber|C44|Ferrari
redbull|RB20|Honda RBPT
rb|VCARB 01|Honda RBPT
astonmartin|AMR24|Mercedes
haas|VF-24|Ferrari`,
  2025: `ferrari|SF-25|Ferrari
mclaren|MCL39|Mercedes
williams|FW47|Mercedes
alpine|A525|Renault
mercedes|F1 W16 E Performance|Mercedes
sauber|C45|Ferrari
redbull|RB21|Honda RBPT
racingbulls|VCARB 02|Honda RBPT
astonmartin|AMR25|Mercedes
haas|VF-25|Ferrari`,
  2026: `ferrari|SF-26|Ferrari
mclaren|MCL40|Mercedes
williams|FW48|Mercedes
alpine|A526|Mercedes
mercedes|F1 W17 E Performance|Mercedes
audi|R26|Audi
redbull|RB22|Red Bull Ford
racingbulls|VCARB 03|Red Bull Ford
astonmartin|AMR26|Honda
haas|VF-26|Ferrari
cadillac|MAC-26|Ferrari`,
};

function palette(team, year) {
  const [, color, accent] = TEAMS[team];
  if (team === 'mclaren') {
    if (year <= 2005) return ['#bac0c3', '#292b2e'];
    if (year <= 2013) return ['#c0c6ca', '#ed3938'];
    if (year <= 2016) return ['#373b40', '#ff3942'];
    if (year >= 2018 && year <= 2021) return ['#ff8b17', '#258ece'];
  }
  if (team === 'williams') {
    if (year <= 2005) return ['#eaeef0', '#234a96'];
    if (year <= 2013) return ['#172e51', '#e8edf0'];
    if (year <= 2018) return ['#f0f1ed', '#276396'];
    if (year <= 2020) return ['#ecf1f0', '#28b8de'];
  }
  if (team === 'renault') {
    if (year <= 2006) return ['#44a8d4', '#ffe12b'];
    if (year <= 2009) return ['#ffe63b', '#ecece6'];
    if (year === 2011) return ['#1b1b1b', '#caab69'];
  }
  if (team === 'minardi' && year === 2000) return ['#f2ec2c', '#164a4b'];
  if (team === 'sauber') {
    if (year >= 2024) return ['#56e83d', '#191e1a'];
    if (year === 2018) return ['#f2eee9', '#8e1c35'];
    if (year === 2017) return ['#2779ce', '#c3a45e'];
    if (year >= 2015) return ['#2c64bf', '#f3d631'];
    if (year >= 2013) return ['#858e99', '#db343e'];
    if (year >= 2011) return ['#f1f0e8', '#cf333b'];
  }
  if (team === 'forceindia') {
    if (year >= 2017) return ['#eea7c5', '#283e62'];
    if (year >= 2014) return ['#aeb1b7', '#f16d25'];
    if (year >= 2009) return ['#f5f3ed', '#40ad65'];
  }
  if (team === 'tororosso' && year >= 2017) return ['#246ad7', '#df343b'];
  if (team === 'mercedes' && (year === 2020 || year === 2021 || year >= 2023)) return ['#262a2d', '#31d9c2'];
  if (team === 'ferrari' && year >= 2022) return ['#e12d32', '#212226'];
  if (team === 'haas' && year === 2019) return ['#242221', '#beaa69'];
  if (team === 'haas' && year >= 2021) return ['#e9ebed', '#df2b36'];
  if (team === 'hrt' && year >= 2011) return ['#eeeeea', '#b29245'];
  if (team === 'alfaromeo' && year === 2023) return ['#921f32', '#202022'];
  if (team === 'alpine' && year === 2021) return ['#227bbd', '#e93643'];
  return [color, accent];
}

export const CARS = Object.entries(SEASONS).flatMap(([season, rows]) => {
  const year = Number(season);
  return rows.split('\n').flatMap(row => {
    const [key, models, marque] = row.split('|');
    const [color, accent] = palette(key, year);
    const isV10 = year <= 2005 || (year === 2006 && key === 'tororosso');
    const configuration = isV10 ? '3.0L V10' : year <= 2013 ? '2.4L V8' : '1.6L V6 hybrid';
    const era = year === 2026 ? '2026' : year >= 2022 ? 'groundeffect' : year >= 2014 ? 'hybrid' : isV10 ? 'v10' : 'v8';
    return models.split(',').map(model => ({
      id: `${year}-${key}-${model.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      year,
      team: TEAMS[key][0],
      model,
      color,
      accent,
      engine: `${marque} · ${configuration}${year === 2006 && key === 'tororosso' ? ' (restricted)' : ''}`,
      era,
    }));
  });
});

export const SOURCES = [
  { title: 'FIA 2026 entry list', url: 'https://www.fia.com/sites/default/files/media_kit-formula_1_heineken_chinese_grand_prix_2026.pdf', note: '2026 chassis names, including MAC-26, R26 and VCARB 03; p. 18.' },
  { title: 'Formula 1 team directory', url: 'https://www.formula1.com/en/teams', note: 'Current 2026 teams and power-unit suppliers; checked 5 October 2026.' },
  { title: 'FIA 2025 entry list', url: 'https://www.fia.com/sites/default/files/media_kit_-_2025_australian_grand_prix_.pdf', note: '2025 chassis and engine marques.' },
  { title: 'McLaren heritage', url: 'https://www.mclaren.com/racing/heritage/formula-1/', note: 'Historical McLaren chassis archive.' },
  { title: 'McLaren race-winning chassis', url: 'https://www.mclaren.com/racing/heritage/mclaren-tops-the-post-66-grand-prix-wins-list/', note: 'Includes MP4-17D and MP4-19B.' },
  { title: 'Ferrari history', url: 'https://www.ferrari.com/en-UG/history/garage/2004/f2004', note: 'Ferrari car archive and historical season context.' },
  { title: 'Honda: Jordan EJ11', url: 'https://global.honda/en/F1/machine/2001_JordanHondaEJ11/', note: 'Confirms the 2001 EJ11B race evolution.' },
  { title: 'Minardi: PS01', url: 'https://www.minardi.it/en/minardi-ps01-fernando-alonsos-star-is-born/', note: 'Confirms the race-used 2001 PS01B.' },
  { title: 'Honda racing history', url: 'https://global.honda/en/about/history-digest/75years-history/pdf/chapter_all.pdf', note: 'BAR, Honda and Super Aguri chassis and engine history.' },
  { title: 'Toyota: TF106B evolution', url: 'https://toyotagazooracing.com/archive/ms/en/F1archive/team/tf106/analysis_b.html', note: 'Official TF105B and TF106B development history.' },
  { title: 'Toyota: 2006 Monaco race preview', url: 'https://toyotagazooracing.com/archive/ms/public/en/gp/07_monaco/preview.html', note: 'Confirms TF106B race debut.' },
  { title: 'RM Sotheby’s: Ferrari F2001B', url: 'https://rmsothebys.com/stories/michael-schumacher-s-2002-australian-grand-prix-winning-f2001b/', note: 'Provenance of Ferrari’s race-used early-2002 evolution.' },
  { title: 'Formula 1: 2016 season guide', url: 'https://www.formula1.com/en/latest/article/the-2016-season-preview-new-rules-teams-drivers-races.3NMOis0uMLex150BiUtkc4', note: 'Confirms Force India VJM08B and VJM09.' },
];

export const CATALOGUE_NOTE = 'Historical season/chassis catalogue. Shared procedural bodies and representative colors are artistic interpretations; handling is tuned for this game. Includes named race-used evolutions, not every aero update, chassis serial number, driver livery or test-only design. 2026 checked 5 October 2026.';
