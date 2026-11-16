// UI Controller, High-Legibility 16:9 Sheet Renderer, and Fast 16:9 PNG Exporter

let currentParty = [];
let editingSlotIdx = 0;
let lastErrorMsg = '';
let lastErrorKey = '';
let toastTimer = null;
let isSavingImage = false;
let datalistsInitialized = false;
let datalistsLang = '';
let currentUiLang = (window.APP_I18N && window.APP_I18N.detectBrowserUiLang()) || 'ko';
window.UI_LANG = currentUiLang;

function updateMobileSubbarToggleLabel() {
  const btn = document.getElementById('mobileSubbarToggle');
  if (!btn) return;
  const isOpen = document.body.classList.contains('mobile-subbar-open');
  btn.textContent = t(isOpen ? 'settingsHide' : 'settingsShow');
}

function applyUiTranslations() {
  document.documentElement.lang = currentUiLang;
  document.title = t('docTitle');

  document.querySelectorAll('.ui-lang-btn').forEach(btn => {
    const active = btn.dataset.uiLang === currentUiLang;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });

  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-html]').forEach(el => {
    el.innerHTML = t(el.dataset.i18nHtml);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => {
    el.setAttribute('aria-label', t(el.dataset.i18nAria));
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.setAttribute('title', t(el.dataset.i18nTitle));
  });

  updateMobileSubbarToggleLabel();
}

