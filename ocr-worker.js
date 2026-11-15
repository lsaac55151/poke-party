import * as ort from './ort/ort.wasm.bundle.min.mjs';

const EXTRA_ASCII = new Set(
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 -.'+:".split(''),
);
const JA_ALLOWED_ASCII = new Set('ADGRVXYZ0123456789 '.split(''));
const JA_EXTRA_CHARS = new Set(['ー', '・', '♀', '♂', '〜', '～', '%', '(', ')']);
const JA_ABILITY_EXCLUDED = new Set(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '%', '(', ')', '♀', '♂']);

function normalizeOcrLang(lang) {
  return String(lang || '').toLowerCase() === 'ja' ? 'ja' : 'ko';
}

function isAllowedTextChar(ch, mode) {
  if (ch >= '0' && ch <= '9') return true;
  if (mode === 'ja') {
    return (
      JA_ALLOWED_ASCII.has(ch) ||
      (ch >= '\u3040' && ch <= '\u309f') ||
      (ch >= '\u30a0' && ch <= '\u30ff') ||
      JA_EXTRA_CHARS.has(ch)
    );
  }
  if (EXTRA_ASCII.has(ch)) return true;
  return ch >= '\uac00' && ch <= '\ud7a3';
}

function buildCtcVocab(dictTxt, mode = 'ko') {
  const lines = dictTxt.split(/\r?\n/);
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  const chars = ['blank', ...lines, ' '];

  const digitIndices = [0];
  const textIndices = [0];
  const abilityIndices = mode === 'ja' ? [0] : textIndices;

  for (let i = 1; i < chars.length; i++) {
    const ch = chars[i];
    if (ch.length !== 1) continue;
    if (ch >= '0' && ch <= '9') {
      digitIndices.push(i);
      textIndices.push(i);
    } else if (isAllowedTextChar(ch, mode)) {
      textIndices.push(i);
      if (mode === 'ja' && !JA_ABILITY_EXCLUDED.has(ch) && !(ch >= 'A' && ch <= 'Z')) {
        abilityIndices.push(i);
      }
    }
  }

  return { chars, digitIndices, textIndices, abilityIndices };
}

function clampPadCropForJa(crop, minWidth = 240, padLeft = 4) {
  if (crop.digitsOnly || crop.width + padLeft >= minWidth) return crop;
  const height = crop.height;
  const w0 = crop.width;
  const src = crop.tensor;
  const plane0 = w0 * height;
  const w1 = minWidth;
  const dst = new Float32Array(3 * w1 * height);
  const plane1 = w1 * height;
  for (let y = 0; y < height; y++) {
    const row0 = y * w0;
    const edgeL = row0;
    const edgeR = row0 + (w0 - 1);
    const row1 = y * w1;
    for (let x = 0; x < w1; x++) {
      const sx = x < padLeft ? edgeL : (x < padLeft + w0 ? row0 + (x - padLeft) : edgeR);
      const di = row1 + x;
      dst[di] = src[sx];
      dst[plane1 + di] = src[plane0 + sx];
      dst[2 * plane1 + di] = src[2 * plane0 + sx];
    }
  }
  return { ...crop, width: w1, tensor: dst };
}

function decodeCtc(logits, seqLen, numClasses, vocab, allowedIndices) {
  const allowed = Array.isArray(allowedIndices)
    ? allowedIndices
    : (allowedIndices ? vocab.digitIndices : vocab.textIndices);
  const out = [];
  let prev = 0;

  for (let t = 0; t < seqLen; t++) {
    const base = t * numClasses;
    let bestIdx = 0;
    let bestVal = -Infinity;

    for (let k = 0; k < allowed.length; k++) {
      const idx = allowed[k];
      if (idx >= numClasses) continue;
      const val = logits[base + idx];
      if (val > bestVal) {
        bestVal = val;
        bestIdx = idx;
      }
    }

    if (bestIdx !== 0 && bestIdx !== prev && bestIdx < vocab.chars.length) {
      out.push(vocab.chars[bestIdx]);
    }
    prev = bestIdx;
  }

  return out.join('').trim();
}

