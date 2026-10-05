import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, daysAgo, TODAY } from './load-app.js';

const HISTORY_KEY = 'mealRoulette.history';
const FILTERS_KEY = 'mealRoulette.filters';
const CATEGORIES = ['한식', '중식', '일식', '양식', '분식'];

let app;
const open = options => (app = loadApp(options));
afterEach(() => app?.close());

describe('초기 화면', () => {
  it('아침 탭, 전체 카테고리, 빈 식단으로 시작한다', () => {
    open();
    assert.deepEqual(app.$$('.tab').map(t => t.getAttribute('aria-selected')), ['true', 'false', 'false']);
    assert.ok(app.$$('.chip').every(c => c.getAttribute('aria-pressed') === 'true'));
    assert.deepEqual(app.slotNames(), { 아침: '아직 안 뽑았어요', 점심: '아직 안 뽑았어요', 저녁: '아직 안 뽑았어요' });
    assert.equal(app.confirmButton().disabled, true);
    assert.equal(app.resetButton().disabled, true);
    assert.deepEqual(app.historyItems(), ['아직 확정한 식단이 없어요.']);
  });

  it('원판의 이웃한 칸은 카테고리가 겹치지 않게 번갈아 놓인다', () => {
    open();
    for (const meal of ['아침', '점심', '저녁']) {
      app.tab(meal).click();
      const cats = app.window.eval('JSON.stringify(state.items.map(i => i.cat))');
      const list = JSON.parse(cats);
      list.slice(1).forEach((cat, i) => assert.notEqual(cat, list[i], `${meal} ${i}번째 칸과 다음 칸이 같은 카테고리`));
    }
  });

  it('localStorage 값이 깨져 있어도 빈 기록과 전체 필터로 시작한다', () => {
    open({ storage: { [HISTORY_KEY]: 'not json{', [FILTERS_KEY]: '"oops"' } });
    assert.deepEqual(app.historyItems(), ['아직 확정한 식단이 없어요.']);
    assert.equal(app.wheelLabels().length, 15);

    app.close();
    open({ storage: { [HISTORY_KEY]: { not: 'array' } } });
    assert.deepEqual(app.historyItems(), ['아직 확정한 식단이 없어요.']);
  });
});

describe('끼니 탭', () => {
  it('탭을 바꾸면 그 끼니의 메뉴로 원판이 바뀐다', () => {
    open();
    assert.ok(app.wheelLabels().includes('토스트'));
    app.tab('저녁').click();
    assert.equal(app.tab('저녁').getAttribute('aria-selected'), 'true');
    assert.ok(app.wheelLabels().includes('삼겹살'));
    assert.ok(!app.wheelLabels().includes('토스트'));
  });

  it('식단 카드의 칸을 누르면 해당 끼니 탭으로 이동한다', () => {
    open();
    app.slot('점심').click();
    assert.equal(app.tab('점심').getAttribute('aria-selected'), 'true');
    assert.ok(app.wheelLabels().includes('김치찌개'));
  });
});

describe('카테고리 필터', () => {
  it('끈 카테고리는 원판에서 빠지고 선택이 저장된다', () => {
    open();
    app.chip('중식').click();
    assert.equal(app.chip('중식').getAttribute('aria-pressed'), 'false');
    assert.deepEqual(app.stored(FILTERS_KEY), ['한식', '일식', '양식', '분식']);
    assert.ok(!app.wheelLabels().some(n => ['만두', '샤오롱바오', '중국식 죽'].includes(n)));

    // 다시 켜면 원래 순서대로 들어간다
    app.chip('중식').click();
    assert.deepEqual(app.stored(FILTERS_KEY), CATEGORIES);
  });

  it('하나만 남기면 그 카테고리 메뉴만 나온다', () => {
    open({ storage: { [FILTERS_KEY]: ['중식'] } });
    assert.deepEqual(app.wheelLabels().sort(), ['만두', '샤오롱바오', '중국식 죽'].sort());
  });

  it('모두 끄면 SPIN이 잠기고 안내가 나온다', () => {
    open({ storage: { [FILTERS_KEY]: [] } });
    assert.equal(app.spinButton().disabled, true);
    assert.equal(app.message().className, 'message warn');
    assert.match(app.message().text, /아침 메뉴가 없어요/);
  });

  it('저장된 필터에서 알 수 없는 카테고리는 버린다', () => {
    open({ storage: { [FILTERS_KEY]: ['중식', '라면'] } });
    assert.deepEqual(app.$$('.chip[aria-pressed="true"]').map(c => c.textContent), ['중식']);
  });
});