function setUiLanguage(nextLang, opts = {}) {
  const norm = window.APP_I18N ? window.APP_I18N.normalizeUiLang(nextLang) : nextLang;
  if (!norm) return;
  currentUiLang = norm;
  window.UI_LANG = currentUiLang;
  if (!opts.preserveCardLang) {
    ocrModelLang = null;
  }
  const langSel = document.getElementById('langSelect');
  if (langSel && !opts.preserveCardLang) {
    langSel.value = currentUiLang;
  }
  applyUiTranslations();
  initEditorDatalists(true);

  if (currentParty.length > 0 && document.getElementById('editorModal')?.classList.contains('open')) {
    renderEditorTabs();
    loadSlotIntoEditor(editingSlotIdx);
  } else if (document.getElementById('spRange_hp')) {
    renderSpSliders();
  }

  if ((ocrState.abilityCards.length || ocrState.statusCards.length) && ocrDbRef && window.ChampionsOcr) {
    applyOcrMergeAndRefresh(ocrDbRef, '', { skipToast: true, skipPartyReset: true });
  } else {
    renderOcrStatusUi();
  }

  renderSheet();
  if (!opts.silent) {
    showToast(t('toastUiLangChanged'));
  }
}

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

  if (lastErrorKey || lastErrorMsg) {
    const shownErr = lastErrorKey ? t(lastErrorKey) : lastErrorMsg;
    gridEl.innerHTML = `
      <div class="state-panel">
        <div class="state-title">${shownErr}</div>
        <div class="state-desc">${t('errDesc')}</div>
        <div class="state-actions">
          <button type="button" class="btn btn-primary-cta state-btn" onclick="openPasteModal()">${t('errRetryBtn')}</button>
        </div>
      </div>`;
    fitStageToViewport();
    requestAnimationFrame(fitStageToViewport);
    return;
  }

  if (!currentParty.length) {
    gridEl.innerHTML = `
      <div class="state-panel">
        <div class="state-title">${t('emptyTitle')}</div>
        <div class="state-desc">${t('emptyDesc')}</div>
        <div class="state-actions">
          <button type="button" class="btn btn-primary-cta state-btn" onclick="openOcrModal()">${t('emptyBtnOcr')}</button>
          <button type="button" class="btn state-btn" onclick="openPasteModal()">${t('emptyBtnPaste')}</button>
          <button type="button" class="btn state-btn" onclick="openSlotEditor(0)">${t('emptyBtnManual')}</button>
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
    const { baseSp, itemEntry, megaSp, activeSp, shownAbil } = resolveSlotDisplay(slot);

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

  // Batch-clear inline overrides once before measuring to prevent interleaved write-read layout thrashing
  const viewTitle = document.getElementById('viewTitle');
  const viewSubtitle = document.getElementById('viewSubtitle');
  if (viewTitle) viewTitle.style.fontSize = '';
  if (viewSubtitle) viewSubtitle.style.fontSize = '';
  sheet.querySelectorAll('.p-name, .p-sub-en, .ib-val-txt, .nat-mod-inline, .mv-name, .st-lbl').forEach(el => {
    el.style.fontSize = '';
  });

  // 0. Fit Banner Title & Subtitle
  [viewTitle, viewSubtitle].forEach(el => {
    if (!el || !el.parentElement) return;
    const maxW = el.parentElement.clientWidth - 20;
    if (maxW <= 0) return;
    let curW = el.offsetWidth;
    if (curW <= maxW) return;
    let size = parseFloat(window.getComputedStyle(el).fontSize) || 24;
    if (curW - maxW > 10 && size > 15) {
      size = Math.max(13, Math.floor(size * (maxW / curW) * 2) / 2);
      el.style.fontSize = `${size}px`;
      curW = el.offsetWidth;
    }
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

    const availW = group.clientWidth - 6;
    if (availW <= 0) return;

    const children = Array.from(group.children);
    const gapSum = Math.max(0, children.length - 1) * 6;
    const calcTotalW = () => children.reduce((acc, ch) => acc + ch.offsetWidth, 0) + gapSum;

    const initialW = calcTotalW();
    if (initialW <= availW) return;

    let size = parseFloat(window.getComputedStyle(pName).fontSize) || 35;
    let subSize = pSub ? (parseFloat(window.getComputedStyle(pSub).fontSize) || 17) : 0;
    if (initialW - availW > 12 && size > 15) {
      const jumped = Math.max(13, Math.floor(size * (availW / initialW) * 2) / 2);
      const stepDelta = Math.max(0, (size - jumped) * 0.5);
      size = jumped;
      pName.style.fontSize = `${size}px`;
      if (pSub && subSize > 11) {
        subSize = Math.max(11, subSize - stepDelta);
        pSub.style.fontSize = `${subSize}px`;
      }
    }
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

    const availW = ibVal.clientWidth - 6;
    if (availW <= 0) return;

    const children = Array.from(ibVal.children);
    const gapSum = Math.max(0, children.length - 1) * 5;
    const calcTotalW = () => children.reduce((acc, ch) => {
      if (ch.classList.contains('item-icon')) return acc + (ch.offsetWidth || 36);
      return acc + ch.offsetWidth;
    }, 0) + gapSum;

    const initialW = calcTotalW();
    if (initialW <= availW) return;

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

    const availW = mvLeft.clientWidth - 6;
    if (availW <= 0) return;

    const typeW = mvType ? mvType.offsetWidth + 7 : 0;
    const calcTotalW = () => typeW + mvName.offsetWidth;
    const initialW = calcTotalW();
    if (initialW <= availW) return;

    let size = parseFloat(window.getComputedStyle(mvName).fontSize) || 26;
    if (initialW - availW > 12 && size > 14) {
      const targetTextW = Math.max(24, availW - typeW);
      size = Math.max(12, Math.floor(size * (targetTextW / Math.max(1, mvName.offsetWidth)) * 2) / 2);
      mvName.style.fontSize = `${size}px`;
    }
    while (calcTotalW() > availW && size > 12) {
      size -= 0.5;
      mvName.style.fontSize = `${size}px`;
    }
  });

  // 4. Fit Stat Labels inside .stat-box
  sheet.querySelectorAll('.stat-box').forEach(box => {
    const lbl = box.querySelector('.st-lbl');
    if (!lbl) return;
    const availW = box.clientWidth - 6;
    if (availW <= 0) return;
    if (lbl.offsetWidth <= availW) return;
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

function fitStageToViewport(force = false) {
  if (isSavingImage && !force) return;
  const vp = document.getElementById('stageViewport');
  const sc = document.getElementById('stageScaler');
  const sheet = document.getElementById('sheet16x9');
  if (!vp || !sc || !sheet) return;

  const isPresentation = document.body.classList.contains('presentation-mode');
  const isMobileEdit = window.innerWidth <= 768 && !isPresentation;

  document.body.classList.toggle('mobile-edit-flow', isMobileEdit);
  sheet.classList.toggle('mobile-card-flow', isMobileEdit);

  if (isMobileEdit) {
    sheet.classList.remove('is-wide-edit');
    sc.style.width = '';
    sc.style.height = '';
    sc.style.transform = '';
    sheet.style.width = '';
    sheet.style.height = '';
    autoFitSheetTexts();
    return;
  }

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

function toggleMobileSubbar() {
  document.body.classList.toggle('mobile-subbar-open');
  updateMobileSubbarToggleLabel();
  setTimeout(fitStageToViewport, 30);
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

function traceRoundRect(ctx, x, y, w, h, r) {
  const cr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, cr);
    return;
  }
  ctx.moveTo(x + cr, y);
  ctx.lineTo(x + w - cr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + cr);
  ctx.lineTo(x + w, y + h - cr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - cr, y + h);
  ctx.lineTo(x + cr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - cr);
  ctx.lineTo(x, y + cr);
  ctx.quadraticCurveTo(x, y, x + cr, y);
  ctx.closePath();
}

function drawRoundedBox(ctx, x, y, w, h, r, fill, stroke, lineW) {
  if (w <= 0 || h <= 0) return;
  traceRoundRect(ctx, x, y, w, h, r);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke && lineW > 0) {
    ctx.lineWidth = lineW;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

async function waitForVisibleSprites(sheet, timeoutMs = 1500) {
  const imgs = Array.from(sheet.querySelectorAll('img.poke-img'));
  const pending = imgs.filter(img => img.getAttribute('src') && !img.complete);
  if (!pending.length) return;
  await Promise.race([
    Promise.all(pending.map(img => new Promise(resolve => {
      const done = () => { img.removeEventListener('load', done); img.removeEventListener('error', done); resolve(); };
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
    }))),
    new Promise(resolve => setTimeout(resolve, timeoutMs)),
  ]);
}

// Hardware-accelerated native Canvas 2D renderer using exact computed 1920x1080 DOM coordinates
function renderSheetToCanvasNative(sheet, scale = 1.5) {
  const W = 1920;
  const H = 1080;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(W * scale);
  canvas.height = Math.round(H * scale);
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);

  const bodyCs = getComputedStyle(document.body);
  const token = (name) => bodyCs.getPropertyValue(name).trim();
  const bg1 = token('--canvas-bg');
  const bg2 = token('--canvas-bg-2');
  const patCol = token('--canvas-pattern');

  // Diagonal 115deg two-tone canvas backdrop
  const angleRad = (115 - 90) * Math.PI / 180;
  const dx = Math.cos(angleRad);
  const dy = Math.sin(angleRad);
  const cx = W / 2;
  const cy = H / 2;
  const span = Math.abs(W * dx) + Math.abs(H * dy);
  const bgGrad = ctx.createLinearGradient(cx - dx * span / 2, cy - dy * span / 2, cx + dx * span / 2, cy + dy * span / 2);
  bgGrad.addColorStop(0, bg1);
  bgGrad.addColorStop(0.62, bg1);
  bgGrad.addColorStop(0.621, bg2);
  bgGrad.addColorStop(1, bg2);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Repeating 96x166 geometric lattice overlay
  if (patCol) {
    const tile = document.createElement('canvas');
    tile.width = 96;
    tile.height = 166;
    const tctx = tile.getContext('2d');
    tctx.fillStyle = patCol;
    tctx.beginPath();
    tctx.moveTo(0, 0); tctx.lineTo(96, 0); tctx.lineTo(48, 83); tctx.closePath();
    tctx.fill();
    tctx.beginPath();
    tctx.moveTo(0, 166); tctx.lineTo(96, 166); tctx.lineTo(48, 83); tctx.closePath();
    tctx.fill();
    const pattern = ctx.createPattern(tile, 'repeat');
    if (pattern) {
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }

  const sheetRect = sheet.getBoundingClientRect();
  const rel = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left - sheetRect.left, y: r.top - sheetRect.top, w: r.width, h: r.height };
  };
  const rad = (cs) => parseFloat(cs.borderTopLeftRadius) || 0;

  function fillCssGradientOrColor(x, y, w, h, radius, cs) {
    const bgImg = cs.backgroundImage;
    if (bgImg && bgImg.startsWith('linear-gradient')) {
      const cols = bgImg.match(/rgba?\([^)]+\)|#[0-9a-fA-F]{3,8}/g);
      if (cols && cols.length >= 2) {
        const lg = ctx.createLinearGradient(x, y, x, y + h);
        lg.addColorStop(0, cols[0]);
        lg.addColorStop(1, cols[cols.length - 1]);
        drawRoundedBox(ctx, x, y, w, h, radius, lg, cs.borderTopColor, parseFloat(cs.borderTopWidth) || 0);
        return;
      }
    }
    drawRoundedBox(ctx, x, y, w, h, radius, cs.backgroundColor, cs.borderTopColor, parseFloat(cs.borderTopWidth) || 0);
  }

  const range = document.createRange();
  const hasLetterSpacing = 'letterSpacing' in ctx;
  function drawTextNodes(rootEl, shadowCol = null, shadowBlur = 0, shadowOffY = 0) {
    const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const raw = node.nodeValue;
      if (!raw || !raw.trim()) continue;
      const parent = node.parentElement;
      if (!parent) continue;
      const cs = getComputedStyle(parent);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      range.selectNodeContents(node);
      const rects = range.getClientRects();
      if (!rects.length) continue;
      const r = rects[0];
      const tx = r.left - sheetRect.left;
      const ty = r.top - sheetRect.top + r.height / 2;
      ctx.save();
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      if (hasLetterSpacing && cs.letterSpacing && cs.letterSpacing !== 'normal') {
        ctx.letterSpacing = cs.letterSpacing;
      }
      ctx.fillStyle = cs.color;
      ctx.globalAlpha = parseFloat(cs.opacity || 1);
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      if (shadowCol) {
        ctx.shadowColor = shadowCol;
        ctx.shadowBlur = shadowBlur;
        ctx.shadowOffsetY = shadowOffY;
      }
      ctx.fillText(raw.trim(), tx, ty);
      ctx.restore();
    }
  }

  // Banner
  const bannerBar = sheet.querySelector('.banner-bar');
  if (bannerBar && !sheet.classList.contains('hide-banner')) {
    const br = rel(bannerBar);
    const bcs = getComputedStyle(bannerBar);
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.28)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 8;
    drawRoundedBox(ctx, br.x, br.y, br.w, br.h, rad(bcs), bcs.backgroundColor, bcs.borderTopColor, parseFloat(bcs.borderTopWidth) || 0);
    ctx.restore();

    ctx.save();
    traceRoundRect(ctx, br.x, br.y, br.w, br.h, rad(bcs));
    ctx.clip();
    const div = bannerBar.querySelector('.banner-center-divider');
    if (div) {
      const dr = rel(div);
      const cxD = dr.x + dr.w / 2;
      const cyD = dr.y + dr.h / 2;
      ctx.save();
      ctx.translate(cxD, cyD);
      ctx.transform(1, 0, Math.tan(-18 * Math.PI / 180), 1, 0, 0);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.fillRect(-28, -30, 56, 60);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-28, -30); ctx.lineTo(-28, 30);
      ctx.moveTo(28, -30); ctx.lineTo(28, 30);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.translate(cxD, cyD);
      ctx.beginPath(); ctx.arc(0, 0, 14, Math.PI, 0); ctx.closePath(); ctx.fillStyle = '#EF4444'; ctx.fill();
      ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI); ctx.closePath(); ctx.fillStyle = '#F8FAFC'; ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(-14, -1.2, 28, 2.4);
      ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, Math.PI * 2); ctx.fillStyle = '#FFFFFF'; ctx.fill();
      ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.restore();
    }
    const bTitle = bannerBar.querySelector('.banner-title');
    const bSub = bannerBar.querySelector('.banner-sub');
    if (bTitle) drawTextNodes(bTitle, 'rgba(0, 0, 0, 0.35)', 4, 2);
    if (bSub) drawTextNodes(bSub, 'rgba(0, 0, 0, 0.35)', 4, 2);
    ctx.restore();
  }

  // Cards
  sheet.querySelectorAll('.poke-card').forEach(card => {
    const cr = rel(card);
    const ccs = getComputedStyle(card);
    const cardRadius = rad(ccs);
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.28)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 8;
    fillCssGradientOrColor(cr.x, cr.y, cr.w, cr.h, cardRadius, ccs);
    ctx.restore();

    ctx.save();
    traceRoundRect(ctx, cr.x, cr.y, cr.w, cr.h, cardRadius);
    ctx.clip();

    const wm = card.querySelector('.card-watermark');
    if (wm) drawTextNodes(wm);

    const tb = card.querySelector('.card-topbar');
    if (tb) {
      const tbr = rel(tb);
      const tbcs = getComputedStyle(tb);
      ctx.fillStyle = tbcs.backgroundColor;
      ctx.fillRect(tbr.x, tbr.y, tbr.w, tbr.h);
      ctx.fillStyle = tbcs.borderBottomColor;
      ctx.fillRect(tbr.x, tbr.y + tbr.h - 1.5, tbr.w, 1.5);
    }

    const leftCol = card.querySelector('.card-left-col');
    if (leftCol) {
      const lr = rel(leftCol);
      const lcs = getComputedStyle(leftCol);
      ctx.fillStyle = lcs.borderRightColor;
      ctx.fillRect(lr.x + lr.w - 1.5, lr.y, 1.5, lr.h);
    }

    const footer = card.querySelector('.card-stats-footer');
    const showFooter = footer && getComputedStyle(footer).display !== 'none';
    if (showFooter) {
      const fr = rel(footer);
      const fcs = getComputedStyle(footer);
      ctx.fillStyle = fcs.backgroundColor;
      ctx.fillRect(fr.x, fr.y, fr.w, fr.h);
      ctx.fillStyle = fcs.borderTopColor;
      ctx.fillRect(fr.x, fr.y, fr.w, 2);
    }

    card.querySelectorAll('.gender-circle, .mega-btn, .type-chip').forEach(el => {
      const er = rel(el);
      const ecs = getComputedStyle(el);
      drawRoundedBox(ctx, er.x, er.y, er.w, er.h, rad(ecs), ecs.backgroundColor, ecs.borderTopColor, parseFloat(ecs.borderTopWidth) || 0);
      drawTextNodes(el, 'rgba(0, 0, 0, 0.45)', 3, 1);
    });
    if (tb) {
      const pName = tb.querySelector('.p-name');
      const pSub = tb.querySelector('.p-sub-en');
      if (pName) drawTextNodes(pName, 'rgba(0, 0, 0, 0.45)', 4, 2);
      if (pSub) drawTextNodes(pSub);
    }

    card.querySelectorAll('.info-block').forEach(ib => {
      const ibr = rel(ib);
      const ibcs = getComputedStyle(ib);
      drawRoundedBox(ctx, ibr.x, ibr.y, ibr.w, ibr.h, rad(ibcs), ibcs.backgroundColor, ibcs.borderTopColor, parseFloat(ibcs.borderTopWidth) || 0);
    });
    card.querySelectorAll('.ib-tag, .nat-mod-inline').forEach(el => {
      const er = rel(el);
      const ecs = getComputedStyle(el);
      drawRoundedBox(ctx, er.x, er.y, er.w, er.h, rad(ecs), ecs.backgroundColor, null, 0);
      drawTextNodes(el);
    });
    card.querySelectorAll('.ib-val').forEach(el => {
      const txt = el.querySelector('.ib-val-txt');
      if (txt) drawTextNodes(txt, 'rgba(0, 0, 0, 0.38)', 4, 2);
      const icon = el.querySelector('img.item-icon');
      if (icon && icon.complete && icon.naturalWidth > 0) {
        const ir = rel(icon);
        ctx.drawImage(icon, ir.x, ir.y, ir.w, ir.h);
      }
    });

    card.querySelectorAll('.move-row').forEach(mr => {
      const mrr = rel(mr);
      const mrcs = getComputedStyle(mr);
      if (parseFloat(mrcs.borderBottomWidth) > 0) {
        ctx.fillStyle = mrcs.borderBottomColor;
        ctx.fillRect(mrr.x, mrr.y + mrr.h - 1.5, mrr.w, 1.5);
      }
      const sq = mr.querySelector('.mv-type-sq');
      if (sq) {
        const sr = rel(sq);
        const scs = getComputedStyle(sq);
        drawRoundedBox(ctx, sr.x, sr.y, sr.w, sr.h, rad(scs), scs.backgroundColor, scs.borderTopColor, parseFloat(scs.borderTopWidth) || 0);
        drawTextNodes(sq, 'rgba(0, 0, 0, 0.45)', 3, 1);
      }
      const mvName = mr.querySelector('.mv-name');
      if (mvName) drawTextNodes(mvName, 'rgba(0, 0, 0, 0.4)', 4, 2);
      const cat = mr.querySelector('.mv-cat');
      if (cat) {
        const catr = rel(cat);
        const catcs = getComputedStyle(cat);
        drawRoundedBox(ctx, catr.x, catr.y, catr.w, catr.h, rad(catcs), catcs.backgroundColor, catcs.borderTopColor, parseFloat(catcs.borderTopWidth) || 0);
        drawTextNodes(cat);
      }
    });

    if (showFooter) {
      footer.querySelectorAll('.stat-box').forEach(sb => {
        const sr = rel(sb);
        const scs = getComputedStyle(sb);
        drawRoundedBox(ctx, sr.x, sr.y, sr.w, sr.h, rad(scs), scs.backgroundColor, scs.borderTopColor, parseFloat(scs.borderTopWidth) || 0);
        const pill = sb.querySelector('.st-sp-pill');
        if (pill) {
          const pr = rel(pill);
          const pcs = getComputedStyle(pill);
          drawRoundedBox(ctx, pr.x, pr.y, pr.w, pr.h, rad(pcs), pcs.backgroundColor, null, 0);
          drawTextNodes(pill);
        }
        const lbl = sb.querySelector('.st-lbl');
        const num = sb.querySelector('.st-num');
        if (lbl) drawTextNodes(lbl);
        if (num) drawTextNodes(num, 'rgba(0, 0, 0, 0.45)', 4, 2);
      });
    }

    const img = card.querySelector('img.poke-img');
    if (img && img.complete && img.naturalWidth > 0) {
      const ir = rel(img);
      const ratio = Math.min(ir.w / img.naturalWidth, ir.h / img.naturalHeight);
      const dw = img.naturalWidth * ratio;
      const dh = img.naturalHeight * ratio;
      const dx = ir.x + (ir.w - dw) / 2;
      const dy = ir.y + (ir.h - dh) / 2;
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 6;
      ctx.drawImage(img, dx, dy, dw, dh);
      ctx.restore();
    }

    drawRoundedBox(ctx, cr.x, cr.y, cr.w, cr.h, cardRadius, null, ccs.borderTopColor, parseFloat(ccs.borderTopWidth) || 0);
    ctx.restore();
  });

  return canvas;
}

// Fast 16:9 PNG Image Saver (Native Canvas 2D with html2canvas safety fallback)
async function download16x9Image() {
  if (isSavingImage) return;
  isSavingImage = true;

  const saveBtn = document.querySelector('.topbar-right .btn-primary-cta');
  if (saveBtn) {
    if (saveBtn._doneTimer) clearTimeout(saveBtn._doneTimer);
    saveBtn.disabled = true;
    saveBtn.textContent = t('btnGeneratingPng');
  }
  showToast(t('toastPreparingPng'));

  const scaler = document.getElementById('stageScaler');
  const sheet = document.getElementById('sheet16x9');
  const prevTransform = scaler.style.transform;
  const prevPos = scaler.style.position;
  const prevLeft = scaler.style.left;
  const prevTop = scaler.style.top;
  const prevZ = scaler.style.zIndex;
  let restoreImgs = null;
  let detachedDatalists = [];
  let layoutRestored = false;

  const restoreLayout = () => {
    if (layoutRestored) return;
    layoutRestored = true;
    if (restoreImgs) restoreImgs();
    detachedDatalists.forEach(({ dl, parent, next }) => parent.insertBefore(dl, next));
    detachedDatalists = [];
    scaler.style.position = prevPos;
    scaler.style.left = prevLeft;
    scaler.style.top = prevTop;
    scaler.style.zIndex = prevZ;
    scaler.style.transform = prevTransform;
    fitStageToViewport(true);
  };

  try {
    // Let browser paint immediate button & toast feedback before layout switch
    await new Promise(resolve => requestAnimationFrame(resolve));

    const exportScale = 1.5;

    document.body.classList.remove('mobile-edit-flow');
    sheet.classList.remove('mobile-card-flow');
    sheet.classList.remove('is-wide-edit');

    scaler.style.position = 'fixed';
    scaler.style.left = '0px';
    scaler.style.top = '0px';
    scaler.style.zIndex = '-9999';
    scaler.style.transform = 'none';
    scaler.style.width = '1920px';
    scaler.style.height = '1080px';
    sheet.style.width = '1920px';
    sheet.style.height = '1080px';

    autoFitSheetTexts();

    let blob = null;
    let fallbackCanvas = null;

    if (currentParty.length && !lastErrorMsg) {
      await waitForVisibleSprites(sheet, 1500);
      try {
        const nativeCanvas = renderSheetToCanvasNative(sheet, exportScale);
        restoreLayout();
        blob = await new Promise((resolve, reject) => {
          try {
            nativeCanvas.toBlob(b => (b ? resolve(b) : reject(new Error('empty_blob'))), 'image/png');
          } catch (e) {
            reject(e);
          }
        });
      } catch (_) {
        blob = null;
      }
    }

    if (!blob) {
      if (typeof html2canvas === 'undefined') {
        throw new Error('IMAGE_SAVER_UNAVAILABLE');
      }
      // Restore 1920x1080 stage cleanly if native path already called restoreLayout()
      if (layoutRestored) {
        layoutRestored = false;
        document.body.classList.remove('mobile-edit-flow');
        sheet.classList.remove('mobile-card-flow');
        sheet.classList.remove('is-wide-edit');
        scaler.style.position = 'fixed';
        scaler.style.left = '0px';
        scaler.style.top = '0px';
        scaler.style.zIndex = '-9999';
        scaler.style.transform = 'none';
        scaler.style.width = '1920px';
        scaler.style.height = '1080px';
        sheet.style.width = '1920px';
        sheet.style.height = '1080px';
        autoFitSheetTexts();
      }
      // Temporarily detach large datalist option lists so html2canvas doesn't clone 3000+ unused nodes
      document.querySelectorAll('datalist').forEach(dl => {
        if (dl.parentNode && dl.childElementCount) {
          detachedDatalists.push({ dl, parent: dl.parentNode, next: dl.nextSibling });
          dl.remove();
        }
      });
      restoreImgs = await inlineImagesForCapture(sheet);
      fallbackCanvas = await html2canvas(sheet, {
        width: 1920,
        height: 1080,
        windowWidth: 1920,
        windowHeight: 1080,
        x: 0,
        y: 0,
        scrollX: 0,
        scrollY: 0,
        scale: exportScale,
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
      restoreLayout();
      blob = await new Promise(resolve => fallbackCanvas.toBlob(resolve, 'image/png'));
    }

    const titleSlug = (document.getElementById('metaTitle').value || t('pngDefaultSlug')).replace(/[\\/:*?"<>|]/g, '_');
    const link = document.createElement('a');
    link.download = `${titleSlug}_16x9.png`;
    link.style.display = 'none';
    let downloadStarted = false;
    if (blob) {
      const blobUrl = URL.createObjectURL(blob);
      link.href = blobUrl;
      document.body.appendChild(link);
      link.click();
      link.remove();
      downloadStarted = true;
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } else if (fallbackCanvas) {
      link.href = fallbackCanvas.toDataURL('image/png');
      document.body.appendChild(link);
      link.click();
      link.remove();
      downloadStarted = true;
    }
    showToast(t('toastPngStarted'), 4500);
    if (saveBtn && downloadStarted) {
      saveBtn.textContent = t('btnDownloadStarted');
      saveBtn._doneTimer = setTimeout(() => {
        saveBtn.textContent = t('btnSavePng');
      }, 1600);
    }
  } catch (err) {
    showToast(t('toastPngError'), 3500);
    if (saveBtn) saveBtn.textContent = t('btnSavePng');
  } finally {
    restoreLayout();
    isSavingImage = false;
    if (saveBtn) {
      saveBtn.disabled = false;
      if (saveBtn.textContent === t('btnGeneratingPng')) {
        saveBtn.textContent = t('btnSavePng');
      }
    }
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
    lastErrorKey = '';
    closePasteModal();
    renderSheet();
    return;
  }
  const res = parseShowdownPaste(raw, document.getElementById('megaModeSelect').value === 'auto');
  if (!res.party.length) {
    lastErrorKey = 'errInvalidPaste';
    lastErrorMsg = t('errInvalidPaste');
    closePasteModal();
    renderSheet();
    return;
  }
  lastErrorKey = '';
  lastErrorMsg = '';
  currentParty = res.party;
  closePasteModal();
  renderSheet();
  showToast(res.convertedFrom252 ? t('toastConverted252') : t('toastPartyApplied', { count: res.party.length }));
}

function copyShowdownExport() {
  navigator.clipboard.writeText(exportToShowdownPaste(currentParty)).then(() => showToast(t('toastCopied')));
}

function formatDatalistOption(v) {
  const pick = window.APP_I18N.pickNameForUi;
  const primary = pick(v);
  if (currentUiLang === 'ja') return `<option value="${primary}">${v.name || ''} · ${v.ko || ''}</option>`;
  if (currentUiLang === 'en') return `<option value="${primary}">${v.ja || ''} · ${v.ko || ''}</option>`;
  return `<option value="${primary}">${v.ja || ''} · ${v.name || ''}</option>`;
}

// Interactive Slot Editor
function initEditorDatalists(force = false) {
  if (datalistsInitialized && !force && datalistsLang === currentUiLang) return;
  datalistsInitialized = true;
  datalistsLang = currentUiLang;
  document.getElementById('speciesDatalist').innerHTML = Object.values(D.dex).map(formatDatalistOption).join('');
  document.getElementById('itemsDatalist').innerHTML = Object.values(D.items).map(formatDatalistOption).join('');
  document.getElementById('abilitiesDatalist').innerHTML = Object.values(D.abilities).map(formatDatalistOption).join('');
  document.getElementById('movesDatalist').innerHTML = Object.values(D.moves).map(formatDatalistOption).join('');
  const natEl = document.getElementById('edNature');
  const prevNat = natEl.value || 'Serious';
  const statLblKey = currentUiLang === 'ja' ? 'ja' : (currentUiLang === 'en' ? 'en' : 'ko');
  natEl.innerHTML = Object.entries(NATURES).map(([k, v]) => {
    const mod = v.plus ? `+${STAT_LABELS[v.plus][statLblKey]} / -${STAT_LABELS[v.minus][statLblKey]}` : t('natureNeutral');
    if (currentUiLang === 'ja') return `<option value="${k}">${v.ja} (${v.en}) [${mod}]</option>`;
    if (currentUiLang === 'en') return `<option value="${k}">${v.en} [${mod}]</option>`;
    return `<option value="${k}">${v.ko} (${v.ja} / ${v.en}) [${mod}]</option>`;
  }).join('');
  natEl.value = prevNat;
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
  const pick = window.APP_I18N.pickNameForUi;
  document.getElementById('editorSlotTabs').innerHTML = currentParty.map((s, i) => {
    const sp = D.dex[s.speciesId] || D.dex.pikachu;
    return `<button type="button" class="btn ${i === editingSlotIdx ? 'active-chip' : ''}" onclick="openSlotEditor(${i})">#0${i + 1} ${pick(sp)}</button>`;
  }).join('');
}

