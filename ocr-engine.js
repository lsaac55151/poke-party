(function (root) {
  'use strict';

  const ENGINE_BASE_URL = (typeof document !== 'undefined' && document.currentScript && document.currentScript.src)
    ? new URL('./', document.currentScript.src).href
    : (typeof document !== 'undefined' && document.baseURI
      ? new URL('./', document.baseURI).href
      : './');

  // =========================================================================
  // 1. Korean Jamo Decomposition & Fuzzy Text Similarity
  // =========================================================================
  const CHOSEONG = [
    'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ',
    'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
  ];

  const JUNGSEONG = [
    'ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅘ',
    'ㅙ', 'ㅚ', 'ㅛ', 'ㅜ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅠ', 'ㅡ', 'ㅢ', 'ㅣ',
  ];

  const JONGSEONG = [
    '', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ',
    'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ',
    'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
  ];

  function normalizeForMatch(input) {
    return String(input || '')
      .normalize('NFKC')
      .trim()
      .toLowerCase()
      .replace(/[\s\-_.'’·・:：(),/!?°¶©–—]/g, '');
  }

  function decomposeHangul(input) {
    const clean = normalizeForMatch(input);
    let out = '';
    for (const ch of clean) {
      const code = ch.charCodeAt(0);
      if (code >= 0xac00 && code <= 0xd7a3) {
        const offset = code - 0xac00;
        const cho = Math.floor(offset / 588);
        const jung = Math.floor((offset % 588) / 28);
        const jong = offset % 28;
        out += CHOSEONG[cho] + JUNGSEONG[jung] + JONGSEONG[jong];
      } else {
        out += ch;
      }
    }
    return out;
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;

    const prev = new Array(b.length + 1);
    const curr = new Array(b.length + 1);
    for (let j = 0; j <= b.length; j++) prev[j] = j;

    for (let i = 1; i <= a.length; i++) {
      curr[0] = i;
      const ca = a[i - 1];
      for (let j = 1; j <= b.length; j++) {
        const cost = ca === b[j - 1] ? 0 : 1;
        curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      }
      for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
    }
    return prev[b.length];
  }

  function koreanSimilarity(a, b) {
    const na = normalizeForMatch(a);
    const nb = normalizeForMatch(b);
    if (!na || !nb) return 0;
    if (na === nb) return 1;

    const ja = decomposeHangul(na);
    const jb = decomposeHangul(nb);
    const maxJamo = Math.max(ja.length, jb.length);
    const jamoDist = levenshtein(ja, jb);
    const jamoSim = 1 - jamoDist / maxJamo;

    const maxSyl = Math.max(na.length, nb.length);
    const sylDist = levenshtein(na, nb);
    const sylSim = 1 - sylDist / maxSyl;

    return 0.75 * jamoSim + 0.25 * sylSim;
  }

  const SMALL_TO_LARGE_KANA = {
    'ぁ': 'あ', 'ぃ': 'い', 'ぅ': 'う', 'ぇ': 'え', 'ぉ': 'お',
    'っ': 'つ', 'ゃ': 'や', 'ゅ': 'ゆ', 'ょ': 'よ', 'ゎ': 'わ',
    'ヵ': 'か', 'ヶ': 'け',
  };

  function kataToHira(input) {
    let out = '';
    for (const ch of input) {
      const code = ch.charCodeAt(0);
      if (code >= 0x30a1 && code <= 0x30f6) {
        out += String.fromCharCode(code - 0x60);
      } else {
        out += ch;
      }
    }
    return out;
  }

  function foldJaSmallKana(input) {
    let out = '';
    for (const ch of input) {
      out += SMALL_TO_LARGE_KANA[ch] || ch;
    }
    return out;
  }

  function foldJaDakuten(input) {
    return input.normalize('NFD').replace(/[\u3099\u309a]/g, '').normalize('NFC');
  }

  function japaneseSimilarity(a, b) {
    const na = normalizeForMatch(a);
    const nb = normalizeForMatch(b);
    if (!na || !nb) return 0;
    if (na === nb) return 1;

    const ha = kataToHira(na);
    const hb = kataToHira(nb);
    if (ha === hb) return 0.992;

    // PP-OCRv5 mobile occasionally predicts small kana (ょ/っ/ぃ) at full size (よ/つ/い)
    const fa = foldJaSmallKana(ha);
    const fb = foldJaSmallKana(hb);
    if (fa === fb) return 0.985;

    const maxRaw = Math.max(ha.length, hb.length);
    const rawSim = 1 - levenshtein(ha, hb) / maxRaw;
    const maxFold = Math.max(fa.length, fb.length);
    const foldSim = 1 - levenshtein(fa, fb) / maxFold;
    const baseSim = 0.35 * rawSim + 0.65 * foldSim;

    // Low-res mobile JPEG crops frequently drop/swap dakuten or handakuten (オボン <-> オポン)
    const da = foldJaDakuten(fa);
    const db = foldJaDakuten(fb);
    if (!da || !db) return baseSim;
    if (da === db) return Math.max(baseSim, 0.975);
    const dakSim = 1 - levenshtein(da, db) / Math.max(da.length, db.length);
    return Math.max(baseSim, Math.min(0.97, 0.45 * baseSim + 0.55 * dakSim));
  }

  // =========================================================================
  // 2. Champions Lv.50 Stat Formulas & Cross-Validation Solver
  // =========================================================================
  const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
  const NON_HP_KEYS = ['atk', 'def', 'spa', 'spd', 'spe'];

  const STAT_LABELS_KO = {
    hp: 'HP',
    atk: '공격',
    def: '방어',
    spa: '특수공격',
    spd: '특수방어',
    spe: '스피드',
  };

  const STAT_SHORT_EN = {
    hp: 'HP',
    atk: 'Atk',
    def: 'Def',
    spa: 'SpA',
    spd: 'SpD',
    spe: 'Spe',
  };

  const STAT_LABELS_JA = {
    hp: 'HP',
    atk: 'こうげき',
    def: 'ぼうぎょ',
    spa: 'とくこう',
    spd: 'とくぼう',
    spe: 'すばやさ',
  };

  function resolveUiLang(optLang) {
    const raw = optLang || (typeof root !== 'undefined' && root.UI_LANG) || 'ko';
    const l = String(raw).toLowerCase();
    if (l.startsWith('ja') || l === 'jp') return 'ja';
    if (l.startsWith('en')) return 'en';
    return 'ko';
  }

  function getOcrStatLabel(key, lang) {
    if (lang === 'ja') return STAT_LABELS_JA[key] || key;
    if (lang === 'en') return STAT_SHORT_EN[key] || key;
    return STAT_LABELS_KO[key] || key;
  }

  function pickOcrEntryLabel(poolKey, entry, lang) {
    if (!entry) return '';
    if (lang === 'en') return entry.name || entry.ko || '';
    if (lang === 'ja') {
      if (entry.ja) return entry.ja;
      const ds = typeof root !== 'undefined' && root.POKEMON_CHAMPS_DATA && root.POKEMON_CHAMPS_DATA[poolKey];
      const item = ds && ds[entry.id];
      return (item && item.ja) || entry.name || entry.ko || '';
    }
    return entry.ko || entry.name || '';
  }

  function ocrText(key, vars = {}, optLang) {
    const lang = resolveUiLang(optLang);
    const table = {
      ko: {
        statMismatch: '{stat} 실수치 불일치 (인식: {obs}, 계산: {calc})',
        spAdjusted: '{stat} 포인트 보정됨 (인식: {obs} → {calc})',
        spExceeded: '능력 포인트 합계 초과 ({sum}/66)',
        spUnder: '능력 포인트 합계 {sum}/66 (66 미만)',
        statusMissing: '스테이터스 스크린샷 미인식 (능력치/성격 확인 필요)',
        speciesFail: '포켓몬 이름 인식 실패 ("{raw}")',
        speciesWarn: '포켓몬 이름 확인 필요 (OCR: "{raw}" → {name})',
        emptyWord: '공백',
        abilityFail: '특성 인식 실패 ("{raw}")',
        abilityWarn: '특성 확인 필요 (OCR: "{raw}" → {name})',
        itemFail: '도구 인식 실패 ("{raw}")',
        itemWarn: '도구 확인 필요 (OCR: "{raw}" → {name})',
        moveFail: '기술 {idx} 인식 실패 ("{raw}")',
        moveWarn: '기술 {idx} 확인 필요 (OCR: "{raw}" → {name})',
        abilityMissing: '능력 스크린샷 미인식 (특성/도구/기술 누락)',
        cannotVerifyNoSpecies: '포켓몬 미인식으로 능력치 검증 불가',
        fileProtocolErr: '로컬 파일(file://) 환경에서는 브라우저 보안 정책상 스샷 OCR을 실행할 수 없습니다. GitHub Pages 또는 로컬 웹 서버(http://localhost)에서 열어주세요.',
        dbLoadErr: '챔피언스 DB 로드 실패: HTTP {status}',
        workerLoadErr: 'OCR Worker 로드 오류',
        workerUninit: 'OCR Worker가 초기화되지 않았습니다.',
        imgLoadErr: '이미지를 불러올 수 없습니다.',
        cardsNotFound: '포켓몬 챔피언스 파티 카드([능력] 또는 [스테이터스] 화면)를 찾지 못했습니다.',
      },
      ja: {
        statMismatch: '{stat} 実数値の不一致 (認識: {obs}, 計算: {calc})',
        spAdjusted: '{stat} SPを補正しました (認識: {obs} → {calc})',
        spExceeded: 'SP合計が上限超過です ({sum}/66)',
        spUnder: 'SP合計 {sum}/66 (66未満)',
        statusMissing: 'ステータス画面が未認識です（実数値・性格を確認してください）',
        speciesFail: 'ポケモン名の認識に失敗 ("{raw}")',
        speciesWarn: 'ポケモン名の要確認 (OCR: "{raw}" → {name})',
        emptyWord: '空白',
        abilityFail: 'とくせいの認識に失敗 ("{raw}")',
        abilityWarn: 'とくせいの要確認 (OCR: "{raw}" → {name})',
        itemFail: 'もちものの認識に失敗 ("{raw}")',
        itemWarn: 'もちものの要確認 (OCR: "{raw}" → {name})',
        moveFail: 'わざ {idx} の認識に失敗 ("{raw}")',
        moveWarn: 'わざ {idx} の要確認 (OCR: "{raw}" → {name})',
        abilityMissing: '能力画面が未認識です（とくせい/もちもの/わざ欠落）',
        cannotVerifyNoSpecies: 'ポケモン未認識のため実数値を検証できません',
        fileProtocolErr: 'ローカルファイル(file://)環境ではセキュリティ制限によりOCRを実行できません。http://localhost またはGitHub Pagesで開いてください。',
        dbLoadErr: 'Champions DBの読み込みに失敗: HTTP {status}',
        workerLoadErr: 'OCR Worker 読み込みエラー',
        workerUninit: 'OCR Worker が初期化されていません。',
        imgLoadErr: '画像を読み込めませんでした。',
        cardsNotFound: 'ポケモンカード（能力またはステータス画面）が見つかりませんでした。',
      },
      en: {
        statMismatch: '{stat} stat mismatch (OCR: {obs}, calc: {calc})',
        spAdjusted: '{stat} SP adjusted (OCR: {obs} → {calc})',
        spExceeded: 'Total SP exceeds cap ({sum}/66)',
        spUnder: 'Total SP {sum}/66 (under 66)',
        statusMissing: 'Stats screenshot missing (check stats & nature)',
        speciesFail: 'Failed to recognize Pokémon ("{raw}")',
        speciesWarn: 'Check Pokémon name (OCR: "{raw}" → {name})',
        emptyWord: 'blank',
        abilityFail: 'Failed to recognize ability ("{raw}")',
        abilityWarn: 'Check ability (OCR: "{raw}" → {name})',
        itemFail: 'Failed to recognize item ("{raw}")',
        itemWarn: 'Check item (OCR: "{raw}" → {name})',
        moveFail: 'Failed to recognize Move {idx} ("{raw}")',
        moveWarn: 'Check Move {idx} (OCR: "{raw}" → {name})',
        abilityMissing: 'Ability/Moves screenshot missing',
        cannotVerifyNoSpecies: 'Cannot verify stats without Pokémon match',
        fileProtocolErr: 'Screenshot OCR cannot run over file:// due to browser security policies. Open via GitHub Pages or http://localhost.',
        dbLoadErr: 'Failed to load Champions DB: HTTP {status}',
        workerLoadErr: 'OCR Worker load error',
        workerUninit: 'OCR Worker is not initialized.',
        imgLoadErr: 'Failed to load image.',
        cardsNotFound: 'Could not detect Pokémon Champions party cards ([Ability] or [Stats] tab).',
      },
    };
    let msg = (table[lang] && table[lang][key]) || table.ko[key] || key;
    for (const [k, v] of Object.entries(vars)) {
      msg = msg.replaceAll(`{${k}}`, String(v));
    }
    return msg;
  }

  const NATURES = [
    { name: 'Hardy', ko: '노력', plus: null, minus: null },
    { name: 'Lonely', ko: '외로움', plus: 'atk', minus: 'def' },
    { name: 'Brave', ko: '용감', plus: 'atk', minus: 'spe' },
    { name: 'Adamant', ko: '고집', plus: 'atk', minus: 'spa' },
    { name: 'Naughty', ko: '개구쟁이', plus: 'atk', minus: 'spd' },
    { name: 'Bold', ko: '대담', plus: 'def', minus: 'atk' },
    { name: 'Docile', ko: '온순', plus: null, minus: null },
    { name: 'Relaxed', ko: '무사태평', plus: 'def', minus: 'spe' },
    { name: 'Impish', ko: '장난꾸러기', plus: 'def', minus: 'spa' },
    { name: 'Lax', ko: '촐랑', plus: 'def', minus: 'spd' },
    { name: 'Timid', ko: '겁쟁이', plus: 'spe', minus: 'atk' },
    { name: 'Hasty', ko: '성급', plus: 'spe', minus: 'def' },
    { name: 'Serious', ko: '성실', plus: null, minus: null },
    { name: 'Jolly', ko: '명랑', plus: 'spe', minus: 'spa' },
    { name: 'Naive', ko: '천진난만', plus: 'spe', minus: 'spd' },
    { name: 'Modest', ko: '조심', plus: 'spa', minus: 'atk' },
    { name: 'Mild', ko: '의젓', plus: 'spa', minus: 'def' },
    { name: 'Quiet', ko: '냉정', plus: 'spa', minus: 'spe' },
    { name: 'Bashful', ko: '수줍음', plus: null, minus: null },
    { name: 'Rash', ko: '덜렁', plus: 'spa', minus: 'spd' },
    { name: 'Calm', ko: '차분', plus: 'spd', minus: 'atk' },
    { name: 'Gentle', ko: '얌전', plus: 'spd', minus: 'def' },
    { name: 'Sassy', ko: '건방', plus: 'spd', minus: 'spe' },
    { name: 'Careful', ko: '신중', plus: 'spd', minus: 'spa' },
    { name: 'Quirky', ko: '변덕', plus: null, minus: null },
  ];

  const DEFAULT_NEUTRAL_NATURE = 'Serious';

  function getNatureByName(name) {
    const low = String(name || '').toLowerCase();
    return NATURES.find((n) => n.name.toLowerCase() === low) || NATURES[12];
  }

  function findNatureByArrows(plus, minus) {
    if (!plus || !minus || plus === minus) {
      return NATURES.find((n) => n.name === DEFAULT_NEUTRAL_NATURE);
    }
    return (
      NATURES.find((n) => n.plus === plus && n.minus === minus) ||
      NATURES.find((n) => n.name === DEFAULT_NEUTRAL_NATURE)
    );
  }

  function calcChampionsStat(stat, base, sp, natureMult = 100) {
    if (stat === 'hp') {
      if (base === 1) return 1;
      return base + sp + 75;
    }
    const inner = base + sp + 20;
    if (natureMult === 100) return inner;
    return Math.trunc(Math.trunc(inner * natureMult) / 100);
  }

  function calcAllChampionsStats(baseStats, spStats, natureName) {
    const nat = getNatureByName(natureName);
    const out = {};
    for (const key of STAT_KEYS) {
      const mult = key === nat.plus ? 110 : key === nat.minus ? 90 : 100;
      out[key] = calcChampionsStat(key, baseStats[key], spStats[key], mult);
    }
    return out;
  }

  function spToTraditionalEv(sp) {
    const clamped = Math.max(0, Math.min(32, Math.round(sp)));
    return clamped === 0 ? 0 : 4 + 8 * (clamped - 1);
  }

  function solveChampionsStats(baseStats, rawObs = {}, spObs = {}, arrows = {}, uiLang) {
    const lang = resolveUiLang(uiLang);
    const warnings = [];
    let arrowPlus = null;
    let arrowMinus = null;
    for (const k of NON_HP_KEYS) {
      if (arrows[k] === '+') arrowPlus = k;
      if (arrows[k] === '-') arrowMinus = k;
    }

    const arrowCandidates = [{ plus: null, minus: null }];
    for (const p of NON_HP_KEYS) {
      for (const m of NON_HP_KEYS) {
        if (p !== m) arrowCandidates.push({ plus: p, minus: m });
      }
    }

    let bestScore = -Infinity;
    let bestSp = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
    let bestNature = DEFAULT_NEUTRAL_NATURE;

    for (const cand of arrowCandidates) {
      let score = 0;
      if (cand.plus === arrowPlus) score += 20;
      else if (arrowPlus !== null && cand.plus !== arrowPlus) score -= 12;
      if (cand.minus === arrowMinus) score += 20;
      else if (arrowMinus !== null && cand.minus !== arrowMinus) score -= 12;

      const spSolved = {};
      let sumSp = 0;

      for (const key of STAT_KEYS) {
        const mult = key === cand.plus ? 110 : key === cand.minus ? 90 : 100;
        const obsRaw = rawObs[key];
        const obsSp = spObs[key];

        let statBestScore = -Infinity;
        let statBestSp = typeof obsSp === 'number' ? Math.max(0, Math.min(32, obsSp)) : 0;

        for (let sp = 0; sp <= 32; sp++) {
          const calc = calcChampionsStat(key, baseStats[key], sp, mult);
          let s = 0;
          if (typeof obsRaw === 'number') {
            if (calc === obsRaw) s += 15;
            else if (Math.abs(calc - obsRaw) <= 2) s -= 4;
            else s -= 25;
          }
          if (typeof obsSp === 'number') {
            if (sp === obsSp) s += 12;
            else if (Math.abs(sp - obsSp) <= 1) s -= 3;
            else s -= 15;
          }
          if (s > statBestScore) {
            statBestScore = s;
            statBestSp = sp;
          }
        }

        spSolved[key] = statBestSp;
        sumSp += statBestSp;
        score += statBestScore;
      }

      if (sumSp > 66) score -= 40 + (sumSp - 66);
      else if (sumSp === 66) score += 4;

      if (score > bestScore) {
        bestScore = score;
        bestSp = spSolved;
        bestNature = findNatureByArrows(cand.plus, cand.minus).name;
      }
    }

    const expectedRaw = calcAllChampionsStats(baseStats, bestSp, bestNature);
    const sumSp = STAT_KEYS.reduce((acc, k) => acc + bestSp[k], 0);

    let exactAll = true;
    for (const key of STAT_KEYS) {
      if (typeof rawObs[key] === 'number' && rawObs[key] !== expectedRaw[key]) {
        exactAll = false;
        warnings.push(ocrText('statMismatch', { stat: getOcrStatLabel(key, lang), obs: rawObs[key], calc: expectedRaw[key] }, lang));
      }
      if (typeof spObs[key] === 'number' && spObs[key] !== bestSp[key]) {
        exactAll = false;
        warnings.push(ocrText('spAdjusted', { stat: getOcrStatLabel(key, lang), obs: spObs[key], calc: bestSp[key] }, lang));
      }
    }

    if (sumSp > 66) {
      exactAll = false;
      warnings.push(ocrText('spExceeded', { sum: sumSp }, lang));
    } else if (sumSp > 0 && sumSp < 66) {
      warnings.push(ocrText('spUnder', { sum: sumSp }, lang));
    }

    const hasAnyStatus =
      Object.values(rawObs).some((v) => typeof v === 'number') ||
      Object.values(spObs).some((v) => typeof v === 'number');
    if (!hasAnyStatus) {
      exactAll = false;
      warnings.push(ocrText('statusMissing', {}, lang));
    }

    return {
      sp: bestSp,
      nature: bestNature,
      expectedRaw,
      warnings,
      verified: hasAnyStatus && exactAll && sumSp <= 66,
    };
  }

  // =========================================================================
  // 3. Entity Matcher (Species w/ Form Disambiguation, Abilities, Items, Moves)
  // =========================================================================
  const TYPE_RGB_CENTROIDS = {
    Normal: [153, 147, 175],
    Fire: [173, 53, 62],
    Water: [60, 122, 217],
    Electric: [215, 180, 55],
    Grass: [104, 142, 105],
    Ice: [116, 191, 227],
    Fighting: [221, 135, 88],
    Poison: [126, 83, 183],
    Ground: [125, 87, 112],
    Flying: [130, 165, 209],
    Psychic: [192, 84, 136],
    Bug: [135, 168, 52],
    Rock: [159, 148, 162],
    Ghost: [95, 75, 145],
    Dragon: [92, 97, 195],
    Dark: [79, 65, 76],
    Steel: [107, 141, 175],
    Fairy: [208, 125, 182],
  };

  function rgbDist(a, b) {
    const dr = a[0] - b[0];
    const dg = a[1] - b[1];
    const db = a[2] - b[2];
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  function typeColorScore(observed, candidateTypes) {
    if (!observed || !observed.length || !candidateTypes || !candidateTypes.length) return 0;
    let total = 0;
    const count = Math.min(observed.length, candidateTypes.length);
    for (let i = 0; i < count; i++) {
      const centroid = TYPE_RGB_CENTROIDS[candidateTypes[i]];
      if (!centroid) continue;
      const dist = rgbDist(observed[i], centroid);
      if (dist < 40) total += 10;
      else if (dist < 75) total += 4;
      else if (dist > 130) total -= 6;
    }
    if (observed.length !== candidateTypes.length) {
      total -= 5;
    }
    return total;
  }

  function statFitScore(sp, rawStats, spStats, arrows) {
    if (!rawStats) return 0;
    const hasRaw = Object.values(rawStats).some((v) => typeof v === 'number');
    if (!hasRaw) return 0;

    let matches = 0;
    let checked = 0;
    for (const key of STAT_KEYS) {
      const obs = rawStats[key];
      const spVal = spStats && spStats[key];
      if (typeof obs !== 'number' || typeof spVal !== 'number') continue;
      checked++;
      const mult =
        key !== 'hp' && arrows && arrows[key] === '+'
          ? 110
          : key !== 'hp' && arrows && arrows[key] === '-'
            ? 90
            : 100;
      const calc = calcChampionsStat(key, sp.baseStats[key], spVal, mult);
      if (calc === obs) matches++;
      else if (Math.abs(calc - obs) <= 1) matches += 0.3;
    }
    if (checked === 0) return 0;
    return (matches / checked) * 24;
  }

  function bestTextSimilarity(ocr, entry) {
    if (!ocr || !entry) return 0;
    const koSim = koreanSimilarity(ocr, entry.ko);
    const enSim = koreanSimilarity(ocr, entry.name);
    const jaSim = entry.ja ? japaneseSimilarity(ocr, entry.ja) : 0;
    return Math.max(koSim, enSim, jaSim);
  }

  function matchNamedEntry(
    ocrText,
    pool,
    preferredIds,
    preferredBoost = 0.16,
    minThreshold = 0.48,
  ) {
    const cleaned = normalizeForMatch(ocrText);
    if (!cleaned) return { entry: null, score: 0 };

    let best = null;
    let bestScore = -1;
    let bestRawSim = 0;

    for (const entry of Object.values(pool)) {
      const rawSim = bestTextSimilarity(ocrText, entry);
      if (rawSim < 0.35) continue;

      let score = rawSim;
      if (entry.champions) score += 0.04;
      if (preferredIds && preferredIds.has(entry.id)) score += preferredBoost;

      if (score > bestScore) {
        bestScore = score;
        bestRawSim = rawSim;
        best = entry;
      }
    }

    if (!best || bestRawSim < minThreshold) {
      return { entry: null, score: bestRawSim };
    }
    return { entry: best, score: Math.min(1, bestRawSim) };
  }

  function matchSpecies(ocrText, db, ctx = {}) {
    const cleaned = normalizeForMatch(ocrText);
    if (!cleaned) return { entry: null, score: 0 };

    const allSpecies = Object.values(db.species);
    const scored = [];

    for (const sp of allSpecies) {
      let baseJaSim = 0;
      if (sp.baseSpecies) {
        const baseId = sp.baseSpecies.toLowerCase().replace(/[^a-z0-9]/g, '');
        const baseSp = db.species[baseId];
        if (baseSp && baseSp.ja) {
          // Japanese games display regional/form cards by base species name; keep slightly below 1.0 for tie-breaking
          baseJaSim = japaneseSimilarity(ocrText, baseSp.ja) * 0.999;
        }
      }
      const nameSim = Math.max(bestTextSimilarity(ocrText, sp), baseJaSim);
      if (nameSim >= 0.5) {
        scored.push({ entry: sp, nameSim });
      }
    }

    if (scored.length === 0) return { entry: null, score: 0 };

    scored.sort((a, b) => b.nameSim - a.nameSim);
    const topNameSim = scored[0].nameSim;
    const candidates = scored.filter((c) => c.nameSim >= topNameSim - 0.08);

    const roughAbil = ctx.abilityOcr
      ? (matchNamedEntry(ctx.abilityOcr, db.abilities).entry || {}).id
      : undefined;
    const roughMoves = (ctx.movesOcr || [])
      .map((m) => (m ? (matchNamedEntry(m, db.moves).entry || {}).id : undefined))
      .filter(Boolean);

    let winner = candidates[0];
    let bestTotal = -Infinity;

    for (const cand of candidates) {
      const sp = cand.entry;
      let total = cand.nameSim * 100;

      if (sp.champions) total += 8;

      if (ctx.gender === 'F') {
        if (sp.gender === 'F') total += 25;
        else if (sp.gender === 'M' || sp.gender === 'N') total -= 35;
      } else if (ctx.gender === 'M') {
        if (sp.gender === 'M') total += 25;
        else if (sp.gender === 'F' || sp.gender === 'N') total -= 35;
      }

      total += typeColorScore(ctx.typeColors || [], sp.types);

      if (roughAbil && sp.abilities.includes(roughAbil)) {
        total += 18;
      }

      if (sp.learnset.length > 0 && roughMoves.length > 0) {
        const lset = new Set(sp.learnset);
        let hits = 0;
        for (const mvId of roughMoves) {
          if (lset.has(mvId)) hits++;
        }
        total += hits * 6;
      }

      total += statFitScore(sp, ctx.rawStats, ctx.spStats, ctx.arrows);

      if (!sp.forme) total += 0.5;

      if (total > bestTotal) {
        bestTotal = total;
        winner = cand;
      }
    }

    return { entry: winner.entry, score: winner.nameSim };
  }

  function matchAbility(ocrText, db, species) {
    const pref = species && species.abilities.length ? new Set(species.abilities) : undefined;
    return matchNamedEntry(ocrText, db.abilities, pref, 0.18, 0.45);
  }

  function matchItem(ocrText, db) {
    return matchNamedEntry(ocrText, db.items, undefined, 0, 0.48);
  }

  function matchMove(ocrText, db, species) {
    const pref = species && species.learnset.length ? new Set(species.learnset) : undefined;
    return matchNamedEntry(ocrText, db.moves, pref, 0.16, 0.45);
  }

  // =========================================================================
  // 4. Screenshot Card Detector, Metadata Extractor & Bicubic Cropper
  // =========================================================================
  function median(nums) {
    if (!nums.length) return 0;
    const sorted = [...nums].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }

  function detectCards(imgData) {
    const { width: W, height: H, data } = imgData;
    const ds = Math.max(2, Math.round(W / 320));
    const dw = Math.floor(W / ds);
    const dh = Math.floor(H / ds);
    const mask = new Uint8Array(dw * dh);

    for (let y = 0; y < dh; y++) {
      const sy = y * ds;
      for (let x = 0; x < dw; x++) {
        const sx = x * ds;
        const p = (sy * W + sx) * 4;
        const r = data[p];
        const b = data[p + 2];
        if (b - r > 22 && b > 128 && r < 178) {
          mask[y * dw + x] = 1;
        }
      }
    }

    const closed = new Uint8Array(dw * dh);
    for (let y = 0; y < dh; y++) {
      for (let x = 0; x < dw; x++) {
        let hit = mask[y * dw + x];
        if (!hit) {
          const left = x > 0 && mask[y * dw + x - 1];
          const right = x + 1 < dw && mask[y * dw + x + 1];
          const up = y > 0 && mask[(y - 1) * dw + x];
          const down = y + 1 < dh && mask[(y + 1) * dw + x];
          if ((left && right) || (up && down)) hit = 1;
        }
        closed[y * dw + x] = hit;
      }
    }

    const visited = new Uint8Array(dw * dh);
    const blobs = [];
    const queue = new Int32Array(dw * dh);

    for (let i = 0; i < dw * dh; i++) {
      if (!closed[i] || visited[i]) continue;
      let head = 0;
      let tail = 0;
      queue[tail++] = i;
      visited[i] = 1;
      let minX = dw;
      let maxX = 0;
      let minY = dh;
      let maxY = 0;
      let area = 0;

      while (head < tail) {
        const idx = queue[head++];
        const cx = idx % dw;
        const cy = Math.floor(idx / dw);
        area++;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        const neighbors = [
          cx > 0 ? idx - 1 : -1,
          cx + 1 < dw ? idx + 1 : -1,
          cy > 0 ? idx - dw : -1,
          cy + 1 < dh ? idx + dw : -1,
        ];
        for (const n of neighbors) {
          if (n >= 0 && closed[n] && !visited[n]) {
            visited[n] = 1;
            queue[tail++] = n;
          }
        }
      }

      const x = minX * ds;
      const y = minY * ds;
      const w = (maxX - minX + 1) * ds;
      const h = (maxY - minY + 1) * ds;
      const ar = w / Math.max(1, h);
      if (ar >= 3.0 && ar <= 5.0 && w > W * 0.16 && area * ds * ds > W * H * 0.01) {
        blobs.push({ x, y, w, h, area: area * ds * ds });
      }
    }

    if (blobs.length === 0) {
      const fw = Math.round(W * (398 / 1024));
      const fh = Math.round(H * (101 / 576));
      const xCols = [Math.round(W * (100 / 1024)), Math.round(W * (527 / 1024))];
      const yRows = [
        Math.round(H * (156 / 576)),
        Math.round(H * (272 / 576)),
        Math.round(H * (389 / 576)),
      ];
      const fallback = [];
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 2; c++) {
          fallback.push({ slot: r * 2 + c, x: xCols[c], y: yRows[r], w: fw, h: fh });
        }
      }
      return fallback;
    }

    const medW = Math.round(median(blobs.map((b) => b.w)));
    const rawMedH = Math.round(median(blobs.map((b) => b.h)));
    const medH =
      rawMedH >= medW / 4.4 && rawMedH <= medW / 3.4 ? rawMedH : Math.round(medW / 3.94);

    const minBlobX = Math.min(...blobs.map((b) => b.x));
    const maxBlobX2 = Math.max(...blobs.map((b) => b.x + b.w));
    const midX = (minBlobX + maxBlobX2) / 2;
    const left = blobs.filter((b) => b.x + b.w / 2 < midX).sort((a, b) => (a.y + a.h) - (b.y + b.h));
    const right = blobs.filter((b) => b.x + b.w / 2 >= midX).sort((a, b) => (a.y + a.h) - (b.y + b.h));

    const cards = [];
    const rowCount = Math.max(left.length, right.length, Math.min(3, Math.ceil(blobs.length / 2)));

    for (let r = 0; r < rowCount && r < 3; r++) {
      const rowItems = [];
      if (r < left.length) rowItems.push(left[r]);
      if (r < right.length) rowItems.push(right[r]);
      if (!rowItems.length) continue;

      const rowBottom = Math.round(median(rowItems.map((b) => b.y + b.h)));
      const rowY0 = Math.max(0, rowBottom - medH);

      if (r < left.length) {
        const x1 = left[r].x + left[r].w;
        cards.push({
          slot: r * 2,
          x: Math.max(0, x1 - medW),
          y: rowY0,
          w: medW,
          h: medH,
        });
      }
      if (r < right.length) {
        const x1 = right[r].x + right[r].w;
        cards.push({
          slot: r * 2 + 1,
          x: Math.max(0, x1 - medW),
          y: rowY0,
          w: medW,
          h: medH,
        });
      }
    }

    return cards.sort((a, b) => a.slot - b.slot);
  }

  function detectTabType(imgData, cards) {
    const { width: W, height: H, data } = imgData;
    const topY = cards.length > 0 ? Math.max(0, cards[0].y - Math.round(cards[0].h * 0.65)) : Math.round(H * 0.16);
    const botY = cards.length > 0 ? Math.max(topY + 4, cards[0].y - 4) : Math.round(H * 0.25);

    const gridLeft = cards.length >= 2 ? Math.min(...cards.map((c) => c.x)) : Math.round(W * 0.15);
    const gridRight =
      cards.length >= 2 ? Math.max(...cards.map((c) => c.x + c.w)) : Math.round(W * 0.85);
    const gridCenterX = (gridLeft + gridRight) / 2;

    let greenSumX = 0;
    let greenCount = 0;
    for (let y = topY; y < botY; y++) {
      for (let x = Math.max(0, gridLeft); x < Math.min(W, gridRight); x++) {
        const p = (y * W + x) * 4;
        const r = data[p];
        const g = data[p + 1];
        const b = data[p + 2];
        if (g - b > 75 && g > 150 && r > 120) {
          greenSumX += x;
          greenCount++;
        }
      }
    }

    if (greenCount > 40) {
      const meanX = greenSumX / greenCount;
      return meanX < gridCenterX ? 'ability' : 'status';
    }

    if (cards.length > 0) {
      const c = cards[0];
      let barPixels = 0;
      for (const [nx0, nx1, ny0, ny1] of [
        [0.36, 0.43, 0.34, 0.40],
        [0.36, 0.43, 0.58, 0.64],
        [0.84, 0.90, 0.34, 0.40],
      ]) {
        const x0 = c.x + Math.round(c.w * nx0);
        const x1 = c.x + Math.round(c.w * nx1);
        const y0 = c.y + Math.round(c.h * ny0);
        const y1 = c.y + Math.round(c.h * ny1);
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            const p = (y * W + x) * 4;
            const r = data[p];
            const g = data[p + 1];
            const b = data[p + 2];
            if ((r > 175 && b < 85) || (r < 75 && g < 85 && b < 115)) {
              barPixels++;
            }
          }
        }
      }
      return barPixels > 12 ? 'status' : 'ability';
    }

    return 'ability';
  }

  function sampleRegionBox(card, nx0, ny0, nx1, ny1) {
    const x0 = Math.max(0, Math.round(card.x + card.w * nx0));
    const y0 = Math.max(0, Math.round(card.y + card.h * ny0));
    const x1 = Math.max(x0 + 1, Math.round(card.x + card.w * nx1));
    const y1 = Math.max(y0 + 1, Math.round(card.y + card.h * ny1));
    return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
  }

  function detectGender(imgData, card) {
    const { width: W, data } = imgData;
    const box = sampleRegionBox(card, 0.415, 0.03, 0.460, 0.22);
    let redCnt = 0;
    let blueCnt = 0;
    for (let y = box.y0; y < box.y1; y++) {
      for (let x = box.x0; x < box.x1; x++) {
        const p = (y * W + x) * 4;
        const r = data[p];
        const b = data[p + 2];
        if (r - b > 80 && r > 140) redCnt++;
        if (b - r > 80 && b > 140) blueCnt++;
      }
    }
    const minPx = Math.max(8, Math.round(box.w * box.h * 0.12));
    if (redCnt >= minPx && redCnt > blueCnt * 1.5) return 'F';
    if (blueCnt >= minPx && blueCnt > redCnt * 1.5) return 'M';
    return null;
  }

  function detectTypeColors(imgData, card) {
    const { width: W, data } = imgData;
    const slots = [
      [0.465, 0.05, 0.505, 0.20],
      [0.513, 0.05, 0.553, 0.20],
    ];
    const out = [];
    for (const [nx0, ny0, nx1, ny1] of slots) {
      const box = sampleRegionBox(card, nx0, ny0, nx1, ny1);
      const rs = [];
      const gs = [];
      const bs = [];
      let isCardBg = 0;
      let total = 0;

      for (let y = box.y0; y < box.y1; y++) {
        for (let x = box.x0; x < box.x1; x++) {
          const p = (y * W + x) * 4;
          const r = data[p];
          const g = data[p + 1];
          const b = data[p + 2];
          total++;
          const maxC = Math.max(r, g, b);
          const minC = Math.min(r, g, b);
          const sat = maxC === 0 ? 0 : ((maxC - minC) / maxC) * 255;
          if (maxC > 205 && sat < 65) continue;
          if (Math.abs(r - 110) < 25 && Math.abs(g - 102) < 25 && Math.abs(b - 182) < 28) {
            isCardBg++;
          }
          rs.push(r);
          gs.push(g);
          bs.push(b);
        }
      }
      if (rs.length > 0 && isCardBg / Math.max(1, total) < 0.72) {
        out.push([
          Math.round(median(rs)),
          Math.round(median(gs)),
          Math.round(median(bs)),
        ]);
      }
    }
    return out;
  }

  function detectNatureArrows(imgData, card) {
    const { width: W, data } = imgData;
    const arrowBoxes = {
      atk: [0.165, 0.52, 0.235, 0.72],
      def: [0.165, 0.76, 0.235, 0.96],
      spa: [0.715, 0.28, 0.765, 0.48],
      spd: [0.715, 0.52, 0.765, 0.72],
      spe: [0.680, 0.76, 0.745, 0.96],
    };
    const arrows = {};
    for (const [stat, [nx0, ny0, nx1, ny1]] of Object.entries(arrowBoxes)) {
      const box = sampleRegionBox(card, nx0, ny0, nx1, ny1);
      let pink = 0;
      let teal = 0;
      for (let y = box.y0; y < box.y1; y++) {
        for (let x = box.x0; x < box.x1; x++) {
          const p = (y * W + x) * 4;
          const r = data[p];
          const g = data[p + 1];
          const b = data[p + 2];
          if (r - g > 30 && r > 175) pink++;
          if (g - r > 30 && g > 165 && b > 165) teal++;
        }
      }
      const minPx = Math.max(4, Math.round(box.w * box.h * 0.012));
      if (pink >= minPx && pink > teal) arrows[stat] = '+';
      else if (teal >= minPx && teal > pink) arrows[stat] = '-';
    }
    return arrows;
  }

  function rgbToHsvSatVal(r, g, b) {
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const sat = maxC === 0 ? 0 : ((maxC - minC) / maxC) * 255;
    return [sat, maxC];
  }

  function cubicWeight(t) {
    const a = -0.5;
    const absT = Math.abs(t);
    if (absT <= 1) return (a + 2) * absT * absT * absT - (a + 3) * absT * absT + 1;
    if (absT < 2) return a * absT * absT * absT - 5 * a * absT * absT + 8 * a * absT - 4 * a;
    return 0;
  }

  function buildCropTensor(imgData, card, nx0, ny0, nx1, ny1, trimWhiteText) {
    const { width: W, height: H, data } = imgData;
    const box = sampleRegionBox(card, nx0, ny0, nx1, ny1);

    let trimX0 = box.x0;
    let trimX1 = box.x1;

    if (trimWhiteText && box.h > 8) {
      const midY0 = box.y0 + Math.max(2, Math.floor(box.h * 0.18));
      const midY1 = box.y1 - Math.max(2, Math.floor(box.h * 0.18));
      const activeCols = [];

      for (let x = box.x0; x < box.x1; x++) {
        let hasWhite = false;
        for (let y = midY0; y < midY1; y++) {
          const p = (y * W + x) * 4;
          const [sat, val] = rgbToHsvSatVal(data[p], data[p + 1], data[p + 2]);
          if (val > 198 && sat < 70) {
            hasWhite = true;
            break;
          }
        }
        if (hasWhite) activeCols.push(x);
      }

      if (activeCols.length > 0) {
        const gapMax = Math.max(10, Math.round(card.w * 0.036));
        const segStart = activeCols[0];
        let segEnd = activeCols[0];
        for (let i = 1; i < activeCols.length; i++) {
          if (activeCols[i] - segEnd <= gapMax) {
            segEnd = activeCols[i];
          } else {
            break;
          }
        }
        const padH = Math.max(3, Math.round(card.w * 0.01));
        trimX0 = Math.max(box.x0, segStart - padH);
        trimX1 = Math.min(box.x1, segEnd + padH + 1);
      }
    }

    const cropW = Math.max(2, trimX1 - trimX0);
    const cropH = Math.max(2, box.h);

    const rs = [];
    const gs = [];
    const bs = [];
    for (const sy of [box.y0, Math.max(box.y0, box.y1 - 1)]) {
      for (let x = trimX0; x < trimX1; x += Math.max(1, Math.floor(cropW / 12))) {
        const p = (sy * W + x) * 4;
        rs.push(data[p]);
        gs.push(data[p + 1]);
        bs.push(data[p + 2]);
      }
    }
    const bgR = Math.round(median(rs));
    const bgG = Math.round(median(gs));
    const bgB = Math.round(median(bs));

    const padX = Math.max(4, Math.round(cropH * 0.25));
    const padY = Math.max(2, Math.round(cropH * 0.13));
    const paddedW = cropW + padX * 2;
    const paddedH = cropH + padY * 2;

    const targetH = 48;
    const targetW = Math.max(8, Math.round((paddedW * targetH) / paddedH));
    const planeSize = targetW * targetH;
    const tensor = new Float32Array(3 * planeSize);

    const samplePadded = (px, py, ch) => {
      const cx = px - padX;
      const cy = py - padY;
      if (cx < 0 || cx >= cropW || cy < 0 || cy >= cropH) {
        return ch === 0 ? bgR : ch === 1 ? bgG : bgB;
      }
      const sx = Math.min(W - 1, Math.max(0, trimX0 + cx));
      const sy = Math.min(H - 1, Math.max(0, box.y0 + cy));
      return data[(sy * W + sx) * 4 + ch];
    };

    for (let ty = 0; ty < targetH; ty++) {
      const fy = ((ty + 0.5) * paddedH) / targetH - 0.5;
      const iy = Math.floor(fy);
      const wy = [
        cubicWeight(fy - (iy - 1)),
        cubicWeight(fy - iy),
        cubicWeight(fy - (iy + 1)),
        cubicWeight(fy - (iy + 2)),
      ];

      for (let tx = 0; tx < targetW; tx++) {
        const fx = ((tx + 0.5) * paddedW) / targetW - 0.5;
        const ix = Math.floor(fx);
        const wx = [
          cubicWeight(fx - (ix - 1)),
          cubicWeight(fx - ix),
          cubicWeight(fx - (ix + 1)),
          cubicWeight(fx - (ix + 2)),
        ];

        let r = 0;
        let g = 0;
        let b = 0;
        for (let j = 0; j < 4; j++) {
          const wj = wy[j];
          const py = iy - 1 + j;
          for (let i = 0; i < 4; i++) {
            const w = wj * wx[i];
            const px = ix - 1 + i;
            r += samplePadded(px, py, 0) * w;
            g += samplePadded(px, py, 1) * w;
            b += samplePadded(px, py, 2) * w;
          }
        }

        const idx = ty * targetW + tx;
        const clamp = (v) => Math.max(0, Math.min(255, v));
        tensor[idx] = (clamp(b) / 255 - 0.5) / 0.5;
        tensor[planeSize + idx] = (clamp(g) / 255 - 0.5) / 0.5;
        tensor[planeSize * 2 + idx] = (clamp(r) / 255 - 0.5) / 0.5;
      }
    }

    return { tensor, width: targetW, height: targetH };
  }

  function hasCardHeaderText(imgData, card) {
    const { width: W, data } = imgData;
    const box = sampleRegionBox(card, 0.10, 0.04, 0.38, 0.22);
    let whiteCount = 0;
    for (let y = box.y0; y < box.y1; y++) {
      for (let x = box.x0; x < box.x1; x++) {
        const p = (y * W + x) * 4;
        const [sat, val] = rgbToHsvSatVal(data[p], data[p + 1], data[p + 2]);
        if (val > 195 && sat < 70) whiteCount++;
      }
    }
    return whiteCount >= Math.max(8, Math.round(box.w * box.h * 0.015));
  }

  function analyzeImageData(imgData, overrideTab) {
    const detectedCards = detectCards(imgData).filter((c) => hasCardHeaderText(imgData, c));
    const tabType = overrideTab || detectTabType(imgData, detectedCards);

    const crops = [];
    const cardMetadata = [];

    for (const card of detectedCards) {
      const s = card.slot;
      const gender = detectGender(imgData, card);
      const typeColors = detectTypeColors(imgData, card);
      const arrows = tabType === 'status' ? detectNatureArrows(imgData, card) : {};

      cardMetadata.push({ slot: s, gender, typeColors, arrows });

      const pushCrop = (fieldId, nx0, ny0, nx1, ny1, digitsOnly, trimWhite) => {
        const built = buildCropTensor(imgData, card, nx0, ny0, nx1, ny1, trimWhite);
        crops.push({
          id: `${s}:${fieldId}`,
          digitsOnly,
          ...built,
        });
      };

      pushCrop('species', 0.102, 0.02, 0.412, 0.245, false, true);

      if (tabType === 'ability') {
        pushCrop('ability', 0.102, 0.275, 0.565, 0.495, false, true);
        pushCrop('item', 0.102, 0.525, 0.565, 0.750, false, true);
        pushCrop('move0', 0.655, 0.025, 0.980, 0.245, false, true);
        pushCrop('move1', 0.655, 0.265, 0.980, 0.485, false, true);
        pushCrop('move2', 0.655, 0.510, 0.980, 0.730, false, true);
        pushCrop('move3', 0.655, 0.750, 0.980, 0.970, false, true);
      } else {
        pushCrop('raw_hp', 0.270, 0.265, 0.365, 0.485, true, false);
        pushCrop('raw_atk', 0.270, 0.515, 0.365, 0.725, true, false);
        pushCrop('raw_def', 0.270, 0.750, 0.365, 0.970, true, false);
        pushCrop('raw_spa', 0.762, 0.265, 0.855, 0.485, true, false);
        pushCrop('raw_spd', 0.762, 0.515, 0.855, 0.725, true, false);
        pushCrop('raw_spe', 0.762, 0.750, 0.855, 0.970, true, false);

        pushCrop('sp_hp', 0.435, 0.265, 0.502, 0.485, true, false);
        pushCrop('sp_atk', 0.435, 0.515, 0.502, 0.725, true, false);
        pushCrop('sp_def', 0.435, 0.750, 0.502, 0.970, true, false);
        pushCrop('sp_spa', 0.898, 0.265, 0.980, 0.485, true, false);
        pushCrop('sp_spd', 0.898, 0.515, 0.980, 0.725, true, false);
        pushCrop('sp_spe', 0.898, 0.750, 0.980, 0.970, true, false);
      }
    }

    return {
      tabType,
      cards: detectedCards,
      crops,
      cardMetadata,
    };
  }

  function analyzeScreenCanvas(canvas, overrideTab) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return analyzeImageData(imgData, overrideTab);
  }

  // =========================================================================
  // 5. Team Merging & Showdown Formatter
  // =========================================================================
  function parseIntSafe(s) {
    if (!s) return undefined;
    const cleaned = String(s).replace(/[^0-9]/g, '');
    if (!cleaned) return undefined;
    const n = Number.parseInt(cleaned, 10);
    return Number.isFinite(n) ? n : undefined;
  }

  function extractRawCards(analyzed, ocrMap) {
    const abilityCards = [];
    const statusCards = [];

    for (const meta of analyzed.cardMetadata) {
      const s = meta.slot;
      const speciesOcr = ocrMap[`${s}:species`] || '';

      if (analyzed.tabType === 'ability') {
        abilityCards.push({
          slot: s,
          speciesOcr,
          gender: meta.gender,
          typeColors: meta.typeColors,
          abilityOcr: ocrMap[`${s}:ability`] || '',
          itemOcr: ocrMap[`${s}:item`] || '',
          movesOcr: [
            ocrMap[`${s}:move0`] || '',
            ocrMap[`${s}:move1`] || '',
            ocrMap[`${s}:move2`] || '',
            ocrMap[`${s}:move3`] || '',
          ],
        });
      } else {
        const rawStats = {};
        const spStats = {};
        for (const k of STAT_KEYS) {
          const r = parseIntSafe(ocrMap[`${s}:raw_${k}`]);
          const sp = parseIntSafe(ocrMap[`${s}:sp_${k}`]);
          if (r !== undefined) rawStats[k] = r;
          if (sp !== undefined) spStats[k] = sp;
        }
        statusCards.push({
          slot: s,
          speciesOcr,
          gender: meta.gender,
          typeColors: meta.typeColors,
          rawStats,
          spStats,
          arrows: meta.arrows,
        });
      }
    }

    return { abilityCards, statusCards };
  }

  function areScreensCompatibleTeam(cardsA, cardsB, db) {
    if (!cardsA || !cardsA.length || !cardsB || !cardsB.length) return true;
    const bySlotB = new Map(cardsB.map((c) => [c.slot, c]));
    let overlapping = 0;

    for (const a of cardsA) {
      const b = bySlotB.get(a.slot);
      if (!b) continue;
      overlapping++;
      if (a.speciesOcr && b.speciesOcr && koreanSimilarity(a.speciesOcr, b.speciesOcr) >= 0.55) {
        return true;
      }
      if (db && a.speciesOcr && b.speciesOcr) {
        const spA = matchSpecies(a.speciesOcr, db, { gender: a.gender, typeColors: a.typeColors }).entry;
        const spB = matchSpecies(b.speciesOcr, db, { gender: b.gender, typeColors: b.typeColors }).entry;
        if (spA && spB && spA.id === spB.id) return true;
      }
    }
    return overlapping === 0;
  }

  function mergeAndResolveTeam(abilityScreens, statusScreens, db, options = {}) {
    const lang = resolveUiLang(options && options.uiLang);
    const abilityBySlot = new Map();
    for (const screen of abilityScreens || []) {
      if (!screen) continue;
      for (const card of screen) {
        abilityBySlot.set(card.slot, card);
      }
    }

    const statusBySlot = new Map();
    for (const screen of statusScreens || []) {
      if (!screen) continue;
      for (const card of screen) {
        statusBySlot.set(card.slot, card);
      }
    }

    const slots = Array.from(
      new Set([...abilityBySlot.keys(), ...statusBySlot.keys()]),
    ).sort((a, b) => a - b);

    const out = [];

    for (const slot of slots) {
      const ab = abilityBySlot.get(slot);
      const st = statusBySlot.get(slot);

      const speciesOcr = (ab && ab.speciesOcr) || (st && st.speciesOcr) || '';
      const gender = (ab && ab.gender) ?? (st && st.gender) ?? null;
      const typeColors = (ab && ab.typeColors && ab.typeColors.length ? ab.typeColors : st && st.typeColors) || [];

      const spMatch = matchSpecies(speciesOcr, db, {
        gender,
        typeColors,
        abilityOcr: ab && ab.abilityOcr,
        movesOcr: ab && ab.movesOcr,
        rawStats: st && st.rawStats,
        spStats: st && st.spStats,
        arrows: st && st.arrows,
      });

      const speciesEntry = spMatch.entry;
      const warnings = [];

      if (!speciesEntry) {
        warnings.push(ocrText('speciesFail', { raw: speciesOcr || ocrText('emptyWord', {}, lang) }, lang));
      } else if (spMatch.score < 0.82) {
        warnings.push(ocrText('speciesWarn', { raw: speciesOcr, name: pickOcrEntryLabel('dex', speciesEntry, lang) }, lang));
      }

      const abilMatch = ab && ab.abilityOcr
        ? matchAbility(ab.abilityOcr, db, speciesEntry)
        : { entry: null, score: 0 };
      if (ab && !abilMatch.entry) {
        warnings.push(ocrText('abilityFail', { raw: ab.abilityOcr }, lang));
      } else if (ab && abilMatch.score < 0.8) {
        warnings.push(ocrText('abilityWarn', { raw: ab.abilityOcr, name: pickOcrEntryLabel('abilities', abilMatch.entry, lang) }, lang));
      }

      const itemMatch = ab && ab.itemOcr
        ? matchItem(ab.itemOcr, db)
        : { entry: null, score: 0 };
      if (ab && ab.itemOcr && !itemMatch.entry) {
        warnings.push(ocrText('itemFail', { raw: ab.itemOcr }, lang));
      } else if (ab && ab.itemOcr && itemMatch.score < 0.78) {
        warnings.push(ocrText('itemWarn', { raw: ab.itemOcr, name: pickOcrEntryLabel('items', itemMatch.entry, lang) }, lang));
      }

      const moves = ((ab && ab.movesOcr) || ['', '', '', '']).map((mvOcr, idx) => {
        if (!mvOcr) {
          return { id: '', name: '', ko: '', ocr: '', score: 0 };
        }
        const res = matchMove(mvOcr, db, speciesEntry);
        if (!res.entry) {
          warnings.push(ocrText('moveFail', { idx: idx + 1, raw: mvOcr }, lang));
          return { id: '', name: '', ko: mvOcr, ocr: mvOcr, score: 0 };
        }
        if (res.score < 0.8) {
          warnings.push(ocrText('moveWarn', { idx: idx + 1, raw: mvOcr, name: pickOcrEntryLabel('moves', res.entry, lang) }, lang));
        }
        return {
          id: res.entry.id,
          name: res.entry.name,
          ko: res.entry.ko,
          ocr: mvOcr,
          score: res.score,
        };
      });

      if (!ab) {
        warnings.push(ocrText('abilityMissing', {}, lang));
      }

      let sp = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
      let nature = DEFAULT_NEUTRAL_NATURE;
      let expectedRaw = null;
      let statsVerified = false;

      if (speciesEntry) {
        const solved = solveChampionsStats(
          speciesEntry.baseStats,
          (st && st.rawStats) || {},
          (st && st.spStats) || {},
          (st && st.arrows) || {},
          lang,
        );
        sp = solved.sp;
        nature = solved.nature;
        expectedRaw = solved.expectedRaw;
        statsVerified = solved.verified;
        warnings.push(...solved.warnings);
      } else if (st) {
        sp = {
          hp: st.spStats.hp ?? 0,
          atk: st.spStats.atk ?? 0,
          def: st.spStats.def ?? 0,
          spa: st.spStats.spa ?? 0,
          spd: st.spStats.spd ?? 0,
          spe: st.spStats.spe ?? 0,
        };
        warnings.push(ocrText('cannotVerifyNoSpecies', {}, lang));
      }

      const resolvedGender =
        speciesEntry && (speciesEntry.gender === 'M' || speciesEntry.gender === 'F' || speciesEntry.gender === 'N')
          ? speciesEntry.gender
          : (gender || '');

      out.push({
        slot,
        speciesId: speciesEntry ? speciesEntry.id : '',
        speciesName: speciesEntry ? speciesEntry.name : speciesOcr,
        speciesKo: speciesEntry ? speciesEntry.ko : speciesOcr,
        gender: resolvedGender,
        itemId: itemMatch.entry ? itemMatch.entry.id : '',
        itemName: itemMatch.entry ? itemMatch.entry.name : '',
        itemKo: itemMatch.entry ? itemMatch.entry.ko : '',
        abilityId: abilMatch.entry ? abilMatch.entry.id : '',
        abilityName: abilMatch.entry ? abilMatch.entry.name : '',
        abilityKo: abilMatch.entry ? abilMatch.entry.ko : '',
        nature,
        sp,
        rawStatsObserved: (st && st.rawStats) || {},
        rawStatsExpected: expectedRaw,
        moves,
        warnings,
        verified: Boolean(speciesEntry && ab && st && statsVerified && warnings.length === 0),
        ocrRaw: {
          speciesOcr,
          abilityOcr: ab && ab.abilityOcr,
          itemOcr: ab && ab.itemOcr,
          movesOcr: ab && ab.movesOcr,
        },
      });
    }

    return out;
  }

  function formatPokemonSet(set, db, options = {}) {
    const includeLevel50 = options.includeLevel50 !== false;
    const includeGender = options.includeGender !== false;
    const statMode = options.statMode || 'champions';
    const lines = [];

    let first = set.speciesName || 'Unknown';
    const dbSpecies = db && db.species ? db.species[set.speciesId] : null;
    const isGenderLocked = dbSpecies && (dbSpecies.gender === 'M' || dbSpecies.gender === 'F' || dbSpecies.gender === 'N');

    if (includeGender && !isGenderLocked && (set.gender === 'M' || set.gender === 'F')) {
      first += ` (${set.gender})`;
    }
    if (set.itemName) {
      first += ` @ ${set.itemName}`;
    }
    lines.push(first);

    if (set.abilityName) {
      lines.push(`Ability: ${set.abilityName}`);
    }

    if (includeLevel50) {
      lines.push('Level: 50');
    }

    const statParts = [];
    for (const key of STAT_KEYS) {
      const rawSp = set.sp[key] ?? 0;
      if (rawSp > 0) {
        const val = statMode === 'champions' ? rawSp : spToTraditionalEv(rawSp);
        statParts.push(`${val} ${STAT_SHORT_EN[key]}`);
      }
    }
    if (statParts.length > 0) {
      lines.push(`EVs: ${statParts.join(' / ')}`);
    }

    if (set.nature) {
      lines.push(`${set.nature} Nature`);
    }

    for (const move of set.moves || []) {
      if (move && move.name) {
        lines.push(`- ${move.name}`);
      }
    }

    return lines.join('\n');
  }

  function formatTeamShowdown(sets, db, options) {
    return (sets || [])
      .filter((s) => Boolean(s.speciesName))
      .map((s) => formatPokemonSet(s, db, options))
      .join('\n\n');
  }

  // =========================================================================
  // 6. Browser Runtime Client (Lazy DB + ONNX Worker + Canvas Loader)
  // =========================================================================
  let dbPromise = null;
  let cachedDb = null;

  function assertHttpContext() {
    if (typeof window !== 'undefined' && window.location && window.location.protocol === 'file:') {
      throw new Error(ocrText('fileProtocolErr'));
    }
  }

  function hydrateDbJapaneseNames(db) {
    const pData = typeof root !== 'undefined' && root.POKEMON_DATA;
    if (!db || !pData) return db;
    const pairs = [
      [db.species, pData.dex],
      [db.abilities, pData.abilities],
      [db.items, pData.items],
      [db.moves, pData.moves],
    ];
    for (const [targetPool, srcPool] of pairs) {
      if (!targetPool || !srcPool) continue;
      for (const [id, entry] of Object.entries(targetPool)) {
        if (entry && !entry.ja && srcPool[id] && srcPool[id].ja) {
          entry.ja = srcPool[id].ja;
        }
      }
    }
    return db;
  }

  async function loadDb(onProgress) {
    if (cachedDb) return cachedDb;
    if (dbPromise) return dbPromise;
    assertHttpContext();

    dbPromise = (async () => {
      if (onProgress) onProgress({ stageKey: 'loading_champions_db', stage: '챔피언스 데이터 불러오는 중...', ratio: 0.08 });
      const url = new URL('data/champions-db.json?v=20261115p', ENGINE_BASE_URL).href;
      const res = await fetch(url);
      if (!res.ok) throw new Error(ocrText('dbLoadErr', { status: res.status }));
      const json = hydrateDbJapaneseNames(await res.json());
      cachedDb = json;
      return json;
    })();

    try {
      return await dbPromise;
    } catch (err) {
      dbPromise = null;
      throw err;
    }
  }

  function resolveOcrModelLang(optLang) {
    const raw = optLang || (typeof root !== 'undefined' && root.UI_LANG) || 'ko';
    const l = String(raw).trim().toLowerCase();
    return (l.startsWith('ja') || l === 'jp') ? 'ja' : 'ko';
  }

  class OcrClient {
    constructor() {
      this.worker = null;
      this.readyByLang = new Map();
      this.initWaiters = new Map();
      this.reqCounter = 1;
      this.pending = new Map();
      this.progressListeners = new Set();
    }

    _notifyProgress(info) {
      for (const fn of this.progressListeners) {
        try { fn(info); } catch (_) {}
      }
    }

    _resetWorker(err) {
      for (const waiter of this.initWaiters.values()) {
        waiter.reject(err);
      }
      for (const req of this.pending.values()) {
        req.reject(err);
      }
      this.initWaiters.clear();
      this.readyByLang.clear();
      this.pending.clear();
      if (this.worker) {
        try { this.worker.terminate(); } catch (_) {}
      }
      this.worker = null;
    }

    _ensureWorker() {
      if (this.worker) return this.worker;
      const workerUrl = new URL('ocr-worker.js?v=20261115p', ENGINE_BASE_URL).href;
      const worker = new Worker(workerUrl, { type: 'module' });
      this.worker = worker;

      worker.onmessage = (event) => {
        const msg = event.data;
        if (msg.type === 'progress') {
          this._notifyProgress({ stageKey: msg.stageKey, stage: msg.stage, ratio: msg.ratio });
        } else if (msg.type === 'ready') {
          const lang = resolveOcrModelLang(msg.ocrLang || 'ko');
          this._notifyProgress({ stageKey: 'ocr_engine_ready', stage: 'OCR 엔진 준비 완료', ratio: 1 });
          const waiter = this.initWaiters.get(lang);
          if (waiter) {
            this.initWaiters.delete(lang);
            waiter.resolve();
          }
        } else if (msg.type === 'result') {
          const item = this.pending.get(msg.requestId);
          if (item) {
            this.pending.delete(msg.requestId);
            item.resolve(msg.results);
          }
        } else if (msg.type === 'error') {
          const err = new Error(msg.message || 'OCR 오류');
          if (typeof msg.requestId === 'number') {
            const item = this.pending.get(msg.requestId);
            if (item) {
              this.pending.delete(msg.requestId);
              item.reject(err);
            }
          } else if (msg.ocrLang) {
            const lang = resolveOcrModelLang(msg.ocrLang);
            const waiter = this.initWaiters.get(lang);
            this.initWaiters.delete(lang);
            this.readyByLang.delete(lang);
            if (waiter) waiter.reject(err);
          } else {
            this._resetWorker(err);
          }
        }
      };

      worker.onerror = (e) => {
        const err = new Error(e.message || ocrText('workerLoadErr'));
        this._resetWorker(err);
      };

      return worker;
    }

    async ensureReady(onProgress, ocrLang) {
      assertHttpContext();
      const lang = resolveOcrModelLang(ocrLang);
      if (onProgress) this.progressListeners.add(onProgress);

      let promise = this.readyByLang.get(lang);
      if (!promise) {
        const worker = this._ensureWorker();
        promise = new Promise((resolve, reject) => {
          this.initWaiters.set(lang, { resolve, reject });
        });
        this.readyByLang.set(lang, promise);
        worker.postMessage({ type: 'init', baseUrl: ENGINE_BASE_URL, ocrLang: lang });
      }

      try {
        await promise;
      } finally {
        if (onProgress) this.progressListeners.delete(onProgress);
      }
    }

    async recognizeCrops(crops, onProgress, ocrLang) {
      const lang = resolveOcrModelLang(ocrLang);
      await this.ensureReady(onProgress, lang);
      if (!this.worker) throw new Error(ocrText('workerUninit'));
      if (!crops || crops.length === 0) return {};

      const requestId = this.reqCounter++;
      return new Promise((resolve, reject) => {
        this.pending.set(requestId, { resolve, reject });
        const transfers = crops.map((c) => c.tensor.buffer);
        this.worker.postMessage({ type: 'recognize', requestId, ocrLang: lang, crops }, transfers);
      });
    }
  }

  const ocrClient = new OcrClient();

  async function loadImageFileToCanvas(fileOrBlob) {
    let imgSource = null;
    let width = 0;
    let height = 0;
    let revokeUrl = null;

    try {
      if (typeof createImageBitmap === 'function') {
        imgSource = await createImageBitmap(fileOrBlob);
        width = imgSource.width;
        height = imgSource.height;
      } else {
        const url = URL.createObjectURL(fileOrBlob);
        revokeUrl = url;
        imgSource = await new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error(ocrText('imgLoadErr')));
          img.src = url;
        });
        width = imgSource.naturalWidth || imgSource.width;
        height = imgSource.naturalHeight || imgSource.height;
      }

      const maxW = 2560;
      const scale = width > maxW ? maxW / width : 1;
      const cw = Math.max(1, Math.round(width * scale));
      const ch = Math.max(1, Math.round(height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(imgSource, 0, 0, cw, ch);

      const tw = 360;
      const th = Math.max(1, Math.round((ch * tw) / cw));
      const thumbCanvas = document.createElement('canvas');
      thumbCanvas.width = tw;
      thumbCanvas.height = th;
      thumbCanvas.getContext('2d').drawImage(canvas, 0, 0, tw, th);
      const previewUrl = thumbCanvas.toDataURL('image/jpeg', 0.82);

      return { canvas, previewUrl, width: cw, height: ch };
    } finally {
      if (imgSource && typeof imgSource.close === 'function') {
        imgSource.close();
      }
      if (revokeUrl) URL.revokeObjectURL(revokeUrl);
    }
  }

  async function analyzeAndRecognizeCanvas(canvas, options = {}) {
    const onProgress = options.onProgress;
    const overrideTab = options.overrideTab;
    const ocrLang = resolveOcrModelLang(options.ocrLang);
    const [db] = await Promise.all([
      loadDb(onProgress),
      ocrClient.ensureReady(onProgress, ocrLang),
    ]);

    if (onProgress) onProgress({ stageKey: 'ocr_recognizing', stage: '카드 영역 감지 및 문자 인식 중...', ratio: 0.9 });
    const analyzed = analyzeScreenCanvas(canvas, overrideTab);
    if (!analyzed.cards.length) {
      throw new Error(ocrText('cardsNotFound'));
    }

    const ocrMap = await ocrClient.recognizeCrops(analyzed.crops, onProgress, ocrLang);
    const extracted = extractRawCards(analyzed, ocrMap);

    return {
      db,
      tabType: analyzed.tabType,
      cardsDetected: analyzed.cards.length,
      abilityCards: extracted.abilityCards,
      statusCards: extracted.statusCards,
    };
  }

  const api = {
    STAT_KEYS,
    STAT_LABELS_KO,
    STAT_SHORT_EN,
    NATURES,
    DEFAULT_NEUTRAL_NATURE,
    normalizeForMatch,
    decomposeHangul,
    levenshtein,
    koreanSimilarity,
    japaneseSimilarity,
    resolveOcrModelLang,
    getNatureByName,
    findNatureByArrows,
    calcChampionsStat,
    calcAllChampionsStats,
    spToTraditionalEv,
    solveChampionsStats,
    matchNamedEntry,
    matchSpecies,
    matchAbility,
    matchItem,
    matchMove,
    detectCards,
    detectTabType,
    analyzeImageData,
    analyzeScreenCanvas,
    extractRawCards,
    areScreensCompatibleTeam,
    mergeAndResolveTeam,
    formatPokemonSet,
    formatTeamShowdown,
    loadDb,
    ocrClient,
    loadImageFileToCanvas,
    analyzeAndRecognizeCanvas,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.ChampionsOcr = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
