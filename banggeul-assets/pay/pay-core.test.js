// banggeul-assets/pay/pay-core.test.js — 실행: node --test banggeul-assets/pay/
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('./pay-core.js');

test('formatWon — 부가세 포함 금액 표기', () => {
  assert.equal(C.formatWon(8900), '8,900원');
  assert.equal(C.formatWon(16800), '16,800원');
  assert.equal(C.formatWon(null), '-');
});

test('KST 날짜 — UTC로 전날이어도 한국 날짜', () => {
  assert.equal(C.formatKstDate('2026-10-24T15:30:00.000Z'), '10월 25일');
  assert.equal(C.kstDayOfMonth('2026-10-24T15:30:00.000Z'), 25);
});

test('필수 고지 4종 — 체험 중(오늘 결제 없음)', () => {
  const lines = C.noticeLines({
    planName: '스탠다드', amount: 8900,
    chargeAt: '2026-10-25T03:00:00.000Z', now: new Date('2026-09-26T03:00:00.000Z'),
  });
  assert.equal(lines.length, 4);
  assert.equal(lines[0], '스탠다드 요금제 · 월 8,900원 (부가세 포함)');
  assert.equal(lines[1], '오늘은 결제되지 않아요. 10월 25일까지 무료로 이용하실 수 있어요.');
  assert.equal(lines[2], '10월 25일부터 매월 25일에 8,900원이 자동결제돼요.');
  assert.match(lines[3], /언제든 이 페이지에서 해지할 수 있어요/);
  assert.match(lines[3], /첫 결제 전에 해지하면 청구되지 않아요/);
  assert.match(lines[3], /결제 후 7일 안에 안부전화 이용 기록이 없으면 전액 환불/);
});

test('필수 고지 — 바로 결제(체험 끝남)면 "바로 첫 결제", 29일 이후 결제일은 말일 안내', () => {
  const lines = C.noticeLines({
    planName: '플러스', amount: 14900,
    chargeAt: '2026-10-31T01:01:00.000Z', now: new Date('2026-10-31T01:00:00.000Z'),
  });
  assert.equal(lines[1], '등록하면 바로 첫 결제가 진행돼요.');
  assert.equal(lines[2], '10월 31일부터 매월 31일에 14,900원이 자동결제돼요. 그 날짜가 없는 달은 마지막 날에 결제돼요.');
  assert.doesNotMatch(lines[3], /첫 결제 전에 해지하면/);
});

test('고지 문구에 금칙어가 없다', () => {
  const all = C.noticeLines({ planName: '라이트', amount: 5900, chargeAt: '2026-10-25T03:00:00.000Z', now: new Date('2026-09-26T03:00:00.000Z') }).join(' ');
  assert.doesNotMatch(all, /위험|감지|부가세 별도/);
});

const base = (over = {}) => ({
  subscription: { status: 'trial', expired: false },
  plan: 'standard', currentPlan: 'standard', amount: 8900, amounts: { lite: 5900, standard: 8900, plus: 14900 },
  amountError: null, elderCount: 1, isOwner: true, billingEnabled: true, payments: [], ...over,
});

test('decideView — 화면 결정 순서', () => {
  assert.equal(C.decideView(base({ isOwner: false })), 'not_owner');
  assert.equal(C.decideView(base({ subscription: { status: 'free' } })), 'free');
  assert.equal(C.decideView(base({ subscription: { status: 'active', billing: { registered: true } } })), 'manage');
  assert.equal(C.decideView(base({ subscription: { status: 'trial', billing: { registered: true, nextPaymentAt: 'x' } } })), 'manage');
  assert.equal(C.decideView(base({ subscription: { status: 'expired', billing: { registered: true } } })), 'register');
  assert.equal(C.decideView(base({ billingEnabled: false })), 'billing_off');
  assert.equal(C.decideView(base({ amount: null, amountError: 'no_elder' })), 'amount_error');
  assert.equal(C.decideView(base()), 'register');
});