function loadSlotIntoEditor(idx) {
  const slot = currentParty[idx];
  if (!slot) return;
  const pick = window.APP_I18N.pickNameForUi;
  const sp = D.dex[slot.speciesId] || D.dex.pikachu;
  const it = D.items[slot.itemId];
  const ab = D.abilities[slot.abilityId];

  document.getElementById('edSpecies').value = pick(sp);
  document.getElementById('edGender').value = slot.gender || '';
  document.getElementById('edItem').value = it ? pick(it) : '';
  document.getElementById('edAbility').value = ab ? pick(ab) : slot.abilityId;
  document.getElementById('edNature').value = slot.nature || 'Serious';
  document.getElementById('edForceMegaView').checked = Boolean(slot.showMega);

  for (let m = 0; m < 4; m++) {
    const mv = D.moves[slot.moves[m]];
    document.getElementById(`edMove${m}`).value = mv ? pick(mv) : (slot.moves[m] || '');
  }

  const stones = findDedicatedMegaStones(sp);
  document.getElementById('quickMegaStoneContainer').innerHTML = stones.map(st =>
    `<button type="button" class="btn" style="height:26px;font-size:11.5px;" onclick="equipMegaStone('${st.id}')">${t('equipMega', { name: pick(st) })}</button>`
  ).join('');

  renderSpSliders();
}