const MODEL_SPECS = {
  ko: { modelPath: 'models/rec.onnx', dictPath: 'models/dict.txt' },
  ja: { modelPath: 'models/rec-ja.onnx?v=20261115q', dictPath: 'models/dict-ja.txt?v=20261115q' },
};
const sessions = new Map();
let ortConfigured = false;

self.onmessage = async (event) => {
  const msg = event.data;

  try {
    if (msg.type === 'init') {
      const ocrLang = normalizeOcrLang(msg.ocrLang);
      if (sessions.has(ocrLang)) {
        self.postMessage({ type: 'ready', ocrLang });
        return;
      }

      if (!ortConfigured) {
        ort.env.wasm.numThreads = 1;
        ort.env.wasm.wasmPaths = new URL('ort/', msg.baseUrl).href;
        ortConfigured = true;
      }

      const spec = MODEL_SPECS[ocrLang];
      const modelUrl = new URL(spec.modelPath, msg.baseUrl).href;
      const dictUrl = new URL(spec.dictPath, msg.baseUrl).href;

      self.postMessage({ type: 'progress', stageKey: 'loading_ocr_data', stage: 'OCR 인식 데이터 불러오는 중...', ratio: 0.15, ocrLang });

      const [modelRes, dictRes] = await Promise.all([fetch(modelUrl), fetch(dictUrl)]);
      if (!modelRes.ok) throw new Error(`모델 로드 실패: ${modelRes.status}`);
      if (!dictRes.ok) throw new Error(`사전 로드 실패: ${dictRes.status}`);

      const [modelBuf, dictTxt] = await Promise.all([modelRes.arrayBuffer(), dictRes.text()]);

      self.postMessage({ type: 'progress', stageKey: 'preparing_engine', stage: '브라우저 OCR 엔진 준비 중...', ratio: 0.75, ocrLang });

      const vocab = buildCtcVocab(dictTxt, ocrLang);
      const session = await ort.InferenceSession.create(new Uint8Array(modelBuf), {
        executionProviders: ['wasm'],
      });

      sessions.set(ocrLang, { session, vocab });
      self.postMessage({ type: 'ready', ocrLang });
      return;
    }

    if (msg.type === 'recognize') {
      const ocrLang = normalizeOcrLang(msg.ocrLang);
      const entry = sessions.get(ocrLang);
      if (!entry) throw new Error('OCR 모델이 초기화되지 않았습니다.');

      const { session, vocab } = entry;
      const results = {};
      const inputName = session.inputNames[0];
      const outputName = session.outputNames[0];
      const total = msg.crops.length;

      for (let i = 0; i < total; i++) {
        const crop = msg.crops[i];
        const prepared = ocrLang === 'ja' ? clampPadCropForJa(crop, 240, 4) : crop;
        const tensor = new ort.Tensor('float32', prepared.tensor, [1, 3, prepared.height, prepared.width]);
        const outputs = await session.run({ [inputName]: tensor });
        const outTensor = outputs[outputName];
        const [, seqLen, numClasses] = outTensor.dims;
        const allowed = prepared.digitsOnly
          ? vocab.digitIndices
          : (ocrLang === 'ja' && typeof crop.id === 'string' && crop.id.endsWith(':ability'))
            ? vocab.abilityIndices
            : vocab.textIndices;
        results[crop.id] = decodeCtc(
          outTensor.data,
          seqLen,
          numClasses,
          vocab,
          allowed,
        );
      }

      self.postMessage({
        type: 'result',
        requestId: msg.requestId,
        results,
      });
    }
  } catch (err) {
    self.postMessage({
      type: 'error',
      requestId: msg && 'requestId' in msg ? msg.requestId : undefined,
      ocrLang: msg && msg.ocrLang ? normalizeOcrLang(msg.ocrLang) : undefined,
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
