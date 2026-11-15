// Domain Constants, Showdown Paste Parser, and Champions Lv.50 Stat Calculator

const SAMPLE_PASTES = {
  1: `Torkoal (F) @ Charcoal
Ability: Drought
EVs: 17 HP / 32 SpA / 17 SpD
Quiet Nature
- Weather Ball
- Earth Power
- Protect
- Eruption

Farigiraf (M) @ Mental Herb
Ability: Armor Tail
EVs: 23 HP / 1 Def / 32 SpA / 10 SpD
Relaxed Nature
- Hyper Voice
- Helping Hand
- Trick Room
- Expanding Force

Maushold-Four @ Rocky Helmet
Ability: Friend Guard
EVs: 19 HP / 10 Def / 5 SpD / 32 Spe
Timid Nature
- After You
- Protect
- Feint
- Follow Me

Gardevoir (F) @ Gardevoirite
Ability: Telepathy
EVs: 19 HP / 15 Def / 32 SpA
Quiet Nature
- Psyshock
- Trick Room
- Protect
- Hyper Voice

Overqwil (M) @ Black Glasses
Ability: Intimidate
EVs: 19 HP / 32 Atk / 15 SpD
Brave Nature
- Poison Jab
- Throat Chop
- Taunt
- Protect

Pelipper (M) @ Mystic Water
Ability: Drizzle
EVs: 24 HP / 32 SpA / 10 SpD
Quiet Nature
- Hurricane
- Weather Ball
- Wide Guard
- Muddy Water`,

  2: `Clefable (M) @ Rocky Helmet
Ability: Magic Guard
EVs: 32 HP / 17 Def / 17 SpD
Relaxed Nature
- Helping Hand
- Dazzling Gleam
- Protect
- Follow Me

Indeedee-F @ Colbur Berry
Ability: Psychic Surge
EVs: 32 HP / 32 Def / 2 SpA
Relaxed Nature
- Helping Hand
- Psychic
- Follow Me
- Trick Room

Sneasler (M) @ Psychic Seed
Ability: Unburden
EVs: 2 HP / 32 Atk / 32 Spe
Jolly Nature
- Dire Claw
- Rock Slide
- Protect
- Close Combat

Charizard (M) @ Charizardite Y
Ability: Blaze
EVs: 2 HP / 32 SpA / 32 Spe
Modest Nature
- Weather Ball
- Solar Beam
- Heat Wave
- Protect

Garchomp (F) @ Choice Scarf
Ability: Rough Skin
EVs: 9 HP / 32 Atk / 10 Def / 15 Spe
Jolly Nature
- Earthquake
- Stomping Tantrum
- Rock Slide
- Dragon Claw

Gholdengo @ Life Orb
Ability: Good as Gold
EVs: 32 HP / 32 SpA / 2 SpD
Quiet Nature
- Make It Rain
- Nasty Plot
- Protect
- Shadow Ball`,

  3: `Gardevoir (M) @ Life Orb
Ability: Telepathy
EVs: 19 HP / 15 Def / 32 SpA
Modest Nature
- Moonblast
- Expanding Force
- Psychic
- Protect

Indeedee-F @ Rocky Helmet
Ability: Psychic Surge
EVs: 32 HP / 32 Def / 2 SpA
Relaxed Nature
- Helping Hand
- Psychic
- Follow Me
- Protect

Sneasler (M) @ Psychic Seed
Ability: Unburden
EVs: 2 HP / 32 Atk / 32 Spe
Jolly Nature
- Dire Claw
- Rock Slide
- Protect
- Close Combat

Charizard (M) @ Charizardite Y
Ability: Blaze
EVs: 2 HP / 32 SpA / 32 Spe
Modest Nature
- Weather Ball
- Solar Beam
- Heat Wave
- Protect

Garchomp (F) @ Choice Scarf
Ability: Rough Skin
EVs: 9 HP / 32 Atk / 10 Def / 15 Spe
Jolly Nature
- Earthquake
- Stomping Tantrum
- Rock Slide
- Dragon Claw

Milotic (M) @ Mystic Water
Ability: Competitive
EVs: 31 HP / 3 Def / 32 SpA
Quiet Nature
- Muddy Water
- Ice Beam
- Protect
- Scald`,

  4: `Garchomp (M) @ Garchompite Z
Ability: Rough Skin
EVs: 2 HP / 32 SpA / 32 Spe
Timid Nature
- Draco Meteor
- Earth Power
- Flamethrower
- Protect

Golisopod (M) @ Golisopite
Ability: Emergency Exit
EVs: 32 HP / 32 Atk / 2 SpD
Adamant Nature
- First Impression
- Liquidation
- Leech Life
- Aqua Jet

Lucario (M) @ Lucarionite Z
Ability: Inner Focus
EVs: 2 HP / 32 SpA / 32 Spe
Timid Nature
- Aura Sphere
- Flash Cannon
- Vacuum Wave
- Nasty Plot

Baxcalibur (F) @ Baxcalibrite
Ability: Thermal Exchange
EVs: 18 HP / 32 Atk / 16 Spe
Adamant Nature
- Glaive Rush
- Icicle Crash
- Ice Shard
- Protect

Rillaboom (M) @ Assault Vest
Ability: Grassy Surge
EVs: 32 HP / 20 Atk / 14 SpD
Adamant Nature
- Fake Out
- Grassy Glide
- Wood Hammer
- U-turn

Incineroar (M) @ Sitrus Berry
Ability: Intimidate
EVs: 32 HP / 18 Def / 16 SpD
Careful Nature
- Fake Out
- Flare Blitz
- Parting Shot
- Knock Off`
};