function equipMegaStone(stoneId) {
  const st = D.items[stoneId];
  document.getElementById('edItem').value = st ? window.APP_I18N.pickNameForUi(st) : stoneId;
  document.getElementById('edForceMegaView').checked = true;
  saveSlotFromEditor();
  loadSlotIntoEditor(editingSlotIdx);
}

function onEditorSpeciesChange() {
  const raw = document.getElementById('edSpecies').value.trim();
  const id = LOOKUP.dex[toEnKey(raw)] || LOOKUP.dex[toKey(raw)];
  if (id && D.dex[id] && D.dex[id].ab && D.dex[id].ab[0]) {
    const ab = D.abilities[toEnKey(D.dex[id].ab[0])];
    document.getElementById('edAbility').value = ab ? window.APP_I18N.pickNameForUi(ab) : D.dex[id].ab[0];
  }
  saveSlotFromEditor();
  loadSlotIntoEditor(editingSlotIdx);
  renderEditorTabs();
}

let spRenderRaf = 0;

function formatEditorStatLabel(k) {
  const info = STAT_LABELS[k];
  if (currentUiLang === 'en') return info.en;
  if (currentUiLang === 'ja') return info.ja;
  return `${info.ko} (${info.short})`;
}

function renderSpSliders() {
  const slot = currentParty[editingSlotIdx];
  if (!slot) return;
  const { activeSp } = resolveSlotDisplay(slot);
  const realStats = calcChampionsStats(activeSp.bs, slot.sp, slot.nature, activeSp.id);
  const total = STAT_KEYS.reduce((a, k) => a + Number(slot.sp[k] || 0), 0);

  document.getElementById('edSpTotalBadge').textContent = t('spBadge', { total, left: Math.max(0, 66 - total) });

  const container = document.getElementById('spSlidersContainer');
  if (!document.getElementById('spRange_hp')) {
    container.innerHTML = STAT_KEYS.map(k => `
      <div class="sp-row">
        <span id="spLbl_${k}">${formatEditorStatLabel(k)}</span>
        <input type="range" id="spRange_${k}" min="0" max="32" step="1" value="0" oninput="updateSlotSp('${k}', this.value)" />
        <input type="number" id="spNum_${k}" min="0" max="32" value="0" class="ctrl-input" style="height:28px;text-align:center;" oninput="updateSlotSp('${k}', this.value)" />
        <button type="button" id="spBtn_${k}" class="btn" style="height:26px;padding:0 6px;font-size:11px;" onclick="toggleMaxSp('${k}')">32</button>
        <span id="spReal_${k}" style="font-family:'JetBrains Mono',monospace;font-weight:700;text-align:right;">0</span>
      </div>`).join('');
  }

  STAT_KEYS.forEach(k => {
    const v = Number(slot.sp[k] || 0);
    const lblEl = document.getElementById(`spLbl_${k}`);
    const rangeEl = document.getElementById(`spRange_${k}`);
    const numEl = document.getElementById(`spNum_${k}`);
    const btnEl = document.getElementById(`spBtn_${k}`);
    const realEl = document.getElementById(`spReal_${k}`);
    if (lblEl) lblEl.textContent = formatEditorStatLabel(k);
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

let ocrState = {
  abilityCards: [],
  statusCards: [],
  resolvedSets: [],
  showdownText: '',
  updatedAt: null
};
let ocrSessionScreens = [];
let ocrProcessing = false;
let ocrProgressInfo = null;
let ocrDbRef = null;
let ocrModelLang = null; // null => follow currentUiLang ('ja' -> 'ja', else 'ko')

function getActiveOcrLang() {
  if (ocrModelLang === 'ja' || ocrModelLang === 'ko') return ocrModelLang;
  return currentUiLang === 'ja' ? 'ja' : 'ko';
}

function sanitizeSavedOcrState(raw) {
  if (!raw || typeof raw !== 'object') {
    return { abilityCards: [], statusCards: [], resolvedSets: [], showdownText: '', updatedAt: null };
  }
  return {
    abilityCards: Array.isArray(raw.abilityCards) ? raw.abilityCards : [],
    statusCards: Array.isArray(raw.statusCards) ? raw.statusCards : [],
    resolvedSets: Array.isArray(raw.resolvedSets) ? raw.resolvedSets : [],
    showdownText: typeof raw.showdownText === 'string' ? raw.showdownText : '',
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : null
  };
}

function buildExportableState() {
  return {
    party: currentParty,
    title: document.getElementById('metaTitle').value,
    subtitle: document.getElementById('metaSubtitle').value,
    theme: document.getElementById('themeSelect').value,
    grid: document.getElementById('gridSelect').value,
    viewMode: document.getElementById('viewModeSelect').value,
    lang: document.getElementById('langSelect').value,
    uiLang: currentUiLang,
    ocrLang: ocrModelLang,
    megaMode: document.getElementById('megaModeSelect').value,
    showBanner: document.getElementById('showBannerCheck').checked,
    ocrState: {
      abilityCards: ocrState.abilityCards,
      statusCards: ocrState.statusCards,
      resolvedSets: ocrState.resolvedSets,
      showdownText: ocrState.showdownText,
      updatedAt: ocrState.updatedAt
    }
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

  const normSavedUi = window.APP_I18N.normalizeUiLang(st.uiLang);
  const legacyUi = (st.lang === 'ja' || st.lang === 'en') ? st.lang : window.APP_I18N.detectBrowserUiLang();
  currentUiLang = normSavedUi || legacyUi;
  window.UI_LANG = currentUiLang;
  ocrModelLang = (st.ocrLang === 'ja' || st.ocrLang === 'ko') ? st.ocrLang : null;

  ocrState = sanitizeSavedOcrState(st.ocrState);
  applyUiTranslations();
  renderSheet();
  renderOcrStatusUi();

  const hasSavedScreens = ocrState.abilityCards.length > 0 || ocrState.statusCards.length > 0;
  const hasUnresolvedSet = (ocrState.resolvedSets || []).some((s) => !s.speciesId);
  if (hasSavedScreens && hasUnresolvedSet && window.ChampionsOcr) {
    window.ChampionsOcr.loadDb().then((db) => {
      ocrDbRef = db;
      applyOcrMergeAndRefresh(db, '', { skipToast: true });
    }).catch(() => {});
  }
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

  const autoLang = window.APP_I18N.detectBrowserUiLang();
  currentUiLang = autoLang;
  window.UI_LANG = currentUiLang;
  const langSel = document.getElementById('langSelect');
  if (langSel) langSel.value = autoLang;

  currentParty = [];
  ocrState = sanitizeSavedOcrState(null);
  applyUiTranslations();
  renderSheet();
  renderOcrStatusUi();
}

function showToast(msg, durationMs = 2800) {
  const el = document.getElementById('toastBox');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), durationMs);
}

window.addEventListener('resize', fitStageToViewport);
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const ocrM = document.getElementById('ocrModal');
    if (ocrM && ocrM.classList.contains('open')) {
      closeOcrModal();
      return;
    }
    if (document.body.classList.contains('presentation-mode')) {
      togglePresentationMode();
      return;
    }
  }
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
  if (e.key === 'f' || e.key === 'F') { e.preventDefault(); togglePresentationMode(); }
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

  window.addEventListener('paste', (e) => {
    const imgFiles = extractImageFilesFromTransfer(e.clipboardData);
    if (imgFiles.length > 0) {
      e.preventDefault();
      handleScreenshotFiles(imgFiles);
    }
  });

  const banner = document.getElementById('ocrDropBanner');
  window.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (banner) banner.classList.add('drag-over');
  });
  window.addEventListener('dragleave', (e) => {
    if (!e.relatedTarget && banner) banner.classList.remove('drag-over');
  });
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    if (banner) banner.classList.remove('drag-over');
    const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
    if (!files.length) return;

    const imgFiles = files.filter(isImageFile);
    if (imgFiles.length > 0) {
      handleScreenshotFiles(imgFiles);
      return;
    }

    const txtFile = files.find((f) => /\.txt$/i.test(f.name));
    if (txtFile) {
      const r = new FileReader();
      r.onload = (ev) => {
        const res = parseShowdownPaste(String(ev.target.result || ''), document.getElementById('megaModeSelect').value === 'auto');
        if (res.party.length) {
          lastErrorMsg = '';
          lastErrorKey = '';
          currentParty = res.party;
          document.getElementById('metaTitle').value = txtFile.name.replace(/\.txt$/i, '');
          renderSheet();
          showToast(t('toastFileApplied', { name: txtFile.name }));
        }
      };
      r.readAsText(txtFile, 'utf-8');
    }
  });

  const ocrModal = document.getElementById('ocrModal');
  if (ocrModal) {
    ocrModal.addEventListener('click', (e) => {
      if (e.target === ocrModal) closeOcrModal();
    });
  }
});

