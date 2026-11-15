import * as ort from './ort/ort.wasm.bundle.min.mjs';

const EXTRA_ASCII = new Set(
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 -.'+:".split(''),
);

function buildCtcVocab(dictTxt) {
  const lines = dictTxt.split(/\r?\n/);
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  const chars = ['blank', ...lines, ' '];

  const digitIndices = [0];
  const textIndices = [0];

  for (let i = 1; i < chars.length; i++) {
    const ch = chars[i];
    if (ch.length !== 1) continue;
    if (ch >= '0' && ch <= '9') {
      digitIndices.push(i);
      textIndices.push(i);
    } else if ((ch >= '\uac00' && ch <= '\ud7a3') || EXTRA_ASCII.has(ch)) {
      textIndices.push(i);
    }
  }

  return { chars, digitIndices, textIndices };
}

function decodeCtc(logits, seqLen, numClasses, vocab, digitsOnly) {
  const allowed = digitsOnly ? vocab.digitIndices : vocab.textIndices;
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

let session = null;
let vocab = null;

self.onmessage = async (event) => {
  const msg = event.data;

  try {
    if (msg.type === 'init') {
      if (session) {
        self.postMessage({ type: 'ready' });
        return;
      }

      ort.env.wasm.numThreads = 1;
      ort.env.wasm.wasmPaths = new URL('ort/', msg.baseUrl).href;

      const modelUrl = new URL('models/rec.onnx', msg.baseUrl).href;
      const dictUrl = new URL('models/dict.txt', msg.baseUrl).href;

      self.postMessage({ type: 'progress', stage: 'OCR 모델 및 사전 다운로드 중...', ratio: 0.15 });

      const [modelRes, dictRes] = await Promise.all([fetch(modelUrl), fetch(dictUrl)]);
      if (!modelRes.ok) throw new Error(`모델 로드 실패: ${modelRes.status}`);
      if (!dictRes.ok) throw new Error(`사전 로드 실패: ${dictRes.status}`);

      const [modelBuf, dictTxt] = await Promise.all([modelRes.arrayBuffer(), dictRes.text()]);

      self.postMessage({ type: 'progress', stage: 'ONNX Runtime WASM 초기화 중...', ratio: 0.75 });

      vocab = buildCtcVocab(dictTxt);
      session = await ort.InferenceSession.create(new Uint8Array(modelBuf), {
        executionProviders: ['wasm'],
      });

      self.postMessage({ type: 'ready' });
      return;
    }

    if (msg.type === 'recognize') {
      if (!session || !vocab) throw new Error('OCR 모델이 초기화되지 않았습니다.');

      const results = {};
      const inputName = session.inputNames[0];
      const outputName = session.outputNames[0];
      const total = msg.crops.length;

      for (let i = 0; i < total; i++) {
        const crop = msg.crops[i];
        const tensor = new ort.Tensor('float32', crop.tensor, [1, 3, crop.height, crop.width]);
        const outputs = await session.run({ [inputName]: tensor });
        const outTensor = outputs[outputName];
        const [, seqLen, numClasses] = outTensor.dims;
        results[crop.id] = decodeCtc(
          outTensor.data,
          seqLen,
          numClasses,
          vocab,
          crop.digitsOnly,
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
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