const SAMPLE_META = {
  1: { title: '날씨 탈환 + 당신먼저 + 하드룸', subtitle: '파티 1 · 더블 배틀' },
  2: { title: '사이코필드 & 메가리자몽Y', subtitle: '파티 2 · 더블 배틀' },
  3: { title: '날따름 중심 스탠다드', subtitle: '파티 3 · 더블 배틀' },
  4: { title: '신규 Z-메가진화 엔트리', subtitle: '샘플 파티 · 더블 배틀' }
};

const TYPE_INFO = {
  Normal:   { ko: '노말',   ja: 'ノーマル',   en: 'Normal',   color: '#9099A1' },
  Fire:     { ko: '불꽃',   ja: 'ほのお',     en: 'Fire',     color: '#FF9C54' },
  Water:    { ko: '물',     ja: 'みず',       en: 'Water',    color: '#4D90D5' },
  Grass:    { ko: '풀',     ja: 'くさ',       en: 'Grass',    color: '#63BB5B' },
  Electric: { ko: '전기',   ja: 'でんき',     en: 'Electric', color: '#F3D23B' },
  Ice:      { ko: '얼음',   ja: 'こおり',     en: 'Ice',      color: '#74CEC0' },
  Fighting: { ko: '격투',   ja: 'かくとう',   en: 'Fighting', color: '#CE4069' },
  Poison:   { ko: '독',     ja: 'どく',       en: 'Poison',   color: '#AB6AC8' },
  Ground:   { ko: '땅',     ja: 'じめん',     en: 'Ground',   color: '#D97746' },
  Flying:   { ko: '비행',   ja: 'ひこう',     en: 'Flying',   color: '#8FA8DD' },
  Psychic:  { ko: '에스퍼', ja: 'エスパー',   en: 'Psychic',  color: '#F97176' },
  Bug:      { ko: '벌레',   ja: 'むし',       en: 'Bug',      color: '#90C12C' },
  Rock:     { ko: '바위',   ja: 'いわ',       en: 'Rock',     color: '#C7B78B' },
  Ghost:    { ko: '고스트', ja: 'ゴースト',   en: 'Ghost',    color: '#5269AC' },
  Dragon:   { ko: '드래곤', ja: 'ドラゴン',   en: 'Dragon',   color: '#0A6DC4' },
  Dark:     { ko: '악',     ja: 'あく',       en: 'Dark',     color: '#5A5366' },
  Steel:    { ko: '강철',   ja: 'はがね',     en: 'Steel',    color: '#5A8EA1' },
  Fairy:    { ko: '페어리', ja: 'フェアリー', en: 'Fairy',    color: '#EC8FE6' }
};

const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
const STAT_LABELS = {
  hp:  { ko: 'HP',     ja: 'HP',       short: 'H', en: 'HP' },
  atk: { ko: '공격',   ja: 'こうげき', short: 'A', en: 'Atk' },
  def: { ko: '방어',   ja: 'ぼうぎょ', short: 'B', en: 'Def' },
  spa: { ko: '특공',   ja: 'とくこう', short: 'C', en: 'SpA' },
  spd: { ko: '특방',   ja: 'とくぼう', short: 'D', en: 'SpD' },
  spe: { ko: '스피드', ja: 'すばやさ', short: 'S', en: 'Spe' }
};

