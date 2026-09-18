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

test('필수 고지 — trial_end(체험 중 최초 등록, 오늘 결제 없음)', () => {
  const lines = C.noticeLines({
    planName: '스탠다드', amount: 8900, chargeKind: 'trial_end',
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

test('필수 고지 — trial_end, 29일 이후 결제일은 말일 안내', () => {
  const lines = C.noticeLines({
    planName: '플러스', amount: 14900, chargeKind: 'trial_end',
    chargeAt: '2026-10-31T01:01:00.000Z', now: new Date('2026-09-26T03:00:00.000Z'),
  });
  assert.equal(lines[1], '오늘은 결제되지 않아요. 10월 31일까지 무료로 이용하실 수 있어요.');
  assert.equal(lines[2], '10월 31일부터 매월 31일에 14,900원이 자동결제돼요. 그 날짜가 없는 달은 마지막 날에 결제돼요.');
  assert.match(lines[3], /첫 결제 전에 해지하면 청구되지 않아요/);
});

test('필수 고지 — renewal(이미 결제한 기간 안에서 결제수단만 변경)', () => {
  const lines = C.noticeLines({
    planName: '스탠다드', amount: 8900, chargeKind: 'renewal',
    chargeAt: '2026-10-25T03:00:00.000Z', now: new Date('2026-09-26T03:00:00.000Z'),
  });
  assert.equal(lines[0], '스탠다드 요금제 · 월 8,900원 (부가세 포함)');
  assert.equal(lines[1], '이미 결제한 이용 기간이 10월 25일까지예요. 오늘은 결제되지 않아요.');
  assert.equal(lines[2], '10월 25일에 8,900원이 결제되고, 이후 매월 25일에 자동결제돼요.');
  assert.doesNotMatch(lines[3], /첫 결제 전에 해지하면/);
  assert.match(lines[3], /언제든 이 페이지에서 해지할 수 있어요/);
});

test('필수 고지 — renewal, 29일 이후 결제일은 말일 안내', () => {
  const lines = C.noticeLines({
    planName: '스탠다드', amount: 8900, chargeKind: 'renewal',
    chargeAt: '2026-10-31T03:00:00.000Z', now: new Date('2026-09-26T03:00:00.000Z'),
  });
  assert.equal(lines[2], '10월 31일에 8,900원이 결제되고, 이후 매월 31일에 자동결제돼요. 그 날짜가 없는 달은 마지막 날에 결제돼요.');
});

test('필수 고지 — overdue(밀린 결제를 바로 처리하고 다음 정기결제 안내)', () => {
  const lines = C.noticeLines({
    planName: '스탠다드', amount: 8900, chargeKind: 'overdue',
    chargeAt: '2026-09-26T03:00:00.000Z', nextChargeAt: '2026-10-25T03:00:00.000Z', nextAmount: 8900,
    now: new Date('2026-09-26T03:00:00.000Z'),
  });
  assert.equal(lines[1], '결제되지 않은 8,900원이 등록 후 바로 결제돼요.');
  assert.equal(lines[2], '다음 결제는 10월 25일에 8,900원이고, 이후 매월 25일에 자동결제돼요.');
  assert.doesNotMatch(lines[3], /첫 결제 전에 해지하면/);
});

test('필수 고지 — overdue인데 다음 결제부터 요금제가 오르면, 1번째 줄은 지금(밀린) 요금제 가격', () => {
  const lines = C.noticeLines({
    planName: '라이트', amount: 8900, monthlyAmount: 8900, chargeKind: 'overdue',
    chargeAt: '2026-09-26T03:00:00.000Z', nextChargeAt: '2026-10-25T03:00:00.000Z', nextAmount: 14900,
    now: new Date('2026-09-26T03:00:00.000Z'),
  });
  assert.equal(lines[0], '라이트 요금제 · 월 8,900원 (부가세 포함)');
  assert.equal(lines[1], '결제되지 않은 8,900원이 등록 후 바로 결제돼요.');
  assert.equal(lines[2], '다음 결제는 10월 25일에 14,900원이고, 이후 매월 25일에 자동결제돼요.');
});

test('필수 고지 — immediate(체험이 이미 끝난 뒤 신규 등록, 바로 첫 결제)', () => {
  const lines = C.noticeLines({
    planName: '플러스', amount: 14900, chargeKind: 'immediate',
    chargeAt: '2026-09-26T03:00:00.000Z', nextChargeAt: '2026-10-26T03:00:00.000Z', nextAmount: 14900,
    now: new Date('2026-09-26T03:00:00.000Z'),
  });
  assert.equal(lines[1], '등록하면 바로 첫 결제(14,900원)가 진행돼요.');
  assert.equal(lines[2], '다음 결제는 10월 26일에 14,900원이고, 이후 매월 26일에 자동결제돼요.');
  assert.doesNotMatch(lines[3], /첫 결제 전에 해지하면/);
});

test('필수 고지 — none(결제수단만 변경, 해지 예약 중) — 이번 청구는 없어도 요금제 월 가격은 보여준다', () => {
  const lines = C.noticeLines({ planName: '스탠다드', amount: null, monthlyAmount: 8900, chargeKind: 'none', chargeAt: null, now: new Date('2026-09-26T03:00:00.000Z') });
  assert.equal(lines.length, 4);
  assert.equal(lines[0], '스탠다드 요금제 · 월 8,900원 (부가세 포함)');
  assert.equal(lines[1], '결제수단만 바뀌고, 해지 예약은 그대로예요. 추가로 결제되지 않아요.');
  assert.equal(lines[2], '해지를 취소하면 다음 결제일부터 이 결제수단으로 자동결제돼요.');
  assert.doesNotMatch(lines[3], /첫 결제 전에 해지하면/);
  assert.match(lines[3], /언제든 이 페이지에서 해지할 수 있어요/);
  assert.match(lines[3], /결제 후 7일 안에 안부전화 이용 기록이 없으면 전액 환불/);
});

test('필수 고지 — 알 수 없는/누락된 chargeKind는 중립 문구만', () => {
  const known = C.noticeLines({ planName: '스탠다드', amount: 8900, monthlyAmount: 8900, chargeKind: 'weird_new_kind', chargeAt: '2026-10-25T03:00:00.000Z', now: new Date('2026-09-26T03:00:00.000Z') });
  assert.equal(known[0], '스탠다드 요금제 · 월 8,900원 (부가세 포함)');
  assert.equal(known[1], '결제 예정 정보를 확인하지 못했어요. 새로고침 후 다시 확인해 주세요.');
  assert.equal(known.length, 2);

  const missing = C.noticeLines({ planName: '스탠다드', amount: 8900, monthlyAmount: 8900, chargeAt: '2026-10-25T03:00:00.000Z', now: new Date('2026-09-26T03:00:00.000Z') });
  assert.equal(missing[1], '결제 예정 정보를 확인하지 못했어요. 새로고침 후 다시 확인해 주세요.');
});

test('고지 문구에 금칙어가 없다', () => {
  const all = C.noticeLines({ planName: '라이트', amount: 5900, chargeKind: 'trial_end', chargeAt: '2026-10-25T03:00:00.000Z', now: new Date('2026-09-26T03:00:00.000Z') }).join(' ');
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

test('errorMessage — unauthorized는 session_expired와 같은 문구(다시 로그인)', () => {
  assert.equal(C.errorMessage('unauthorized'), '다시 로그인해 주세요.');
  assert.equal(C.errorMessage('unauthorized'), C.errorMessage('session_expired'));
});

test('errorMessage — account_link_required(다른 방법으로 가입된 계정)', () => {
  assert.equal(C.errorMessage('account_link_required'), '이 이메일은 다른 방법으로 가입돼 있어요. 가입하신 방법(이메일 등)으로 로그인해 주세요.');
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

// ── 결제 2차(Task 4): 버튼 금액·쉬어가기·해지·환불 요청·흐름 측정 ──

test('submitLabel — 결제 성격별 등록 버튼 문구(금액은 서버 값)', () => {
  assert.equal(C.submitLabel({ chargeKind: 'trial_end', amount: 8900, monthlyAmount: 8900 }), '무료 체험 후 월 8,900원 자동결제 등록');
  assert.equal(C.submitLabel({ chargeKind: 'trial_end', amount: 8900, monthlyAmount: 14900 }), '무료 체험 후 월 14,900원 자동결제 등록');
  assert.equal(C.submitLabel({ chargeKind: 'trial_end', amount: 8900 }), '무료 체험 후 월 8,900원 자동결제 등록');
  assert.equal(C.submitLabel({ chargeKind: 'overdue', amount: 8900, monthlyAmount: 8900 }), '8,900원 결제하고 다시 이용하기');
  assert.equal(C.submitLabel({ chargeKind: 'immediate', amount: 14900, monthlyAmount: 14900 }), '14,900원 결제하고 시작하기');
  assert.equal(C.submitLabel({ chargeKind: 'renewal', amount: 8900 }), '결제수단 변경');
  assert.equal(C.submitLabel({ chargeKind: 'none', amount: null }), '결제수단 변경');
  assert.equal(C.submitLabel({ chargeKind: 'pause_end', amount: 8900 }), '결제수단 변경');
  assert.equal(C.submitLabel({ chargeKind: 'weird' }), '결제수단 등록');
  assert.equal(C.submitLabel({}), '결제수단 등록');
  assert.equal(C.submitLabel(null), '결제수단 등록');
});

test('필수 고지 — pause_end(쉬어가기 중 결제수단 변경)', () => {
  assert.equal(C.CHARGE_KINDS.pause_end, true);
  const lines = C.noticeLines({
    planName: '스탠다드', amount: 8900, monthlyAmount: 8900, chargeKind: 'pause_end',
    chargeAt: '2026-11-25T03:00:00.000Z', now: new Date('2026-11-01T03:00:00.000Z'),
  });
  assert.equal(lines.length, 4);
  assert.equal(lines[0], '스탠다드 요금제 · 월 8,900원 (부가세 포함)');
  assert.equal(lines[1], '쉬어가기가 11월 25일에 끝나요. 오늘은 결제되지 않아요.');
  assert.equal(lines[2], '11월 25일에 8,900원이 결제되고, 이후 매월 25일에 자동결제돼요.');
  const renewal = C.noticeLines({ planName: '스탠다드', amount: 8900, chargeKind: 'renewal', chargeAt: '2026-11-25T03:00:00.000Z' });
  assert.equal(lines[3], renewal[3]);
});

test('필수 고지 — pause_end, 29일 이후는 말일 안내', () => {
  const lines = C.noticeLines({ planName: '플러스', amount: 14900, chargeKind: 'pause_end', chargeAt: '2026-10-31T03:00:00.000Z' });
  assert.equal(lines[2], '10월 31일에 14,900원이 결제되고, 이후 매월 31일에 자동결제돼요. 그 날짜가 없는 달은 마지막 날에 결제돼요.');
});

test('pauseOffer — 해지 화면의 쉬어가기 안내(가능/횟수 초과/그 밖)', () => {
  const ok = C.pauseOffer({ eligible: true, reason: null, from: '2026-10-25T03:00:00.000Z', until: '2026-11-25T03:00:00.000Z', usedThisYear: 0, max: 2 });
  assert.equal(ok.kind, 'offer');
  assert.equal(ok.text, '다음 결제일(10월 25일)부터 한 달 동안 결제와 안부전화를 쉬어요. 11월 25일에 자동으로 다시 시작되고, 3일 전과 1일 전에 알려 드려요. 1년에 2번까지 쓸 수 있어요.');
  assert.deepEqual(C.pauseOffer({ eligible: false, reason: 'pause_limit' }), { kind: 'limit', text: '쉬어가기는 1년에 2번까지 쓸 수 있어요.' });
  assert.deepEqual(C.pauseOffer({ eligible: false, reason: 'not_active' }), { kind: 'none', text: '' });
  assert.deepEqual(C.pauseOffer({ eligible: true, reason: null }), { kind: 'none', text: '' }); // 날짜 없으면 숨김
  assert.deepEqual(C.pauseOffer(undefined), { kind: 'none', text: '' });
});

test('pauseManageText — 구독 관리의 쉬어가기 표시', () => {
  const p = { state: 'scheduled', from: '2026-10-25T03:00:00.000Z', until: '2026-11-25T03:00:00.000Z' };
  assert.deepEqual(C.pauseManageText(p, 8900), { text: '쉬어가기 예정: 10월 25일 ~ 11월 25일 · 그동안 결제와 안부전화가 쉬어요', canCancel: true });
  assert.deepEqual(C.pauseManageText(Object.assign({}, p, { state: 'active' }), 8900), {
    text: '쉬어가는 중이에요. 11월 25일에 다시 시작하고 8,900원이 결제돼요.', canCancel: false,
  });
  assert.equal(C.pauseManageText(null, 8900), null);
});

test('cancelKeepText — 해지 후 이용 안내', () => {
  const now = new Date('2026-10-01T00:00:00.000Z');
  assert.equal(
    C.cancelKeepText({ status: 'active', billing: { currentPeriodEnd: '2026-10-25T03:00:00.000Z' } }, now),
    '해지해도 10월 25일까지 이용하실 수 있어요. 지금까지 받은 리포트는 해지 후에도 보호자 앱에서 볼 수 있어요.');
  assert.equal(
    C.cancelKeepText({ status: 'trial', trialEndsAt: '2026-10-20T03:00:00.000Z', billing: {} }, now),
    '해지해도 10월 20일까지 이용하실 수 있어요. 지금까지 받은 리포트는 해지 후에도 보호자 앱에서 볼 수 있어요.');
  assert.equal(C.cancelKeepText({ status: 'past_due', billing: {} }, now),
    '지금 바로 해지되고 안부전화가 중단돼요. 결제되지 않은 금액은 청구되지 않아요.');
  assert.equal(C.cancelKeepText({ status: 'active', billing: { currentPeriodEnd: '2026-09-01T03:00:00.000Z' } }, now),
    '해지하면 더 이상 결제되지 않아요. 지금까지 받은 리포트는 해지 후에도 보호자 앱에서 볼 수 있어요.');
});

test('CANCEL_REASONS — 서버 화이트리스트와 같은 5개', () => {
  assert.deepEqual(C.CANCEL_REASONS.map((r) => r.value), ['price', 'not_used', 'call_quality', 'no_longer_needed', 'other']);
  C.CANCEL_REASONS.forEach((r) => assert.ok(r.label));
});

test('canRequestRefund — paid · 결제 후 7일 안 · 요청 없음', () => {
  const now = new Date('2026-10-08T00:00:00.000Z');
  const p = { paymentId: 'p1', status: 'paid', paidAt: '2026-10-02T00:00:00.000Z', refundRequest: null };
  assert.equal(C.canRequestRefund(p, now), true);
  assert.equal(C.canRequestRefund(Object.assign({}, p, { paidAt: '2026-09-30T23:00:00.000Z' }), now), false); // 7일 지남
  assert.equal(C.canRequestRefund(Object.assign({}, p, { status: 'failed' }), now), false);
  assert.equal(C.canRequestRefund(Object.assign({}, p, { refundRequest: 'open' }), now), false);
  assert.equal(C.canRequestRefund(Object.assign({}, p, { paidAt: null }), now), false);
  assert.equal(C.canRequestRefund(Object.assign({}, p, { refundRequest: undefined }), now), true);
});

test('errorMessage — 쉬어가기·해지 이유·환불 요청 오류 코드', () => {
  ['not_active', 'canceled', 'no_billing', 'already_paused', 'not_scheduled'].forEach((c) =>
    assert.equal(C.errorMessage(c), '지금은 쉬어가기를 신청할 수 없어요.'));
  assert.equal(C.errorMessage('period_ended', 'pause'), '지금은 쉬어가기를 신청할 수 없어요.');
  // 해지 취소(resume)의 period_ended 문구는 그대로 둔다.
  assert.equal(C.errorMessage('period_ended'), '이용 기간이 이미 끝나 해지를 취소할 수 없어요. 결제수단을 다시 등록해 주세요.');
  assert.equal(C.errorMessage('pause_limit'), '쉬어가기는 1년에 2번까지 쓸 수 있어요.');
  assert.equal(C.errorMessage('pause_started'), '이미 쉬어가는 중이라 취소할 수 없어요. 고객센터(1877-1979)로 연락해 주세요.');
  assert.equal(C.errorMessage('not_paused'), '쉬어가기 예정이 없어요.');
  assert.equal(C.errorMessage('not_refundable'), '환불 요청할 수 없는 결제예요.');
  assert.equal(C.errorMessage('invalid_reason'), '해지 이유를 다시 확인해 주세요.');
  assert.equal(C.errorMessage('???', 'pause'), '잠시 후 다시 시도해 주세요. 계속 안 되면 고객센터(1877-1979)로 연락해 주세요.');
});

test('payEventRequest — 화이트리스트 이벤트만, 개인 정보 없이 이름만', () => {
  const r = C.payEventRequest('https://api.test', 'pay_view');
  assert.equal(r.url, 'https://api.test/web/pay-events');
  assert.deepEqual(JSON.parse(r.body), { events: [{ name: 'pay_view' }] });
  assert.equal(C.payEventRequest('https://api.test', 'unknown_event'), null);
  assert.deepEqual(C.PAY_EVENTS, ['pay_view', 'login_view', 'login_success', 'register_view', 'consent_checked', 'pg_open',
    'register_success', 'register_fail', 'cancel_view', 'cancel_done', 'pause_done', 'refund_request']);
});

test('2차 화면 문구에 금칙어가 없다', () => {
  const texts = [
    C.pauseOffer({ eligible: true, from: '2026-10-25T03:00:00.000Z', until: '2026-11-25T03:00:00.000Z' }).text,
    C.pauseManageText({ state: 'active', from: '2026-10-25T03:00:00.000Z', until: '2026-11-25T03:00:00.000Z' }, 8900).text,
    C.cancelKeepText({ status: 'past_due', billing: {} }, new Date()),
    C.submitLabel({ chargeKind: 'trial_end', amount: 8900 }),
  ].concat(C.CANCEL_REASONS.map((r) => r.label)).join(' ');
  assert.doesNotMatch(texts, /위험|감지|부가세 별도/);
});

// ── Task 4 검토 반영 ──

test('pauseManageText — 금액을 모르면 금액 절을 뺀다', () => {
  const p = { state: 'active', from: '2026-10-25T03:00:00.000Z', until: '2026-11-25T03:00:00.000Z' };
  assert.deepEqual(C.pauseManageText(p, null), { text: '쉬어가는 중이에요. 11월 25일에 다시 시작해요.', canCancel: false });
  assert.deepEqual(C.pauseManageText(p, undefined), { text: '쉬어가는 중이에요. 11월 25일에 다시 시작해요.', canCancel: false });
});

test('cancelKeepText — 쉬어가기 예정이면 함께 취소 안내, 쉬는 중이면 바로 종료', () => {
  const now = new Date('2026-10-01T00:00:00.000Z');
  const scheduled = { status: 'active', pause: { state: 'scheduled', from: '2026-10-25T03:00:00.000Z', until: '2026-11-25T03:00:00.000Z' },
    billing: { currentPeriodEnd: '2026-10-25T03:00:00.000Z' } };
  assert.equal(C.cancelKeepText(scheduled, now),
    '해지해도 10월 25일까지 이용하실 수 있어요. 쉬어가기 예정도 함께 취소돼요. 지금까지 받은 리포트는 해지 후에도 보호자 앱에서 볼 수 있어요.');
  const active = { status: 'active', pause: { state: 'active', from: '2026-09-25T03:00:00.000Z', until: '2026-10-25T03:00:00.000Z' },
    billing: { currentPeriodEnd: '2026-09-25T03:00:00.000Z' } };
  assert.equal(C.cancelKeepText(active, now), '해지하면 바로 종료돼요. 지금까지 받은 리포트는 해지 후에도 보호자 앱에서 볼 수 있어요.');
  // billing.pause만 있어도 같다
  const viaBilling = { status: 'active', billing: { currentPeriodEnd: '2026-09-25T03:00:00.000Z', pause: active.pause } };
  assert.equal(C.cancelKeepText(viaBilling, now), '해지하면 바로 종료돼요. 지금까지 받은 리포트는 해지 후에도 보호자 앱에서 볼 수 있어요.');
});

test('errorMessage — invalid_reason은 환불 요청 맥락에서 다른 문구', () => {
  assert.equal(C.errorMessage('invalid_reason', 'refund'), '환불 요청 내용을 다시 확인해 주세요.');
  assert.equal(C.errorMessage('invalid_reason'), '해지 이유를 다시 확인해 주세요.');
  assert.equal(C.errorMessage('invalid_reason', 'pause'), '해지 이유를 다시 확인해 주세요.');
});

test('payEventRequest — 사전 확인 없는 text/plain 본문', () => {
  const r = C.payEventRequest('https://api.test', 'pg_open');
  assert.equal(r.contentType, 'text/plain;charset=UTF-8');
  assert.deepEqual(JSON.parse(r.body), { events: [{ name: 'pg_open' }] });
});

test('ONCE_PER_TAB_EVENTS · isReturnLoad — 방문당 1회 측정', () => {
  assert.deepEqual(C.ONCE_PER_TAB_EVENTS, ['pay_view', 'login_view', 'consent_checked']);
  assert.equal(C.isReturnLoad('?code=c1&state=naver.ab'), true);
  assert.equal(C.isReturnLoad('?error=access_denied&state=kakao.x'), true);
  assert.equal(C.isReturnLoad('?pgReturn=1&billingKey=bk'), true);
  assert.equal(C.isReturnLoad(''), false);
  assert.equal(C.isReturnLoad('?utm_source=kakao'), false);
});

test('CS_PHONE 노출', () => {
  assert.equal(C.CS_PHONE, '1877-1979');
});
