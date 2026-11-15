// UI Controller, High-Legibility 16:9 Sheet Renderer, and Fast 16:9 PNG Exporter

let currentParty = [];
let editingSlotIdx = 0;
let lastErrorMsg = '';
let toastTimer = null;
let isSavingImage = false;
let datalistsInitialized = false;

// Pre-baked sprite shadow cache & sliced 24x24 item icon cache for instant (<0.2s) PNG export
const bakedSpriteCache = new Map();
const itemIconCache = new Map();
const itemSheetImg = new Image();

if (window.ITEM_ICONS_DATA_URL) {
  itemSheetImg.onload = () => {
    document.querySelectorAll('img.item-icon[data-sp]').forEach(img => {
      const sp = Number(img.dataset.sp || 0);
      const url = getItemIconDataUrl(sp);
      if (url) img.src = url;
    });
  };
  itemSheetImg.src = window.ITEM_ICONS_DATA_URL;
}

function getItemIconDataUrl(spNum) {
  if (itemIconCache.has(spNum)) return itemIconCache.get(spNum);
  if (!itemSheetImg.complete || !itemSheetImg.naturalWidth) return '';
  const sx = (spNum % 16) * 24;
  const sy = Math.floor(spNum / 16) * 24;
  const c = document.createElement('canvas');
  c.width = 24;
  c.height = 24;
  const ctx = c.getContext('2d');
  ctx.drawImage(itemSheetImg, sx, sy, 24, 24, 0, 0, 24, 24);
  const url = c.toDataURL('image/png');
  itemIconCache.set(spNum, url);
  return url;
}

function bakeBitmapWithShadow(sourceBitmap) {
  const size = 256;
  const pad = 18;
  const maxBox = size - pad * 2;
  const nw = sourceBitmap.naturalWidth;
  const nh = sourceBitmap.naturalHeight;
  const ratio = Math.min(maxBox / nw, maxBox / nh);
  const dw = nw * ratio;
  const dh = nh * ratio;
  const dx = (size - dw) / 2;
  const dy = (size - dh) / 2;

  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  ctx.shadowColor = 'rgba(0, 0, 0, 0.52)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 9;
  ctx.drawImage(sourceBitmap, dx, dy, dw, dh);
  return c.toDataURL('image/png');
}

function onSpriteLoad(imgEl) {
  const src = imgEl && imgEl.getAttribute('src');
  if (!src || src.startsWith('data:') || bakedSpriteCache.has(src)) return;
  const schedule = window.requestIdleCallback || ((fn) => setTimeout(fn, 16));
  schedule(() => {
    try {
      if (imgEl.complete && imgEl.naturalWidth > 0 && !bakedSpriteCache.has(src)) {
        bakedSpriteCache.set(src, bakeBitmapWithShadow(imgEl));
      }
    } catch (_) {}
  });
}

function getSpriteUrl(spriteId) {
  return `https://wsrv.nl/?url=https://play.pokemonshowdown.com/sprites/home-centered/${spriteId}.png`;
}

function onSpriteError(imgEl, spriteId, baseSpriteId, num) {
  const step = Number(imgEl.dataset.step || 0);
  if (step === 0) {
    imgEl.dataset.step = '1';
    imgEl.src = `https://wsrv.nl/?url=https://play.pokemonshowdown.com/sprites/bw/${spriteId}.png`;
  } else if (step === 1 && baseSpriteId && baseSpriteId !== spriteId) {
    imgEl.dataset.step = '2';
    imgEl.src = `https://wsrv.nl/?url=https://play.pokemonshowdown.com/sprites/home-centered/${baseSpriteId}.png`;
  } else if (step <= 2 && num) {
    imgEl.dataset.step = '3';
    imgEl.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${num}.png`;
  } else if (step === 3) {
    imgEl.dataset.step = '4';
    imgEl.removeAttribute('crossorigin');
    imgEl.src = `https://play.pokemonshowdown.com/sprites/home-centered/${spriteId}.png`;
  }
}