const NATURES = {
  Adamant: { ko: '고집',       ja: 'いじっぱり', en: 'Adamant', plus: 'atk', minus: 'spa' },
  Brave:   { ko: '용감',       ja: 'ゆうかん',   en: 'Brave',   plus: 'atk', minus: 'spe' },
  Lonely:  { ko: '외로움',     ja: 'さみしがり', en: 'Lonely',  plus: 'atk', minus: 'def' },
  Naughty: { ko: '개구쟁이',   ja: 'やんちゃ',   en: 'Naughty', plus: 'atk', minus: 'spd' },
  Bold:    { ko: '대담',       ja: 'ずぶとい',   en: 'Bold',    plus: 'def', minus: 'atk' },
  Relaxed: { ko: '무사태평',   ja: 'のんき',     en: 'Relaxed', plus: 'def', minus: 'spe' },
  Impish:  { ko: '장난꾸러기', ja: 'わんぱく',   en: 'Impish',  plus: 'def', minus: 'spa' },
  Lax:     { ko: '촐랑',       ja: 'のうてんき', en: 'Lax',     plus: 'def', minus: 'spd' },
  Modest:  { ko: '조심',       ja: 'ひかえめ',   en: 'Modest',  plus: 'spa', minus: 'atk' },
  Quiet:   { ko: '냉정',       ja: 'れいせい',   en: 'Quiet',   plus: 'spa', minus: 'spe' },
  Mild:    { ko: '의젓',       ja: 'おっとり',   en: 'Mild',    plus: 'spa', minus: 'def' },
  Rash:    { ko: '덜렁',       ja: 'うっかりや', en: 'Rash',    plus: 'spa', minus: 'spd' },
  Calm:    { ko: '차분',       ja: 'おだやか',   en: 'Calm',    plus: 'spd', minus: 'atk' },
  Sassy:   { ko: '건방',       ja: 'なまいき',   en: 'Sassy',   plus: 'spd', minus: 'spe' },
  Careful: { ko: '신중',       ja: 'しんちょう', en: 'Careful', plus: 'spd', minus: 'spa' },
  Gentle:  { ko: '얌전',       ja: 'おとなしい', en: 'Gentle',  plus: 'spd', minus: 'def' },
  Timid:   { ko: '겁쟁이',     ja: 'おくびょう', en: 'Timid',   plus: 'spe', minus: 'atk' },
  Jolly:   { ko: '명랑',       ja: 'ようき',     en: 'Jolly',   plus: 'spe', minus: 'spa' },
  Hasty:   { ko: '성급',       ja: 'せっかち',   en: 'Hasty',   plus: 'spe', minus: 'def' },
  Naive:   { ko: '천진난만',   ja: 'むじゃき',   en: 'Naive',   plus: 'spe', minus: 'spd' },
  Hardy:   { ko: '노력',       ja: 'がんばりや', en: 'Hardy',   plus: null,  minus: null },
  Docile:  { ko: '온순',       ja: 'すなお',     en: 'Docile',  plus: null,  minus: null },
  Serious: { ko: '성실',       ja: 'まじめ',     en: 'Serious', plus: null,  minus: null },
  Bashful: { ko: '수줍음',     ja: 'てれや',     en: 'Bashful', plus: null,  minus: null },
  Quirky:  { ko: '변덕',       ja: 'きまぐれ',   en: 'Quirky',  plus: null,  minus: null }
};

const D = window.POKEMON_DATA || { dex: {}, moves: {}, items: {}, abilities: {} };
const LOOKUP = { dex: {}, items: {}, moves: {}, abilities: {}, natures: {} };