// ==================== SCREENSHOT OCR PIPELINE ====================
function isImageFile(file) {
  if (!file) return false;
  return (file.type && file.type.startsWith('image/')) || /\.(png|jpe?g|webp|bmp)$/i.test(file.name || '');
}

function extractImageFilesFromTransfer(dt) {
  if (!dt) return [];
  const out = [];
  if (dt.items && dt.items.length) {
    for (let i = 0; i < dt.items.length; i++) {
      const item = dt.items[i];
      if (item.kind === 'file' && (!item.type || item.type.startsWith('image/'))) {
        const f = item.getAsFile();
        if (f && isImageFile(f)) out.push(f);
      }
    }
  }
  if (!out.length && dt.files && dt.files.length) {
    for (let i = 0; i < dt.files.length; i++) {
      if (isImageFile(dt.files[i])) out.push(dt.files[i]);
    }
  }
  return out;
}

function escapeOcrHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function openOcrModal() {
  renderOcrStatusUi();
  document.getElementById('ocrModal').classList.add('open');
}

function closeOcrModal() {
  document.getElementById('ocrModal').classList.remove('open');
}

function handleScreenshotInputChange(event) {
  const input = event.target;
  const files = input && input.files ? Array.from(input.files).filter(isImageFile) : [];
  if (input) input.value = '';
  if (files.length) handleScreenshotFiles(files);
}