function renderSheet() {
  const lang = document.getElementById('langSelect').value;
  const theme = document.getElementById('themeSelect').value;
  const gridMode = document.getElementById('gridSelect').value;
  const viewMode = document.getElementById('viewModeSelect').value;
  const showBanner = document.getElementById('showBannerCheck').checked;

  document.body.classList.remove('theme-ingame', 'theme-logo', 'theme-dark');
  document.body.classList.add(`theme-${theme}`);

  const sheetEl = document.getElementById('sheet16x9');
  sheetEl.classList.toggle('hide-stats', viewMode === 'ingame');
  sheetEl.classList.toggle('hide-banner', !showBanner);

  document.getElementById('viewTitle').textContent = document.getElementById('metaTitle').value;
  document.getElementById('viewSubtitle').textContent = document.getElementById('metaSubtitle').value;

  const gridEl = document.getElementById('partyGrid');
  gridEl.className = `party-grid ${gridMode === '2x3' ? 'grid-2x3' : ''}`;
  gridEl.innerHTML = '';

  if (lastErrorMsg) {
    gridEl.innerHTML = `
      <div class="state-panel">
        <div class="state-title">${lastErrorMsg}</div>
        <div class="state-desc">포켓몬 영문명·국문명·일문명이 올바른 쇼다운 형식인지 확인해주세요.</div>
        <div class="state-actions">
          <button type="button" class="btn btn-primary-cta state-btn" onclick="openPasteModal()">쇼다운 텍스트 다시 입력</button>
        </div>
      </div>`;
    fitStageToViewport();
    requestAnimationFrame(fitStageToViewport);
    return;
  }

  if (!currentParty.length) {
    gridEl.innerHTML = `
      <div class="state-panel">
        <div class="state-title">등록된 포켓몬 파티가 없습니다</div>
        <div class="state-desc">포켓몬 쇼다운 텍스트를 붙여넣거나 로컬 .txt 파일을 드래그 앤 드롭하세요.</div>
        <div class="state-actions">
          <button type="button" class="btn btn-primary-cta state-btn" onclick="openPasteModal()">쇼다운 텍스트 입력 / 파일 열기</button>
          <button type="button" class="btn state-btn" onclick="openSlotEditor(0)">새 파티 짜기</button>
        </div>
      </div>`;
    fitStageToViewport();
    requestAnimationFrame(fitStageToViewport);
    saveStateToStorage();
    return;
  }

  const isJa = lang === 'ja';
  const isEn = lang === 'en';
  const pickText = (obj) => {
    if (!obj) return '-';
    if (isEn) return obj.name || obj.en || obj.ko;
    if (isJa) return obj.ja || obj.name || obj.ko;
    return obj.ko || obj.name;
  };

  currentParty.forEach((slot, idx) => {
    const baseSp = D.dex[slot.speciesId] || D.dex.pikachu;
    const itemEntry = D.items[slot.itemId];
    const megaSp = resolveMegaSpecies(baseSp, itemEntry);
    const activeSp = (megaSp && slot.showMega) ? megaSp : baseSp;

    const baseAbil = D.abilities[slot.abilityId] || { name: slot.abilityId || '-', ko: slot.abilityId || '-', ja: slot.abilityId || '-' };
    const megaAbilRaw = activeSp.ab ? activeSp.ab[0] : '';
    const megaAbil = megaAbilRaw ? (D.abilities[toEnKey(megaAbilRaw)] || { name: megaAbilRaw, ko: megaAbilRaw, ja: megaAbilRaw }) : baseAbil;
    const shownAbil = (megaSp && slot.showMega) ? megaAbil : baseAbil;

    const nat = NATURES[slot.nature] || NATURES.Serious;
    const realStats = calcChampionsStats(activeSp.bs, slot.sp, slot.nature, activeSp.id);

    const spNum = itemEntry ? (itemEntry.sp || 0) : 0;

    const rawPrimaryName = pickText(activeSp);
    const nameMain = slot.gender ? rawPrimaryName.replace(/\([♀♂]\)$/g, '') : rawPrimaryName;
    const nameSub = lang === 'both' ? activeSp.name : (lang === 'ko-ja' ? (activeSp.ja || '').replace(/\([♀♂]\)$/g, '') : '');
    const itemText = itemEntry ? pickText(itemEntry) : '-';
    const abilText = pickText(shownAbil);
    const natText = pickText(nat);
    const upLbl = isJa ? STAT_LABELS[nat.plus]?.short : (isEn ? STAT_LABELS[nat.plus]?.en : STAT_LABELS[nat.plus]?.ko);
    const downLbl = isJa ? STAT_LABELS[nat.minus]?.short : (isEn ? STAT_LABELS[nat.minus]?.en : STAT_LABELS[nat.minus]?.ko);
    const neutralTxt = isJa ? '補正なし' : (isEn ? 'Neutral' : '무보정');
    const natModHtml = nat.plus
      ? `<span class="nat-mod-inline"><span class="up">${upLbl}▲</span> <span class="down">${downLbl}▼</span></span>`
      : `<span class="nat-mod-inline">${neutralTxt}</span>`;

    const lblAbil = isJa ? 'とくせい' : (isEn ? 'Ability' : '특성');
    const lblItem = isJa ? 'もちもの' : (isEn ? 'Item' : '도구');
    const lblNat = isJa ? 'せいかく' : (isEn ? 'Nature' : '성격');

    const card = document.createElement('article');
    card.className = `poke-card ${(megaSp && slot.showMega) ? 'is-mega-active' : ''}`;
    card.onclick = (e) => {
      if (e.target.closest('.mega-btn')) return;
      openSlotEditor(idx);
    };

    card.innerHTML = `
      <span class="card-watermark">${idx + 1}</span>

      <div class="card-topbar">
        <div class="name-group">
          <span class="p-name">${nameMain}</span>
          ${slot.gender === 'M' ? '<span class="gender-circle gender-M">♂</span>' : ''}
          ${slot.gender === 'F' ? '<span class="gender-circle gender-F">♀</span>' : ''}
          ${nameSub ? `<span class="p-sub-en">${nameSub}</span>` : ''}
        </div>

        <div class="head-right-group">
          ${megaSp ? `<button type="button" class="mega-btn ${slot.showMega ? 'on' : ''}" onclick="toggleCardMega(${idx}, event)">${slot.showMega ? 'MEGA' : 'BASE'}</button>` : ''}
          ${(activeSp.types || ['Normal']).map(t => {
            const ti = TYPE_INFO[t] || TYPE_INFO.Normal;
            return `<span class="type-chip" style="background:${ti.color};">${pickText(ti)}</span>`;
          }).join('')}
        </div>
      </div>

      <div class="card-split">
        <div class="card-left-col">
          <div class="sprite-anchor">
            <img class="poke-img" crossorigin="anonymous" src="${getSpriteUrl(activeSp.sprite)}" onload="onSpriteLoad(this)" onerror="onSpriteError(this,'${activeSp.sprite}','${baseSp.sprite}',${activeSp.num})" alt="${activeSp.name}" />
          </div>

          <div class="left-info-stack">
            <div class="info-block">
              <span class="ib-tag">${lblAbil}</span>
              <span class="ib-val"><span class="ib-val-txt">${abilText}</span></span>
            </div>
            <div class="info-block">
              <span class="ib-tag">${lblItem}</span>
              <span class="ib-val">
                ${itemEntry ? `<img class="item-icon" data-sp="${spNum}" src="${getItemIconDataUrl(spNum)}" alt="" />` : ''}
                <span class="ib-val-txt">${itemText}</span>
              </span>
            </div>
            <div class="info-block">
              <span class="ib-tag">${lblNat}</span>
              <span class="ib-val"><span class="ib-val-txt">${natText}</span>${natModHtml}</span>
            </div>
          </div>
        </div>

        <div class="card-moves-col">
          ${[0, 1, 2, 3].map(mIdx => {
            const mvId = slot.moves[mIdx];
            if (!mvId) return `<div class="move-row"><span class="mv-name" style="opacity:0.4;">-</span></div>`;
            const mv = D.moves[mvId] || D.moves[LOOKUP.moves[toEnKey(mvId)]] || { name: mvId, ko: mvId, ja: mvId, type: 'Normal', cat: 'Status', bp: 0 };
            const ti = TYPE_INFO[mv.type] || TYPE_INFO.Normal;
            const catLabel = isJa
              ? (mv.cat === 'Physical' ? '物理' : (mv.cat === 'Special' ? '特殊' : '変化'))
              : (isEn ? mv.cat.slice(0, 3) : (mv.cat === 'Physical' ? '물리' : (mv.cat === 'Special' ? '특수' : '변화')));
            const typeBadgeTxt = isEn ? ti.en.slice(0, 3).toUpperCase() : (isJa ? ti.ja : ti.ko);
            const mvDisplay = lang === 'ko-ja' && mv.ja
              ? `${mv.ko} <span style="font-size:0.72em;font-weight:700;opacity:0.85;">${mv.ja}</span>`
              : (lang === 'both' && mv.name
                ? `${mv.ko} <span style="font-size:0.68em;font-weight:700;opacity:0.85;">${mv.name}</span>`
                : pickText(mv));
            return `
              <div class="move-row">
                <div class="mv-left">
                  <span class="mv-type-sq" style="background:${ti.color};">${typeBadgeTxt}</span>
                  <span class="mv-name">${mvDisplay}</span>
                </div>
                <div class="mv-right">
                  <span class="mv-cat">${catLabel}</span>
                </div>
              </div>`;
          }).join('')}
        </div>
      </div>

      <div class="card-stats-footer">
        <div class="stats-6cols">
          ${STAT_KEYS.map(k => {
            const rVal = realStats[k];
            const sVal = Number(slot.sp[k] || 0);
            const mod = nat.plus === k ? 'up' : (nat.minus === k ? 'down' : '');
            const arrow = nat.plus === k ? '▲' : (nat.minus === k ? '▼' : '');
            const lbl = isJa ? STAT_LABELS[k].ja : (isEn ? STAT_LABELS[k].en : STAT_LABELS[k].ko);
            return `
              <div class="stat-box ${sVal > 0 ? 'invested' : ''}">
                <span class="st-lbl ${mod}">${lbl}${arrow}</span>
                <span class="st-num ${mod}">${rVal}</span>
                <span class="st-sp-pill">${sVal > 0 ? `+${sVal}` : '0'}</span>
              </div>`;
          }).join('')}
        </div>
      </div>
    `;
    gridEl.appendChild(card);
  });

  fitStageToViewport();
  requestAnimationFrame(fitStageToViewport);
  saveStateToStorage();
}