function toKey(s) {
  return String(s || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf♀♂]/g, '');
}
function toEnKey(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

(function buildLookups() {
  for (const [k, v] of Object.entries(D.dex)) {
    LOOKUP.dex[k] = k;
    LOOKUP.dex[toEnKey(v.name)] = k;
    LOOKUP.dex[toKey(v.ko)] = k;
    if (v.ja) LOOKUP.dex[toKey(v.ja)] = k;
    const baseKo = toKey(v.ko.replace(/\([^)]+\)/g, ''));
    if (!LOOKUP.dex[baseKo]) LOOKUP.dex[baseKo] = k;
    if (v.ja) {
      const baseJa = toKey(v.ja.replace(/\([^)]+\)/g, ''));
      if (!LOOKUP.dex[baseJa]) LOOKUP.dex[baseJa] = k;
    }
  }
  for (const [k, v] of Object.entries(D.items)) {
    LOOKUP.items[k] = k;
    LOOKUP.items[toEnKey(v.name)] = k;
    LOOKUP.items[toKey(v.ko)] = k;
    if (v.ja) LOOKUP.items[toKey(v.ja)] = k;
  }
  for (const [k, v] of Object.entries(D.moves)) {
    LOOKUP.moves[k] = k;
    LOOKUP.moves[toEnKey(v.name)] = k;
    LOOKUP.moves[toKey(v.ko)] = k;
    if (v.ja) LOOKUP.moves[toKey(v.ja)] = k;
  }
  for (const [k, v] of Object.entries(D.abilities)) {
    LOOKUP.abilities[k] = k;
    LOOKUP.abilities[toEnKey(v.name)] = k;
    LOOKUP.abilities[toKey(v.ko)] = k;
    if (v.ja) LOOKUP.abilities[toKey(v.ja)] = k;
  }
  for (const [k, v] of Object.entries(NATURES)) {
    LOOKUP.natures[toEnKey(k)] = k;
    LOOKUP.natures[toKey(v.ko)] = k;
    if (v.ja) LOOKUP.natures[toKey(v.ja)] = k;
  }
})();

function resolveMegaSpecies(spEntry, itemEntry) {
  if (!spEntry || !itemEntry || !itemEntry.mega) return null;
  const direct = itemEntry.mega[spEntry.name];
  if (direct && D.dex[toEnKey(direct)]) return D.dex[toEnKey(direct)];
  for (const [userSp, megaName] of Object.entries(itemEntry.mega)) {
    if (toEnKey(userSp) === spEntry.id || toEnKey(userSp).startsWith(spEntry.id)) {
      return D.dex[toEnKey(megaName)] || null;
    }
  }
  return null;
}

function findDedicatedMegaStones(spEntry) {
  if (!spEntry) return [];
  const targetId = spEntry.base || spEntry.id;
  const out = [];
  for (const it of Object.values(D.items)) {
    if (!it.mega) continue;
    for (const k of Object.keys(it.mega)) {
      const kId = toEnKey(k);
      if (kId === spEntry.id || kId === targetId || kId.startsWith(targetId)) {
        out.push(it);
        break;
      }
    }
  }
  return out;
}

function calcChampionsStats(baseStats, sp, natureName, speciesId) {
  const nat = NATURES[natureName] || NATURES.Serious;
  const res = {};
  for (const k of STAT_KEYS) {
    const base = baseStats ? (baseStats[k] || 80) : 80;
    const pts = Number(sp ? (sp[k] || 0) : 0);
    if (k === 'hp') {
      res.hp = speciesId === 'shedinja' ? 1 : (base + pts + 75);
    } else {
      const mult = nat.plus === k ? 1.1 : (nat.minus === k ? 0.9 : 1.0);
      res[k] = Math.floor((base + pts + 20) * mult);
    }
  }
  return res;
}