describe('후보 제외 규칙', () => {
  const history = [
    { date: daysAgo(1), breakfast: '토스트', lunch: '김치찌개', dinner: '피자' },
    { date: daysAgo(3), breakfast: '김밥', lunch: '짜장면', dinner: '초밥' },
    { date: daysAgo(4), breakfast: '누룽지', lunch: '짬뽕', dinner: '마라탕' },
  ];

  it('어제부터 사흘 전까지 확정한 메뉴는 빠지고, 나흘 전 메뉴는 다시 나온다', () => {
    open({ storage: { [HISTORY_KEY]: history } });
    const breakfast = app.wheelLabels();
    assert.ok(!breakfast.includes('토스트'));
    assert.ok(!breakfast.includes('김밥'));
    assert.ok(breakfast.includes('누룽지'));

    app.tab('점심').click();
    const lunch = app.wheelLabels();
    assert.ok(!lunch.includes('김치찌개'));
    assert.ok(!lunch.includes('짜장면'));
    assert.ok(lunch.includes('짬뽕'));
  });

  it('제외 중인 날짜의 기록에만 "제외 중" 배지를 붙인다', () => {
    open({ storage: { [HISTORY_KEY]: history } });
    const items = app.historyItems();
    assert.match(items[0], /제외 중/);
    assert.match(items[1], /제외 중/);
    assert.doesNotMatch(items[2], /제외 중/);
  });

  it('같은 날 다른 끼니에서 뽑은 메뉴는 원판에서 빠진다', () => {
    // 현재 메뉴 데이터는 끼니끼리 이름이 겹치지 않으므로, 아침에 점심 메뉴를 넣은 기록으로 규칙만 확인한다
    open({ storage: { [HISTORY_KEY]: [{ date: TODAY, breakfast: '김치찌개', lunch: null, dinner: null }] } });
    app.tab('점심').click();
    assert.ok(!app.wheelLabels().includes('김치찌개'));
  });

  it('제외하고 나니 후보가 없으면 제외를 풀고 안내한다', () => {
    open({
      storage: {
        [FILTERS_KEY]: ['중식'],
        [HISTORY_KEY]: [{ date: daysAgo(1), breakfast: '짜장면', lunch: '짬뽕', dinner: '볶음밥' }],
      },
    });
    app.tab('점심').click();
    assert.deepEqual(app.wheelLabels().sort(), ['볶음밥', '짜장면', '짬뽕'].sort());
    assert.equal(app.message().className, 'message warn');
    assert.match(app.message().text, /제외를 잠시 풀었어요/);
    assert.equal(app.spinButton().disabled, false);
  });
});

describe('룰렛 회전', () => {
  it('회전하는 동안에는 모든 조작이 잠긴다', () => {
    open();
    app.spinButton().click();
    assert.ok(app.isAnimating());
    assert.equal(app.message().text, '두구두구두구...');
    for (const el of [app.spinButton(), app.confirmButton(), app.resetButton(), ...app.$$('.tab, .chip, .slot')]) {
      assert.equal(el.disabled, true, `${el.className} 버튼이 잠기지 않음`);
    }
    // 잠긴 칩은 눌러도 필터가 바뀌지 않는다
    app.chip('중식').click();
    assert.equal(app.window.localStorage.getItem(FILTERS_KEY), null);
    app.finishSpin();
    assert.equal(app.spinButton().disabled, false);
  });

  it('포인터가 가리키는 칸, 뽑으려던 칸, 식단 카드의 메뉴가 항상 같다', () => {
    open();
    const randoms = [0, 0.13, 0.5, 0.77, 0.999999];
    const jitters = [0, 0.5, 0.999999];
    for (const meal of ['아침', '점심', '저녁']) {
      app.tab(meal).click();
      for (const r of randoms) {
        for (const j of jitters) {
          const labels = app.wheelLabels();
          const expected = labels[Math.floor(r * labels.length)];
          const seq = [r, j];
          app.setRandom(() => seq.shift());
          app.spin();
          const at = app.labelAtPointer();
          assert.equal(at, expected, `${meal} r=${r} j=${j}: 포인터 칸`);
          assert.equal(app.slotNames()[meal], expected, `${meal} r=${r} j=${j}: 식단 카드`);
        }
      }
    }
  });

  it('결과 메시지로 다음에 뽑을 끼니를 알려 준다', () => {
    open();
    app.spin();
    assert.match(app.message().text, /^아침은 .+! 이제 점심 차례예요\.$/);
    app.tab('점심').click();
    app.spin();
    app.tab('저녁').click();
    app.spin();
    assert.match(app.message().text, /^저녁은 .+! 마음에 들면 확정해 주세요\.$/);
  });
});