// Automatically shrinks font-size of long names/items/abilities/moves so nothing is ever truncated (...) or clipped
function autoFitSheetTexts() {
  const sheet = document.getElementById('sheet16x9');
  if (!sheet) return;

  // 0. Fit Banner Title & Subtitle
  ['viewTitle', 'viewSubtitle'].forEach(id => {
    const el = document.getElementById(id);
    if (!el || !el.parentElement) return;
    el.style.fontSize = '';
    const maxW = el.parentElement.clientWidth - 20;
    if (maxW <= 0) return;
    let size = parseFloat(window.getComputedStyle(el).fontSize) || 24;
    while (el.offsetWidth > maxW && size > 13) {
      size -= 0.5;
      el.style.fontSize = `${size}px`;
    }
  });

  // 1. Fit Pokemon Name (+ Gender + Sub-name) inside .name-group
  sheet.querySelectorAll('.name-group').forEach(group => {
    const pName = group.querySelector('.p-name');
    const pSub = group.querySelector('.p-sub-en');
    if (!pName) return;
    pName.style.fontSize = '';
    if (pSub) pSub.style.fontSize = '';

    const availW = group.clientWidth - 6;
    if (availW <= 0) return;

    const calcTotalW = () => {
      const children = Array.from(group.children);
      const sum = children.reduce((acc, ch) => acc + ch.offsetWidth, 0);
      return sum + Math.max(0, children.length - 1) * 6;
    };

    let size = parseFloat(window.getComputedStyle(pName).fontSize) || 35;
    let subSize = pSub ? (parseFloat(window.getComputedStyle(pSub).fontSize) || 17) : 0;
    while (calcTotalW() > availW && size > 13) {
      size -= 0.5;
      pName.style.fontSize = `${size}px`;
      if (pSub && subSize > 11) {
        subSize = Math.max(11, subSize - 0.25);
        pSub.style.fontSize = `${subSize}px`;
      }
    }
  });

  // 2. Fit Ability, Item, and Nature inside .ib-val
  sheet.querySelectorAll('.ib-val').forEach(ibVal => {
    const txtEl = ibVal.querySelector('.ib-val-txt');
    const modEl = ibVal.querySelector('.nat-mod-inline');
    if (!txtEl) return;
    txtEl.style.fontSize = '';
    if (modEl) modEl.style.fontSize = '';

    const availW = ibVal.clientWidth - 6;
    if (availW <= 0) return;

    const calcTotalW = () => {
      const children = Array.from(ibVal.children);
      const sum = children.reduce((acc, ch) => {
        if (ch.classList.contains('item-icon')) return acc + (ch.offsetWidth || 36);
        return acc + ch.offsetWidth;
      }, 0);
      return sum + Math.max(0, children.length - 1) * 5;
    };

    let size = parseFloat(window.getComputedStyle(txtEl).fontSize) || 24;
    let modSize = modEl ? (parseFloat(window.getComputedStyle(modEl).fontSize) || 15.5) : 0;
    while (calcTotalW() > availW && size > 12) {
      size -= 0.5;
      txtEl.style.fontSize = `${size}px`;
      if (modEl && size < 18 && modSize > 11) {
        modSize = Math.max(11, modSize - 0.25);
        modEl.style.fontSize = `${modSize}px`;
      }
    }
  });

  // 3. Fit Move Names inside .mv-left
  sheet.querySelectorAll('.mv-left').forEach(mvLeft => {
    const mvName = mvLeft.querySelector('.mv-name');
    const mvType = mvLeft.querySelector('.mv-type-sq');
    if (!mvName) return;
    mvName.style.fontSize = '';

    const availW = mvLeft.clientWidth - 6;
    if (availW <= 0) return;

    const calcTotalW = () => {
      const typeW = mvType ? mvType.offsetWidth + 7 : 0;
      return typeW + mvName.offsetWidth;
    };

    let size = parseFloat(window.getComputedStyle(mvName).fontSize) || 26;
    while (calcTotalW() > availW && size > 12) {
      size -= 0.5;
      mvName.style.fontSize = `${size}px`;
    }
  });

  // 4. Fit Stat Labels inside .stat-box
  sheet.querySelectorAll('.stat-box').forEach(box => {
    const lbl = box.querySelector('.st-lbl');
    if (!lbl) return;
    lbl.style.fontSize = '';
    const availW = box.clientWidth - 6;
    if (availW <= 0) return;
    let size = parseFloat(window.getComputedStyle(lbl).fontSize) || 17.5;
    while (lbl.offsetWidth > availW && size > 11) {
      size -= 0.5;
      lbl.style.fontSize = `${size}px`;
    }
  });
}