function formatOcrProgress(info) {
  ocrProgressInfo = info;
  renderOcrProgressUi();
}

function getOcrStageDisplay(info) {
  if (!info) return t('ocrWorking');
  if (info.stageKey) {
    const key = `ocr_stage_${info.stageKey}`;
    const translated = t(key);
    if (translated !== key) return translated;
  }
  return info.stage || t('ocrWorking');
}

function renderOcrProgressUi() {
  const wrap = document.getElementById('ocrProgressWrap');
  const txt = document.getElementById('ocrProgressText');
  const pct = document.getElementById('ocrProgressPct');
  const bar = document.getElementById('ocrProgressBar');
  if (!wrap) return;

  if (!ocrProcessing || !ocrProgressInfo) {
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;
  const ratio = Math.max(0, Math.min(1, Number(ocrProgressInfo.ratio) || 0));
  const percent = Math.round(ratio * 100);
  txt.textContent = getOcrStageDisplay(ocrProgressInfo);
  pct.textContent = `${percent}%`;
  bar.style.width = `${percent}%`;
}

function renderOcrStatusUi() {
  renderOcrProgressUi();

  const activeOcrLang = getActiveOcrLang();
  document.querySelectorAll('.ocr-lang-btn').forEach((btn) => {
    const isActive = btn.dataset.ocrLang === activeOcrLang;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });

  const abCount = ocrState.abilityCards.length;
  const stCount = ocrState.statusCards.length;
  const pill = document.getElementById('ocrStatusPill');
  if (pill) {
    if (ocrProcessing) {
      pill.hidden = false;
      pill.className = 'ocr-pill busy';
      pill.textContent = ocrProgressInfo ? getOcrStageDisplay(ocrProgressInfo) : t('ocrPillWorking');
    } else if (abCount > 0 || stCount > 0) {
      pill.hidden = false;
      const warnCount = (ocrState.resolvedSets || []).reduce((acc, s) => acc + (s.warnings && s.warnings.length ? 1 : 0), 0);
      if (abCount > 0 && stCount > 0) {
        pill.className = warnCount > 0 ? 'ocr-pill partial' : 'ocr-pill complete';
        pill.textContent = warnCount > 0
          ? t('ocrPillSavedWarn', { count: warnCount })
          : t('ocrPillComplete');
      } else {
        pill.className = 'ocr-pill partial';
        pill.textContent = abCount > 0 ? t('ocrPillWaitStatus') : t('ocrPillWaitAbility');
      }
    } else {
      pill.hidden = true;
    }
  }

  const abBox = document.getElementById('ocrAbilityBox');
  const abTxt = document.getElementById('ocrAbilityState');
  if (abBox && abTxt) {
    abBox.classList.toggle('saved', abCount > 0);
    abTxt.textContent = abCount > 0 ? t('ocrSavedSlots', { count: abCount }) : t('ocrUnregistered');
  }

  const stBox = document.getElementById('ocrStatusBox');
  const stTxt = document.getElementById('ocrStatusState');
  if (stBox && stTxt) {
    stBox.classList.toggle('saved', stCount > 0);
    stTxt.textContent = stCount > 0 ? t('ocrSavedSlots', { count: stCount }) : t('ocrUnregistered');
  }

  const clearBtn = document.getElementById('ocrClearBtn');
  if (clearBtn) {
    clearBtn.style.display = (abCount > 0 || stCount > 0 || ocrSessionScreens.length > 0) ? '' : 'none';
  }

  const strip = document.getElementById('ocrThumbsStrip');
  if (strip) {
    if (!ocrSessionScreens.length) {
      strip.hidden = true;
      strip.innerHTML = '';
    } else {
      strip.hidden = false;
      strip.innerHTML = ocrSessionScreens.map((sc) => `
        <div class="ocr-thumb-card">
          <img src="${sc.previewUrl}" alt="${escapeOcrHtml(sc.name)}" />
          <div class="ocr-thumb-meta">
            <div class="ocr-tab-switch">
              <button type="button" class="${sc.tabType === 'ability' ? 'active' : ''}" onclick="toggleOcrSessionScreenTab('${escapeOcrHtml(sc.id)}', 'ability')">${escapeOcrHtml(t('ocrTabBtnAbility'))}</button>
              <button type="button" class="${sc.tabType === 'status' ? 'active' : ''}" onclick="toggleOcrSessionScreenTab('${escapeOcrHtml(sc.id)}', 'status')">${escapeOcrHtml(t('ocrTabBtnStatus'))}</button>
            </div>
            <button type="button" class="btn" style="padding:3px 7px;font-size:11px;" onclick="removeOcrSessionScreen('${escapeOcrHtml(sc.id)}')">${escapeOcrHtml(t('ocrRemoveBtn'))}</button>
          </div>
        </div>
      `).join('');
    }
  }

  const summaryBox = document.getElementById('ocrSummaryBox');
  if (summaryBox) {
    const sets = ocrState.resolvedSets || [];
    if (!sets.length) {
      summaryBox.hidden = true;
      summaryBox.innerHTML = '';
    } else {
      summaryBox.hidden = false;
      summaryBox.innerHTML = sets.map((s) => {
        const hasWarn = Array.isArray(s.warnings) && s.warnings.length > 0;
        const dexSp = s.speciesId ? D.dex[s.speciesId] : null;
        const speciesTitle = dexSp
          ? window.APP_I18N.pickNameForUi(dexSp)
          : (currentUiLang === 'en' ? (s.speciesName || s.speciesKo) : (s.speciesKo || s.speciesName)) || t('ocrUnknownSpecies');
        const spTotal = Object.values(s.sp || {}).reduce((a, b) => a + (b || 0), 0);
        const natureObj = NATURES[s.nature];
        const natureDisp = natureObj ? window.APP_I18N.pickNameForUi(natureObj, s.nature) : (s.nature || 'Serious');
        const natLabel = currentUiLang === 'ko' ? (s.nature || natureDisp) : natureDisp;
        const statusText = hasWarn
          ? s.warnings.join(' · ')
          : t('ocrVerifiedRow', { nature: natLabel, sp: spTotal });
        return `
          <div class="ocr-summary-row ${hasWarn ? 'warn' : 'ok'}">
            <strong><span class="ocr-slot-badge">${hasWarn ? '!' : '✓'}</span> #${s.slot + 1} ${escapeOcrHtml(speciesTitle)}</strong>
            <span>${escapeOcrHtml(statusText)}</span>
          </div>`;
      }).join('');
    }
  }

  const prevWrap = document.getElementById('ocrPreviewWrap');
  const prevText = document.getElementById('ocrShowdownPreview');
  if (prevWrap && prevText) {
    if (ocrState.showdownText) {
      prevWrap.hidden = false;
      prevText.value = ocrState.showdownText;
    } else {
      prevWrap.hidden = true;
      prevText.value = '';
    }
  }
}

function hydrateExistingMovesOntoStatusSets(sets, db) {
  if (!currentParty.length || !db || typeof POKEMON_DATA === 'undefined') return;
  const dexItems = POKEMON_DATA.items || {};
  const dexAbils = POKEMON_DATA.abilities || {};
  const dexMoves = POKEMON_DATA.moves || {};

  for (let i = 0; i < sets.length; i++) {
    const s = sets[i];
    const prev = currentParty[i];
    if (!s || !prev || !s.speciesId || s.speciesId !== prev.speciesId) continue;

    if (!s.itemName && prev.itemId && dexItems[prev.itemId]) {
      s.itemId = prev.itemId;
      s.itemName = dexItems[prev.itemId].name;
      s.itemKo = dexItems[prev.itemId].ko || s.itemName;
    }
    if (!s.abilityName && prev.abilityId && dexAbils[prev.abilityId]) {
      s.abilityId = prev.abilityId;
      s.abilityName = dexAbils[prev.abilityId].name;
      s.abilityKo = dexAbils[prev.abilityId].ko || s.abilityName;
    }
    if ((!s.moves || s.moves.every((m) => !m.name)) && Array.isArray(prev.moves)) {
      s.moves = prev.moves.map((mvId) => {
        const mv = mvId ? dexMoves[mvId] : null;
        return mv
          ? { id: mvId, name: mv.name, ko: mv.ko || mv.name, ocr: '', score: 1 }
          : { id: '', name: '', ko: '', ocr: '', score: 0 };
      });
    }
  }
}

function applyOcrMergeAndRefresh(db, customToast, opts = {}) {
  const abilityScreens = ocrState.abilityCards.length ? [ocrState.abilityCards] : [];
  const statusScreens = ocrState.statusCards.length ? [ocrState.statusCards] : [];

  if (!abilityScreens.length && !statusScreens.length) {
    ocrState.resolvedSets = [];
    ocrState.showdownText = '';
    ocrState.updatedAt = null;
    saveStateToStorage();
    renderOcrStatusUi();
    return;
  }

  const sets = window.ChampionsOcr.mergeAndResolveTeam(abilityScreens, statusScreens, db, { uiLang: currentUiLang });
  if (!abilityScreens.length && statusScreens.length && currentParty.length) {
    hydrateExistingMovesOntoStatusSets(sets, db);
  }

  const showdown = window.ChampionsOcr.formatTeamShowdown(sets, db, {
    includeLevel50: true,
    includeGender: true,
    statMode: 'champions'
  });

  ocrState.resolvedSets = sets;
  ocrState.showdownText = showdown;
  ocrState.updatedAt = Date.now();

  if (!opts.skipPartyReset) {
    const pasteEl = document.getElementById('pasteInput');
    if (pasteEl) pasteEl.value = showdown;

    const megaAuto = document.getElementById('megaModeSelect').value === 'auto';
    const parsed = parseShowdownPaste(showdown, megaAuto);

    if (parsed.party.length > 0) {
      lastErrorKey = '';
      lastErrorMsg = '';
      currentParty = parsed.party;
    }
    renderSheet();
  } else {
    saveStateToStorage();
  }
  renderOcrStatusUi();

  if (opts.skipToast) return;
  if (customToast) {
    showToast(customToast);
    return;
  }

  const hasAb = ocrState.abilityCards.length > 0;
  const hasSt = ocrState.statusCards.length > 0;
  const partyLen = currentParty.length || sets.length;
  if (hasAb && hasSt) {
    const warnSlots = sets.filter((s) => s.warnings && s.warnings.length > 0).length;
    showToast(
      warnSlots > 0
        ? t('toastOcrMergedWarn', { count: partyLen, warn: warnSlots })
        : t('toastOcrMergedOk', { count: partyLen }),
    );
  } else if (hasAb) {
    showToast(t('toastOcrOnlyAb', { count: partyLen }));
  } else {
    showToast(t('toastOcrOnlySt', { count: partyLen }));
  }
}

async function handleScreenshotFiles(fileList) {
  if (!window.ChampionsOcr) {
    showToast(t('toastOcrNotLoaded'));
    return;
  }
  if (ocrProcessing) {
    showToast(t('toastOcrBusy'));
    return;
  }

  const files = Array.from(fileList || []).filter(isImageFile);
  if (!files.length) return;

  ocrProcessing = true;
  formatOcrProgress({ stage: t('ocrStagePrepare'), ratio: 0.05 });
  renderOcrStatusUi();

  const seenTabsInBatch = new Set();
  let teamResetByNewParty = false;

  try {
    for (let idx = 0; idx < files.length; idx++) {
      const file = files[idx];
      formatOcrProgress({
        stage: t('ocrStageBatch', { idx: idx + 1, total: files.length }),
        ratio: Math.min(0.95, 0.1 + (idx / files.length) * 0.8),
      });
      renderOcrStatusUi();

      const loaded = await window.ChampionsOcr.loadImageFileToCanvas(file);
      const res = await window.ChampionsOcr.analyzeAndRecognizeCanvas(loaded.canvas, {
        ocrLang: getActiveOcrLang(),
        onProgress: formatOcrProgress,
      });
      ocrDbRef = res.db;

      const tabType = res.tabType;
      const newCards = tabType === 'ability' ? res.abilityCards : res.statusCards;
      const otherTab = tabType === 'ability' ? 'status' : 'ability';
      const otherCards = otherTab === 'ability' ? ocrState.abilityCards : ocrState.statusCards;

      if (!seenTabsInBatch.has(otherTab) && otherCards.length > 0) {
        if (!window.ChampionsOcr.areScreensCompatibleTeam(newCards, otherCards, res.db)) {
          if (otherTab === 'ability') ocrState.abilityCards = [];
          else ocrState.statusCards = [];
          ocrSessionScreens = ocrSessionScreens.filter((s) => s.tabType !== otherTab);
          teamResetByNewParty = true;
        }
      }

      seenTabsInBatch.add(tabType);
      if (tabType === 'ability') ocrState.abilityCards = newCards;
      else ocrState.statusCards = newCards;

      ocrSessionScreens = ocrSessionScreens.filter((s) => s.tabType !== tabType);
      ocrSessionScreens.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: file.name || `${tabType}.png`,
        tabType,
        canvas: loaded.canvas,
        previewUrl: loaded.previewUrl,
        abilityCards: res.abilityCards,
        statusCards: res.statusCards,
      });
    }

    if (ocrDbRef) {
      const note = teamResetByNewParty ? t('toastOcrNewPartyReset') : '';
      applyOcrMergeAndRefresh(ocrDbRef, note || undefined);
    }
  } catch (err) {
    console.error('[ChampionsOCR]', err);
    showToast(err && err.message ? err.message : t('toastOcrGenericError'));
  } finally {
    ocrProcessing = false;
    ocrProgressInfo = null;
    renderOcrStatusUi();
  }
}

