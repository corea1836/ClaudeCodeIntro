// index.html을 jsdom에 띄우고, 시간·랜덤·애니메이션·canvas를 테스트가 제어할 수 있게 바꿔 끼운다.
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const TAU = Math.PI * 2;
const POINTER_ANGLE = -Math.PI / 2;
const mod = (a, m) => ((a % m) + m) % m;

// 2026-10-05(월) 정오, 로컬 시간
export const NOW = new Date(2026, 9, 5, 12, 0, 0);
export const daysAgo = n => {
  const d = new Date(NOW);
  d.setDate(d.getDate() - n);
  const pad = v => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
export const TODAY = daysAgo(0);

// 그려진 명령을 마지막 clearRect 이후 기준으로 기록하는 가짜 2D 컨텍스트
function createCanvasContext() {
  let frame = [];
  const noop = () => {};
  return {
    get frame() { return frame; },
    clearRect() { frame = []; },
    arc(x, y, r, start, end) { frame.push({ op: 'arc', start, end }); },
    rotate(angle) { frame.push({ op: 'rotate', angle }); },
    fillText(text) { frame.push({ op: 'text', text }); },
    measureText(text) { return { width: text.length * 10 }; },
    setTransform: noop, beginPath: noop, moveTo: noop, closePath: noop,
    fill: noop, stroke: noop, save: noop, restore: noop, translate: noop,
  };
}

function freezeDate(window, now) {
  const RealDate = window.Date;
  const fixed = now.getTime();
  window.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [fixed])); }
    static now() { return fixed; }
  };
}

/**
 * @param {object} [options]
 * @param {Record<string, unknown>} [options.storage] localStorage 초기값 (문자열이 아니면 JSON으로 저장)
 * @param {() => number} [options.random] Math.random 대체
 * @param {boolean} [options.confirmAnswer] window.confirm 응답
 */
export function loadApp({ storage = {}, random = () => 0.5, confirmAnswer = true } = {}) {
  const ctx = createCanvasContext();
  let rafQueue = [];
  let clock = 1000;

  const dom = new JSDOM(HTML, {
    url: 'http://localhost/',
    runScripts: 'dangerously',
    beforeParse(window) {
      window.localStorage.clear();
      for (const [key, value] of Object.entries(storage)) {
        window.localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
      }
      freezeDate(window, NOW);
      window.Math.random = random;
      window.matchMedia = media => ({ matches: false, media, addEventListener() {}, removeEventListener() {} });
      window.requestAnimationFrame = cb => rafQueue.push(cb);
      window.performance.now = () => clock;
      window.confirm = () => confirmAnswer;
      Object.defineProperty(window.HTMLCanvasElement.prototype, 'clientWidth', { get: () => 340 });
      window.HTMLCanvasElement.prototype.getContext = () => ctx;
    },
  });
  const { window } = dom;
  const { document } = window;
  const $ = sel => document.querySelector(sel);
  const $$ = sel => [...document.querySelectorAll(sel)];
  const findButton = (sel, text) => {
    const b = $$(sel).find(el => el.textContent.includes(text));
    if (!b) throw new Error(`${sel} 중 "${text}" 버튼이 없음`);
    return b;
  };

  // 원판에 실제로 그려진 칸과 글자
  function wheel() {
    const frame = ctx.frame;
    const firstText = frame.findIndex(c => c.op === 'rotate');
    const segments = frame.slice(0, firstText === -1 ? frame.length : firstText).filter(c => c.op === 'arc');
    const labels = [];
    frame.forEach((c, i) => {
      if (c.op === 'rotate' && frame[i + 1]?.op === 'text') labels.push({ angle: c.angle, text: frame[i + 1].text });
    });
    return { segments, labels };
  }

  return {
    window,
    document,
    $,
    $$,
    tab: label => findButton('.tab', label),
    chip: cat => findButton('.chip', cat),
    slot: label => findButton('.slot', label),
    spinButton: () => $('#spin'),
    confirmButton: () => $('#confirm'),
    resetButton: () => $('#reset'),
    message: () => ({ text: $('#message').textContent, className: $('#message').className }),
    slotNames: () => Object.fromEntries($$('.slot').map(s => [s.querySelector('.label').textContent, s.querySelector('.name').textContent])),
    historyItems: () => $$('#history li').map(li => li.textContent),
    stored: key => JSON.parse(window.localStorage.getItem(key)),
    storageSnapshot: () => Object.fromEntries(Object.keys(window.localStorage).map(k => [k, window.localStorage.getItem(k)])),
    setRandom: fn => { window.Math.random = fn; },
    wheelLabels: () => wheel().labels.map(l => l.text),

    // 포인터(12시)가 가리키는 칸에 그려진 글자. 그려진 기하만 보고 판단한다.
    labelAtPointer() {
      const { segments, labels } = wheel();
      const hit = segments.filter(s => mod(POINTER_ANGLE - s.start, TAU) < s.end - s.start);
      if (hit.length !== 1) throw new Error(`포인터에 걸친 칸이 ${hit.length}개`);
      const [seg] = hit;
      const inSeg = labels.filter(l => mod(l.angle - seg.start, TAU) < seg.end - seg.start);
      if (inSeg.length !== 1) throw new Error(`포인터 칸 안의 글자가 ${inSeg.length}개`);
      return inSeg[0].text;
    },

    isAnimating: () => rafQueue.length > 0,
    // 회전 애니메이션을 끝까지 진행시킨다
    finishSpin() {
      for (let guard = 0; rafQueue.length; guard++) {
        if (guard > 1000) throw new Error('회전 애니메이션이 끝나지 않음');
        clock += 50;
        const callbacks = rafQueue;
        rafQueue = [];
        callbacks.forEach(cb => cb(clock));
      }
    },
    spin() {
      $('#spin').click();
      this.finishSpin();
    },
    close: () => window.close(),
  };
}