function toggleCardMega(idx, ev) {
  ev.stopPropagation();
  currentParty[idx].showMega = !currentParty[idx].showMega;
  renderSheet();
}

function updateGlobalSettings() {
  const showMega = document.getElementById('megaModeSelect').value === 'auto';
  currentParty.forEach(s => { s.showMega = showMega; });
  renderSheet();
}

function fitStageToViewport() {
  const vp = document.getElementById('stageViewport');
  const sc = document.getElementById('stageScaler');
  const sheet = document.getElementById('sheet16x9');
  if (!vp || !sc || !sheet) return;

  const vpW = vp.clientWidth;
  const vpH = vp.clientHeight;
  if (vpW <= 0 || vpH <= 0) return;

  const sheetH = 1080;
  let sheetW = 1920;
  let scale;

  // In edit view, expand the sheet horizontally to fill the full browser workspace width
  // and scale internal elements up to the full workspace height.
  // When saving an image, download16x9Image() locks the sheet to strict 16:9 (1920x1080).
  if ((vpW / vpH) > (1920 / 1080)) {
    scale = vpH / sheetH;
    sheetW = Math.max(1920, Math.round(vpW / scale));
  } else {
    scale = Math.min(vpW / 1920, vpH / 1080);
  }

  sheet.classList.toggle('is-wide-edit', sheetW > 1960);
  sc.style.width = `${sheetW}px`;
  sc.style.height = `${sheetH}px`;
  sheet.style.width = `${sheetW}px`;
  sheet.style.height = `${sheetH}px`;
  sc.style.transform = `translate(-50%, -50%) scale(${scale})`;
  autoFitSheetTexts();
}