async function toggleOcrSessionScreenTab(screenId, nextTab) {
  if (ocrProcessing) return;
  const idx = ocrSessionScreens.findIndex((s) => s.id === screenId);
  if (idx === -1) return;
  const sc = ocrSessionScreens[idx];
  if (sc.tabType === nextTab) return;

  ocrProcessing = true;
  const tabWord = t(nextTab === 'ability' ? 'ocrTabWordAbility' : 'ocrTabWordStatus');
  formatOcrProgress({ stage: t('ocrStageRetab', { tab: tabWord }), ratio: 0.4 });
  renderOcrStatusUi();

  try {
    const res = await window.ChampionsOcr.analyzeAndRecognizeCanvas(sc.canvas, {
      overrideTab: nextTab,
      ocrLang: getActiveOcrLang(),
      onProgress: formatOcrProgress,
    });
    ocrDbRef = res.db;

    const oldTab = sc.tabType;
    sc.tabType = nextTab;
    sc.abilityCards = res.abilityCards;
    sc.statusCards = res.statusCards;

    if (oldTab === 'ability') ocrState.abilityCards = [];
    else ocrState.statusCards = [];

    ocrSessionScreens = ocrSessionScreens.filter((item) => item.id === sc.id || item.tabType !== nextTab);

    if (nextTab === 'ability') ocrState.abilityCards = res.abilityCards;
    else ocrState.statusCards = res.statusCards;

    applyOcrMergeAndRefresh(res.db);
  } catch (err) {
    console.error('[ChampionsOCR]', err);
    showToast(err && err.message ? err.message : t('toastOcrRetabError'));
  } finally {
    ocrProcessing = false;
    ocrProgressInfo = null;
    renderOcrStatusUi();
  }
}