test('decideErrorView — 가족 없음은 앱 가입 안내', () => {
  assert.equal(C.decideErrorView('no_family'), 'no_family');
  assert.equal(C.decideErrorView('portone_error'), null);
});

test('errorMessage — 서버 오류 코드별 문구, 모르는 코드는 기본 문구', () => {
  assert.equal(C.errorMessage('consent_required'), '자동결제 동의에 체크해 주세요.');
  assert.equal(C.errorMessage('owner_only'), '결제는 대표 보호자만 할 수 있어요.');
  assert.equal(C.errorMessage('phone_extra_price_undecided'), '전화 방식 부모님을 추가한 요금은 아직 준비 중이에요. 고객센터(1877-1979)로 문의해 주세요.');
  assert.equal(C.errorMessage('???'), '잠시 후 다시 시도해 주세요. 계속 안 되면 고객센터(1877-1979)로 연락해 주세요.');
});

test('paymentStatusLabel', () => {
  assert.equal(C.paymentStatusLabel('scheduled'), '결제 예정');
  assert.equal(C.paymentStatusLabel('paid'), '결제 완료');
  assert.equal(C.paymentStatusLabel('failed'), '결제 실패');
  assert.equal(C.paymentStatusLabel('cancelled'), '환불 완료');
  assert.equal(C.paymentStatusLabel('partial_cancelled'), '부분 환불');
  assert.equal(C.paymentStatusLabel('revoked'), '예약 취소');
});

test('OAuth — state에 제공자를 싣고, 복귀 파라미터에서 되읽는다', () => {
  const state = C.makeOAuthState('naver', 'ab12cd34');
  assert.equal(state, 'naver.ab12cd34');
  assert.deepEqual(C.parseOAuthReturn('?code=c1&state=naver.ab12cd34'), { provider: 'naver', code: 'c1', state: 'naver.ab12cd34', error: null });
  assert.deepEqual(C.parseOAuthReturn('?error=access_denied&state=kakao.x1'), { provider: 'kakao', code: null, state: 'kakao.x1', error: 'access_denied' });
  assert.equal(C.parseOAuthReturn('?foo=1'), null);
  assert.equal(C.parseOAuthReturn('?code=c1&state=google.x'), null); // 모르는 제공자
});

test('OAuth 인가 URL', () => {
  const redirectUri = 'https://www.krafte.net/banggeul-pay.html';
  const k = new URL(C.kakaoAuthorizeUrl({ restKey: 'rk', redirectUri, state: 'kakao.s' }));
  assert.equal(k.origin + k.pathname, 'https://kauth.kakao.com/oauth/authorize');
  assert.deepEqual(Object.fromEntries(k.searchParams), { response_type: 'code', client_id: 'rk', redirect_uri: redirectUri, state: 'kakao.s' });
  const n = new URL(C.naverAuthorizeUrl({ clientId: 'ci', redirectUri, state: 'naver.s' }));
  assert.equal(n.origin + n.pathname, 'https://nid.naver.com/oauth2.0/authorize');
  assert.deepEqual(Object.fromEntries(n.searchParams), { response_type: 'code', client_id: 'ci', redirect_uri: redirectUri, state: 'naver.s' });
});

test('포트원 결제창 복귀(모바일 리다이렉트) 파라미터', () => {
  assert.deepEqual(C.parsePortoneReturn('?pgReturn=1&billingKey=bk_1'), { billingKey: 'bk_1', code: null, message: null });
  assert.deepEqual(C.parsePortoneReturn('?pgReturn=1&code=FAILURE_TYPE_PG&message=%EC%B7%A8%EC%86%8C'), { billingKey: null, code: 'FAILURE_TYPE_PG', message: '취소' });
  assert.equal(C.parsePortoneReturn('?billingKey=bk_1'), null); // 우리 표식(pgReturn) 없으면 무시
});