function togglePresentationMode() {
  document.body.classList.toggle('presentation-mode');
  setTimeout(fitStageToViewport, 20);
}

// Bakes Pokemon sprite drop-shadow and aspect-ratio containment onto an offscreen canvas
// so html2canvas renders crisp shadows and never clips tall sprites
async function inlineImagesForCapture(rootEl) {
  const imgs = Array.from(rootEl.querySelectorAll('img.poke-img'));
  const restoreCallbacks = [];

  await Promise.all(imgs.map(async (img) => {
    const origSrc = img.getAttribute('src') || '';
    const origFilter = img.style.filter;
    if (!origSrc) return;

    try {
      // Fast path 1: Already pre-baked in bakedSpriteCache when sprite loaded on screen (0ms)
      let bakedUrl = bakedSpriteCache.get(origSrc);

      // Fast path 2: Sprite is already loaded in DOM with crossorigin="anonymous" (~1ms, 0 network requests)
      if (!bakedUrl && img.complete && img.naturalWidth > 0) {
        try {
          bakedUrl = bakeBitmapWithShadow(img);
          bakedSpriteCache.set(origSrc, bakedUrl);
        } catch (_) {}
      }

      // Fallback path: Image still loading or requires CORS fetch
      if (!bakedUrl && !origSrc.startsWith('data:')) {
        const res = await fetch(origSrc, { mode: 'cors' });
        if (res.ok) {
          const blob = await res.blob();
          const blobUrl = URL.createObjectURL(blob);
          const sourceBitmap = await new Promise((resolve) => {
            const tempImg = new Image();
            tempImg.onload = () => { URL.revokeObjectURL(blobUrl); resolve(tempImg); };
            tempImg.onerror = () => { URL.revokeObjectURL(blobUrl); resolve(null); };
            tempImg.src = blobUrl;
          });
          if (sourceBitmap && sourceBitmap.naturalWidth > 0) {
            bakedUrl = bakeBitmapWithShadow(sourceBitmap);
            bakedSpriteCache.set(origSrc, bakedUrl);
          }
        }
      }

      if (bakedUrl) {
        img.src = bakedUrl;
        img.style.filter = 'none';
        restoreCallbacks.push(() => {
          img.src = origSrc;
          img.style.filter = origFilter;
        });
      }
    } catch (_) {}
  }));

  return () => restoreCallbacks.forEach(fn => fn());
}