async function removeOcrSessionScreen(screenId) {
  const sc = ocrSessionScreens.find((s) => s.id === screenId);
  if (!sc) return;
  ocrSessionScreens = ocrSessionScreens.filter((s) => s.id !== screenId);
  if (sc.tabType === 'ability') ocrState.abilityCards = [];
  else ocrState.statusCards = [];

  if (ocrState.abilityCards.length || ocrState.statusCards.length) {
    const db = ocrDbRef || await window.ChampionsOcr.loadDb();
    ocrDbRef = db;
    applyOcrMergeAndRefresh(db, t('toastOcrScreenRemoved'));
  } else {
    ocrState.resolvedSets = [];
    ocrState.showdownText = '';
    ocrState.updatedAt = null;
    saveStateToStorage();
    renderOcrStatusUi();
  }
}

function clearOcrState() {
  ocrSessionScreens = [];
  ocrModelLang = null;
  ocrState = sanitizeSavedOcrState(null);
  saveStateToStorage();
  renderOcrStatusUi();
  showToast(t('toastOcrCleared'));
}

async function setOcrModelLanguage(nextLang) {
  if (ocrProcessing) {
    showToast(t('toastOcrBusy'));
    return;
  }
  const norm = nextLang === 'ja' ? 'ja' : 'ko';
  const prev = getActiveOcrLang();
  ocrModelLang = norm;
  renderOcrStatusUi();
  saveStateToStorage();

  if (prev === norm || !ocrSessionScreens.length || !window.ChampionsOcr) return;

  ocrProcessing = true;
  formatOcrProgress({ stage: t('ocrStageRelang'), ratio: 0.15 });
  renderOcrStatusUi();

  try {
    ocrState.abilityCards = [];
    ocrState.statusCards = [];
    for (const sc of ocrSessionScreens) {
      const res = await window.ChampionsOcr.analyzeAndRecognizeCanvas(sc.canvas, {
        overrideTab: sc.tabType,
        ocrLang: norm,
        onProgress: formatOcrProgress,
      });
      ocrDbRef = res.db;
      sc.abilityCards = res.abilityCards;
      sc.statusCards = res.statusCards;
      if (sc.tabType === 'ability') ocrState.abilityCards = res.abilityCards;
      else ocrState.statusCards = res.statusCards;
    }
    if (ocrDbRef) {
      applyOcrMergeAndRefresh(
        ocrDbRef,
        t('toastOcrRelangDone', { lang: norm === 'ja' ? 'JP' : 'KO / EN' }),
      );
    }
  } catch (err) {
    console.error('[ChampionsOCR]', err);
    showToast(err && err.message ? err.message : t('toastOcrGenericError'));
  } finally {
    ocrProcessing = false;
    ocrProgressInfo = null;
    renderOcrStatusUi();
  }
}

function copyOcrShowdownText() {
  const text = ocrState.showdownText || exportToShowdownPaste(currentParty);
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => showToast(t('toastCopied')));
}

function openPasteWithOcrText() {
  const text = ocrState.showdownText || exportToShowdownPaste(currentParty);
  closeOcrModal();
  openPasteModal();
  if (text) {
    document.getElementById('pasteInput').value = text;
  }
}