function parseShowdownPaste(rawText, defaultShowMega) {
  const blocks = String(rawText || '').trim().split(/\r?\n\s*\r?\n/).map(b => b.trim()).filter(Boolean);
  const party = [];
  let convertedFrom252 = false;

  for (let i = 0; i < Math.min(6, blocks.length); i++) {
    const lines = blocks[i].split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!lines.length) continue;

    const first = lines[0];
    const atPos = first.lastIndexOf('@');
    let left = atPos !== -1 ? first.slice(0, atPos).trim() : first.trim();
    const itemRaw = atPos !== -1 ? first.slice(atPos + 1).trim() : '';

    let gender = '';
    if (/\(\s*M\s*\)$/i.test(left)) { gender = 'M'; left = left.replace(/\s*\(\s*M\s*\)$/i, '').trim(); }
    else if (/\(\s*F\s*\)$/i.test(left)) { gender = 'F'; left = left.replace(/\s*\(\s*F\s*\)$/i, '').trim(); }

    let spRaw = left;
    const paren = left.match(/^(.+)\(([^)]+)\)$/);
    if (paren && (LOOKUP.dex[toEnKey(paren[2])] || LOOKUP.dex[toKey(paren[2])])) {
      spRaw = paren[2].trim();
    }

    const spId = LOOKUP.dex[toEnKey(spRaw)] || LOOKUP.dex[toKey(spRaw)];
    if (!spId || !D.dex[spId]) continue;

    const spEntry = D.dex[spId];
    const itemId = LOOKUP.items[toEnKey(itemRaw)] || LOOKUP.items[toKey(itemRaw)] || '';
    let abilityRaw = spEntry.ab ? (spEntry.ab[0] || '') : '';
    let nature = 'Serious';
    const sp = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
    const moves = [];

    for (let l = 1; l < lines.length; l++) {
      const line = lines[l];
      if (/^(Ability|특성)\s*:/i.test(line)) {
        abilityRaw = line.replace(/^(Ability|특성)\s*:\s*/i, '').trim();
      } else if (/^(EVs|SPs|노력치|능력포인트)\s*:/i.test(line)) {
        const parts = line.replace(/^(EVs|SPs|노력치|능력포인트)\s*:\s*/i, '').split('/');
        const mapU = { hp: 'hp', h: 'hp', '체력': 'hp', atk: 'atk', a: 'atk', '공격': 'atk', def: 'def', b: 'def', '방어': 'def', spa: 'spa', c: 'spa', '특공': 'spa', spd: 'spd', d: 'spd', '특방': 'spd', spe: 'spe', s: 'spe', '스피드': 'spe' };
        for (const p of parts) {
          const m = p.trim().match(/^(\d+)\s*(HP|Atk|Def|SpA|SpD|Spe|체력|공격|방어|특공|특방|스피드|H|A|B|C|D|S)$/i);
          if (m && mapU[m[2].toLowerCase()]) sp[mapU[m[2].toLowerCase()]] = parseInt(m[1], 10);
        }
      } else if (/Nature$/i.test(line) || /^성격\s*:/i.test(line)) {
        const nStr = line.replace(/Nature$/i, '').replace(/^성격\s*:\s*/i, '').trim();
        nature = LOOKUP.natures[toEnKey(nStr)] || LOOKUP.natures[toKey(nStr)] || 'Serious';
      } else if (/^[-*~•]\s*/.test(line)) {
        const mvRaw = line.replace(/^[-*~•]\s*/, '').trim();
        if (mvRaw && moves.length < 4) moves.push(LOOKUP.moves[toEnKey(mvRaw)] || LOOKUP.moves[toKey(mvRaw)] || mvRaw);
      }
    }

    const total = STAT_KEYS.reduce((a, k) => a + sp[k], 0);
    if (Math.max(...Object.values(sp)) > 32 || total > 66) {
      convertedFrom252 = true;
      for (const k of STAT_KEYS) {
        if (sp[k] > 0) sp[k] = Math.min(32, Math.max(1, Math.round((sp[k] + 4) / 8)));
      }
    }
    while (moves.length < 4) moves.push('');

    party.push({
      speciesId: spId,
      gender: gender || spEntry.gender || '',
      itemId,
      abilityId: LOOKUP.abilities[toEnKey(abilityRaw)] || LOOKUP.abilities[toKey(abilityRaw)] || abilityRaw,
      nature,
      sp,
      moves,
      showMega: defaultShowMega !== false
    });
  }

  return { party, convertedFrom252 };
}

function exportToShowdownPaste(party) {
  const lbl = { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' };
  return party.map(slot => {
    const sp = D.dex[slot.speciesId] || D.dex.pikachu;
    const it = D.items[slot.itemId];
    const ab = D.abilities[slot.abilityId];
    const gStr = slot.gender === 'M' ? ' (M)' : (slot.gender === 'F' ? ' (F)' : '');
    const iStr = it ? ` @ ${it.name}` : '';
    const out = [`${sp.name}${gStr}${iStr}`, `Ability: ${ab ? ab.name : slot.abilityId}`];
    const evs = STAT_KEYS.filter(k => slot.sp[k] > 0).map(k => `${slot.sp[k]} ${lbl[k]}`);
    if (evs.length) out.push(`EVs: ${evs.join(' / ')}`);
    out.push(`${slot.nature || 'Serious'} Nature`);
    slot.moves.filter(Boolean).forEach(m => out.push(`- ${D.moves[m] ? D.moves[m].name : m}`));
    return out.join('\n');
  }).join('\n\n');
}