// Fast 16:9 PNG Image Saver
async function download16x9Image() {
  if (isSavingImage) return;
  if (typeof html2canvas === 'undefined') {
    showToast('이미지 저장 모듈을 불러오는 중입니다. 잠시 후 다시 시도해주세요.');
    return;
  }
  isSavingImage = true;
  showToast('16:9 PNG 이미지를 저장 중입니다...');
  const scaler = document.getElementById('stageScaler');
  const sheet = document.getElementById('sheet16x9');
  const prevTransform = scaler.style.transform;
  const prevPos = scaler.style.position;
  const prevLeft = scaler.style.left;
  const prevTop = scaler.style.top;
  const prevZ = scaler.style.zIndex;
  let restoreImgs = null;
  let layoutRestored = false;

  const restoreLayout = () => {
    if (layoutRestored) return;
    layoutRestored = true;
    if (restoreImgs) restoreImgs();
    scaler.style.position = prevPos;
    scaler.style.left = prevLeft;
    scaler.style.top = prevTop;
    scaler.style.zIndex = prevZ;
    scaler.style.transform = prevTransform;
    fitStageToViewport();
  };

  try {
    restoreImgs = await inlineImagesForCapture(sheet);

    scaler.style.position = 'fixed';
    scaler.style.left = '0px';
    scaler.style.top = '0px';
    scaler.style.zIndex = '-9999';
    scaler.style.transform = 'none';
    scaler.style.width = '1920px';
    scaler.style.height = '1080px';
    sheet.classList.remove('is-wide-edit');
    sheet.style.width = '1920px';
    sheet.style.height = '1080px';

    autoFitSheetTexts();

    const canvas = await html2canvas(sheet, {
      width: 1920,
      height: 1080,
      windowWidth: 1920,
      windowHeight: 1080,
      x: 0,
      y: 0,
      scrollX: 0,
      scrollY: 0,
      scale: 1.5,
      logging: false,
      imageTimeout: 4000,
      useCORS: true,
      allowTaint: false,
      backgroundColor: null,
      ignoreElements: (el) => {
        if (!el || !el.tagName) return false;
        if (el.tagName === 'DATALIST' || el.tagName === 'SCRIPT') return true;
        const cl = el.classList;
        return Boolean(cl && (cl.contains('topbar') || cl.contains('subbar') || cl.contains('modal-backdrop') || cl.contains('toast') || cl.contains('exit-fs-btn')));
      },
      onclone: (clonedDoc) => {
        const clonedSheet = clonedDoc.getElementById('sheet16x9');
        if (!clonedSheet) return;

        // Wrap inner text of badges/pills so shifting text up does not shift the badge border/background
        clonedSheet.querySelectorAll('.type-chip, .mv-type-sq, .mega-btn, .gender-circle, .ib-tag, .nat-mod-inline, .mv-cat, .st-sp-pill').forEach(el => {
          el.innerHTML = `<span class="h2c-badge-txt">${el.innerHTML}</span>`;
        });

        const fixStyle = clonedDoc.createElement('style');
        fixStyle.textContent = `
          .banner-title { position: relative !important; top: -6px !important; }
          .banner-sub { position: relative !important; top: -5px !important; }
          .p-name { position: relative !important; top: -6px !important; }
          .p-sub-en { position: relative !important; top: -3px !important; }
          .ib-val-txt { position: relative !important; top: -4.5px !important; }
          .mv-name { position: relative !important; top: -5px !important; }
          .st-lbl { position: relative !important; top: -3px !important; }
          .st-num { position: relative !important; top: -3.5px !important; }
          .h2c-badge-txt { position: relative !important; top: -3px !important; display: inline-flex !important; align-items: center !important; gap: 3px !important; }
        `;
        clonedDoc.head.appendChild(fixStyle);
      }
    });

    // Immediately restore edit layout before PNG encoding
    restoreLayout();

    const titleSlug = (document.getElementById('metaTitle').value || '포챔스_파티').replace(/[\\/:*?"<>|]/g, '_');
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const link = document.createElement('a');
    link.download = `${titleSlug}_16x9.png`;
    if (blob) {
      const blobUrl = URL.createObjectURL(blob);
      link.href = blobUrl;
      link.click();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    } else {
      link.href = canvas.toDataURL('image/png');
      link.click();
    }
    showToast('16:9 PNG 이미지가 저장되었습니다.');
  } catch (err) {
    showToast('이미지 캡처 중 오류가 발생했습니다. 전체화면(F) 캡처를 이용해주세요.');
  } finally {
    restoreLayout();
    isSavingImage = false;
  }
}

function openPasteModal() {
  document.getElementById('pasteInput').value = exportToShowdownPaste(currentParty);
  document.getElementById('pasteModal').classList.add('open');
}
function closePasteModal() { document.getElementById('pasteModal').classList.remove('open'); }

function handleTxtFileUpload(ev) {
  const file = ev.target.files && ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById('pasteInput').value = String(e.target.result || '');
    document.getElementById('metaTitle').value = file.name.replace(/\.txt$/i, '');
  };
  reader.readAsText(file, 'utf-8');
}

function applyPasteInput() {
  const raw = document.getElementById('pasteInput').value.trim();
  if (!raw) {
    currentParty = [];
    lastErrorMsg = '';
    closePasteModal();
    renderSheet();
    return;
  }
  const res = parseShowdownPaste(raw, document.getElementById('megaModeSelect').value === 'auto');
  if (!res.party.length) {
    lastErrorMsg = '유효한 포켓몬 쇼다운 데이터를 인식하지 못했습니다.';
    closePasteModal();
    renderSheet();
    return;
  }
  lastErrorMsg = '';
  currentParty = res.party;
  closePasteModal();
  renderSheet();
  showToast(res.convertedFrom252 ? '252 노력치를 포챔스 SP(최대 32 / 합계 66)로 환산하여 적용했습니다.' : `총 ${res.party.length}마리 파티가 적용되었습니다.`);
}

function copyShowdownExport() {
  navigator.clipboard.writeText(exportToShowdownPaste(currentParty)).then(() => showToast('쇼다운 텍스트가 복사되었습니다.'));
}

// Interactive Slot Editor
function initEditorDatalists() {
  if (datalistsInitialized) return;
  datalistsInitialized = true;
  document.getElementById('speciesDatalist').innerHTML = Object.values(D.dex).map(v => `<option value="${v.ko}">${v.ja || ''} · ${v.name}</option>`).join('');
  document.getElementById('itemsDatalist').innerHTML = Object.values(D.items).map(v => `<option value="${v.ko}">${v.ja || ''} · ${v.name}</option>`).join('');
  document.getElementById('abilitiesDatalist').innerHTML = Object.values(D.abilities).map(v => `<option value="${v.ko}">${v.ja || ''} · ${v.name}</option>`).join('');
  document.getElementById('movesDatalist').innerHTML = Object.values(D.moves).map(v => `<option value="${v.ko}">${v.ja || ''} · ${v.name}</option>`).join('');
  document.getElementById('edNature').innerHTML = Object.entries(NATURES).map(([k, v]) => {
    const mod = v.plus ? `+${STAT_LABELS[v.plus].ko} / -${STAT_LABELS[v.minus].ko}` : '무보정';
    return `<option value="${k}">${v.ko} (${v.ja} / ${v.en}) [${mod}]</option>`;
  }).join('');
}

function openSlotEditor(idx) {
  if (!currentParty.length) {
    currentParty = Array.from({ length: 6 }, () => ({
      speciesId: 'pikachu',
      gender: '',
      itemId: '',
      abilityId: 'static',
      nature: 'Serious',
      sp: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
      moves: ['', '', '', ''],
      showMega: true
    }));
    renderSheet();
  }
  initEditorDatalists();
  editingSlotIdx = idx;
  renderEditorTabs();
  loadSlotIntoEditor(idx);
  document.getElementById('editorModal').classList.add('open');
}
function closeSlotEditor() { document.getElementById('editorModal').classList.remove('open'); }

function renderEditorTabs() {
  document.getElementById('editorSlotTabs').innerHTML = currentParty.map((s, i) => {
    const sp = D.dex[s.speciesId] || D.dex.pikachu;
    return `<button type="button" class="btn ${i === editingSlotIdx ? 'active-chip' : ''}" onclick="openSlotEditor(${i})">#0${i + 1} ${sp.ko}</button>`;
  }).join('');
}

function loadSlotIntoEditor(idx) {
  const slot = currentParty[idx];
  if (!slot) return;
  const sp = D.dex[slot.speciesId] || D.dex.pikachu;
  const it = D.items[slot.itemId];
  const ab = D.abilities[slot.abilityId];

  document.getElementById('edSpecies').value = sp.ko;
  document.getElementById('edGender').value = slot.gender || '';
  document.getElementById('edItem').value = it ? it.ko : '';
  document.getElementById('edAbility').value = ab ? ab.ko : slot.abilityId;
  document.getElementById('edNature').value = slot.nature || 'Serious';
  document.getElementById('edForceMegaView').checked = Boolean(slot.showMega);

  for (let m = 0; m < 4; m++) {
    const mv = D.moves[slot.moves[m]];
    document.getElementById(`edMove${m}`).value = mv ? mv.ko : (slot.moves[m] || '');
  }

  const stones = findDedicatedMegaStones(sp);
  document.getElementById('quickMegaStoneContainer').innerHTML = stones.map(st =>
    `<button type="button" class="btn" style="height:26px;font-size:11.5px;" onclick="equipMegaStone('${st.ko}')">${st.ko} 장착</button>`
  ).join('');

  renderSpSliders();
}

function equipMegaStone(stoneKo) {
  document.getElementById('edItem').value = stoneKo;
  document.getElementById('edForceMegaView').checked = true;
  saveSlotFromEditor();
  loadSlotIntoEditor(editingSlotIdx);
}

function onEditorSpeciesChange() {
  const raw = document.getElementById('edSpecies').value.trim();
  const id = LOOKUP.dex[toEnKey(raw)] || LOOKUP.dex[toKey(raw)];
  if (id && D.dex[id] && D.dex[id].ab && D.dex[id].ab[0]) {
    const ab = D.abilities[toEnKey(D.dex[id].ab[0])];
    document.getElementById('edAbility').value = ab ? ab.ko : D.dex[id].ab[0];
  }
  saveSlotFromEditor();
  loadSlotIntoEditor(editingSlotIdx);
  renderEditorTabs();
}

let spRenderRaf = 0;

function renderSpSliders() {
  const slot = currentParty[editingSlotIdx];
  if (!slot) return;
  const baseSp = D.dex[slot.speciesId] || D.dex.pikachu;
  const megaSp = resolveMegaSpecies(baseSp, D.items[slot.itemId]);
  const activeSp = (megaSp && slot.showMega) ? megaSp : baseSp;
  const realStats = calcChampionsStats(activeSp.bs, slot.sp, slot.nature, activeSp.id);
  const total = STAT_KEYS.reduce((a, k) => a + Number(slot.sp[k] || 0), 0);

  document.getElementById('edSpTotalBadge').textContent = `${total} / 66 SP (잔여 ${Math.max(0, 66 - total)})`;

  const container = document.getElementById('spSlidersContainer');
  if (!document.getElementById('spRange_hp')) {
    container.innerHTML = STAT_KEYS.map(k => `
      <div class="sp-row">
        <span>${STAT_LABELS[k].ko} (${STAT_LABELS[k].short})</span>
        <input type="range" id="spRange_${k}" min="0" max="32" step="1" value="0" oninput="updateSlotSp('${k}', this.value)" />
        <input type="number" id="spNum_${k}" min="0" max="32" value="0" class="ctrl-input" style="height:28px;text-align:center;" oninput="updateSlotSp('${k}', this.value)" />
        <button type="button" id="spBtn_${k}" class="btn" style="height:26px;padding:0 6px;font-size:11px;" onclick="toggleMaxSp('${k}')">32</button>
        <span id="spReal_${k}" style="font-family:'JetBrains Mono',monospace;font-weight:700;text-align:right;">0</span>
      </div>`).join('');
  }

  STAT_KEYS.forEach(k => {
    const v = Number(slot.sp[k] || 0);
    const rangeEl = document.getElementById(`spRange_${k}`);
    const numEl = document.getElementById(`spNum_${k}`);
    const btnEl = document.getElementById(`spBtn_${k}`);
    const realEl = document.getElementById(`spReal_${k}`);
    if (rangeEl && Number(rangeEl.value) !== v) rangeEl.value = String(v);
    if (numEl && Number(numEl.value) !== v) numEl.value = String(v);
    if (btnEl) btnEl.textContent = v === 32 ? '0' : '32';
    if (realEl) realEl.textContent = String(realStats[k]);
  });
}

function toggleMaxSp(k) {
  const slot = currentParty[editingSlotIdx];
  if (!slot) return;
  const cur = Number(slot.sp[k] || 0);
  updateSlotSp(k, cur === 32 ? 0 : 32);
}

function updateSlotSp(k, val) {
  const slot = currentParty[editingSlotIdx];
  if (!slot) return;
  const parsed = parseInt(val, 10);
  let v = Number.isNaN(parsed) ? 0 : Math.max(0, Math.min(32, parsed));
  const others = STAT_KEYS.filter(x => x !== k).reduce((a, x) => a + Number(slot.sp[x] || 0), 0);
  if (others + v > 66) v = Math.max(0, 66 - others);
  slot.sp[k] = v;
  renderSpSliders();
  if (!spRenderRaf) {
    spRenderRaf = requestAnimationFrame(() => {
      spRenderRaf = 0;
      renderSheet();
    });
  }
}

function resetCurrentSlotSP() {
  const slot = currentParty[editingSlotIdx];
  STAT_KEYS.forEach(k => { slot.sp[k] = 0; });
  renderSpSliders();
  renderSheet();
}

function saveSlotFromEditor() {
  const slot = currentParty[editingSlotIdx];
  if (!slot) return;
  const spRaw = document.getElementById('edSpecies').value.trim();
  const spId = LOOKUP.dex[toEnKey(spRaw)] || LOOKUP.dex[toKey(spRaw)];
  if (spId) slot.speciesId = spId;
  slot.gender = document.getElementById('edGender').value;
  const itRaw = document.getElementById('edItem').value.trim();
  slot.itemId = LOOKUP.items[toEnKey(itRaw)] || LOOKUP.items[toKey(itRaw)] || '';
  const abRaw = document.getElementById('edAbility').value.trim();
  slot.abilityId = LOOKUP.abilities[toEnKey(abRaw)] || LOOKUP.abilities[toKey(abRaw)] || abRaw;
  slot.nature = document.getElementById('edNature').value || 'Serious';
  slot.showMega = document.getElementById('edForceMegaView').checked;
  for (let m = 0; m < 4; m++) {
    const mvRaw = document.getElementById(`edMove${m}`).value.trim();
    slot.moves[m] = LOOKUP.moves[toEnKey(mvRaw)] || LOOKUP.moves[toKey(mvRaw)] || mvRaw;
  }
  renderSpSliders();
  renderSheet();
}

const STORAGE_KEY = 'poke_champions_party_v2';

function buildExportableState() {
  return {
    party: currentParty,
    title: document.getElementById('metaTitle').value,
    subtitle: document.getElementById('metaSubtitle').value,
    theme: document.getElementById('themeSelect').value,
    grid: document.getElementById('gridSelect').value,
    viewMode: document.getElementById('viewModeSelect').value,
    lang: document.getElementById('langSelect').value,
    megaMode: document.getElementById('megaModeSelect').value,
    showBanner: document.getElementById('showBannerCheck').checked
  };
}

function applyImportedState(st) {
  if (!st || !Array.isArray(st.party)) return false;
  currentParty = st.party;
  if (typeof st.title === 'string') document.getElementById('metaTitle').value = st.title;
  if (typeof st.subtitle === 'string') document.getElementById('metaSubtitle').value = st.subtitle;
  if (st.theme) document.getElementById('themeSelect').value = st.theme;
  if (st.grid) document.getElementById('gridSelect').value = st.grid;
  if (st.viewMode) document.getElementById('viewModeSelect').value = st.viewMode;
  if (st.lang) document.getElementById('langSelect').value = st.lang;
  if (st.megaMode) document.getElementById('megaModeSelect').value = st.megaMode;
  if (typeof st.showBanner === 'boolean') document.getElementById('showBannerCheck').checked = st.showBanner;
  renderSheet();
  return true;
}

function saveStateToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(buildExportableState()));
  } catch (_) {}
}