describe('확정과 히스토리', () => {
  function spinAllMeals() {
    for (const meal of ['아침', '점심', '저녁']) {
      app.tab(meal).click();
      app.spin();
    }
  }

  it('세 끼를 다 뽑아야 확정할 수 있고, 확정하면 오늘 기록이 저장된다', () => {
    open();
    app.spin();
    assert.equal(app.confirmButton().disabled, true);
    assert.equal(app.confirmButton().textContent, '세 끼를 모두 뽑으면 확정할 수 있어요');

    app.tab('점심').click();
    app.spin();
    app.tab('저녁').click();
    app.spin();
    assert.equal(app.confirmButton().disabled, false);
    assert.equal(app.confirmButton().textContent, '오늘 식단 확정');

    const picked = app.slotNames();
    app.confirmButton().click();
    assert.deepEqual(app.stored(HISTORY_KEY), [{ date: TODAY, breakfast: picked.아침, lunch: picked.점심, dinner: picked.저녁 }]);
    assert.equal(app.confirmButton().disabled, true);
    assert.equal(app.confirmButton().textContent, '오늘 식단 확정됨 ✓');
    assert.match(app.historyItems()[0], /오늘/);
  });

  it('새로고침하면 오늘 확정한 식단을 그대로 불러온다', () => {
    open();
    spinAllMeals();
    app.confirmButton().click();
    const picked = app.slotNames();
    const storage = app.storageSnapshot();

    app.close();
    open({ storage });
    assert.deepEqual(app.slotNames(), picked);
    assert.equal(app.confirmButton().textContent, '오늘 식단 확정됨 ✓');
  });

  it('확정 후 다시 돌리면 재확정할 수 있고, 오늘 기록은 하나로 덮어쓴다', () => {
    open({ storage: { [HISTORY_KEY]: [{ date: daysAgo(5), breakfast: '토스트', lunch: '라멘', dinner: '피자' }] } });
    app.setRandom(() => 0);
    spinAllMeals();
    app.confirmButton().click();

    app.setRandom(() => 0.99);
    app.spin(); // 저녁을 다른 메뉴로
    assert.equal(app.confirmButton().textContent, '바뀐 식단으로 다시 확정');
    app.confirmButton().click();

    const saved = app.stored(HISTORY_KEY);
    assert.equal(saved.filter(h => h.date === TODAY).length, 1);
    assert.equal(saved[0].date, TODAY, '최신 날짜가 맨 앞');
    assert.equal(saved[0].dinner, app.slotNames().저녁);
    assert.equal(saved.length, 2);
  });

  it('기록 초기화는 확인을 받아야만 지운다', () => {
    const storage = { [HISTORY_KEY]: [{ date: daysAgo(1), breakfast: '토스트', lunch: '라멘', dinner: '피자' }] };
    open({ storage, confirmAnswer: false });
    app.resetButton().click();
    assert.equal(app.stored(HISTORY_KEY).length, 1);

    app.close();
    open({ storage, confirmAnswer: true });
    app.resetButton().click();
    assert.deepEqual(app.stored(HISTORY_KEY), []);
    assert.equal(app.resetButton().disabled, true);
    assert.deepEqual(app.historyItems(), ['아직 확정한 식단이 없어요.']);
  });
});