function loadInitialState() {
  try {
    localStorage.removeItem('poke_champions_party_v1');
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (applyImportedState(parsed)) return;
    }
  } catch (_) {}
  currentParty = [];
  renderSheet();
}

function showToast(msg) {
  const el = document.getElementById('toastBox');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

window.addEventListener('resize', fitStageToViewport);
window.addEventListener('keydown', (e) => {
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
  if (e.key === 'f' || e.key === 'F') { e.preventDefault(); togglePresentationMode(); }
  else if (e.key === 'Escape' && document.body.classList.contains('presentation-mode')) togglePresentationMode();
});

window.addEventListener('DOMContentLoaded', () => {
  loadInitialState();
  fitStageToViewport();
  setTimeout(fitStageToViewport, 60);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      autoFitSheetTexts();
      fitStageToViewport();
    });
  }
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => {
    e.preventDefault();
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file && /\.txt$/i.test(file.name)) {
      const r = new FileReader();
      r.onload = ev => {
        const res = parseShowdownPaste(String(ev.target.result || ''), document.getElementById('megaModeSelect').value === 'auto');
        if (res.party.length) {
          lastErrorMsg = '';
          currentParty = res.party;
          document.getElementById('metaTitle').value = file.name.replace(/\.txt$/i, '');
          renderSheet();
          showToast(`${file.name} 파티가 적용되었습니다.`);
        }
      };
      r.readAsText(file, 'utf-8');
    }
  });
});
