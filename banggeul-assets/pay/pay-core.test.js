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
  assert.equal(lines[2], '10월 25일에 8,900원이 처음 결제되고, 이후에도 한 달마다 같은 날 자동결제돼요.');
  assert.match(lines[3], /언제든 이 페이지에서 해지할 수 있어요/);
  assert.match(lines[3], /첫 결제 전에 해지하면 청구되지 않아요/);
  assert.doesNotMatch(lines[3], /안부전화 이용 기록/);
});

test('필수 고지 — trial_end, 29일 이후 결제일은 말일 안내', () => {
  const lines = C.noticeLines({
    planName: '플러스', amount: 14900, chargeKind: 'trial_end',
    chargeAt: '2026-10-31T01:01:00.000Z', now: new Date('2026-09-26T03:00:00.000Z'),
  });
  assert.equal(lines[1], '오늘은 결제되지 않아요. 10월 31일까지 무료로 이용하실 수 있어요.');
  assert.equal(lines[2], '10월 31일에 14,900원이 처음 결제되고, 이후에도 한 달마다 같은 날 자동결제돼요. 그 날짜가 없는 달은 말일에 결제돼요.');
  assert.match(lines[3], /첫 결제 전에 해지하면 청구되지 않아요/);
});

test('필수 고지 — renewal(이미 결제한 기간 안에서 결제수단만 변경)', () => {
  const lines = C.noticeLines({
    planName: '스탠다드', amount: 8900, chargeKind: 'renewal',
    chargeAt: '2026-10-25T03:00:00.000Z', now: new Date('2026-09-26T03:00:00.000Z'),
  });
  assert.equal(lines[0], '스탠다드 요금제 · 월 8,900원 (부가세 포함)');
  assert.equal(lines[1], '이미 결제한 이용 기간이 10월 25일까지예요. 오늘은 결제되지 않아요.');
  assert.equal(lines[2], '10월 25일에 8,900원이 결제되고, 이후에도 한 달마다 같은 날 자동결제돼요.');
  assert.doesNotMatch(lines[3], /첫 결제 전에 해지하면/);
  assert.match(lines[3], /언제든 이 페이지에서 해지할 수 있어요/);
});

test('필수 고지 — renewal, 29일 이후 결제일은 말일 안내', () => {
  const lines = C.noticeLines({
    planName: '스탠다드', amount: 8900, chargeKind: 'renewal',
    chargeAt: '2026-10-31T03:00:00.000Z', now: new Date('2026-09-26T03:00:00.000Z'),
  });
  assert.equal(lines[2], '10월 31일에 8,900원이 결제되고, 이후에도 한 달마다 같은 날 자동결제돼요. 그 날짜가 없는 달은 말일에 결제돼요.');
});

test('필수 고지 — overdue(밀린 결제를 바로 처리하고 다음 정기결제 안내)', () => {
  const lines = C.noticeLines({
    planName: '스탠다드', amount: 8900, chargeKind: 'overdue',
    chargeAt: '2026-09-26T03:00:00.000Z', nextChargeAt: '2026-10-25T03:00:00.000Z', nextAmount: 8900,
    now: new Date('2026-09-26T03:00:00.000Z'),
  });
  assert.equal(lines[1], '결제되지 않은 8,900원이 등록 후 바로 결제돼요.');
  assert.equal(lines[2], '다음 결제는 10월 25일에 8,900원이고, 이후에도 한 달마다 같은 날 자동결제돼요.');
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
  assert.equal(lines[2], '다음 결제는 10월 25일에 14,900원이고, 이후에도 한 달마다 같은 날 자동결제돼요.');
});

test('필수 고지 — immediate(체험이 이미 끝난 뒤 신규 등록, 바로 첫 결제)', () => {
  const lines = C.noticeLines({
    planName: '플러스', amount: 14900, chargeKind: 'immediate',
    chargeAt: '2026-09-26T03:00:00.000Z', nextChargeAt: '2026-10-26T03:00:00.000Z', nextAmount: 14900,
    now: new Date('2026-09-26T03:00:00.000Z'),
  });
  assert.equal(lines[1], '등록하면 바로 첫 결제(14,900원)가 진행돼요.');
  assert.equal(lines[2], '다음 결제는 10월 26일(첫 결제일로부터 한 달 뒤)에 14,900원이고, 이후에도 한 달마다 같은 날 자동결제돼요.');
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
  assert.equal(lines[3], '언제든 이 페이지에서 해지할 수 있어요. 해지해도 결제한 기간이 끝날 때까지 이용하실 수 있어요. 결제된 요금은 환불되지 않아요. 서비스 장애 등 회사 사정이 있을 때는 고객센터(1877-1979)로 연락해 주세요.');
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
  assert.equal(C.errorMessage('phone_extra_price_undecided'), '전화 방식 부모님 한 분 더 요금은 아직 준비 중이에요. 고객센터(1877-1979)로 문의해 주세요.');
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
  assert.equal(lines[2], '11월 25일에 8,900원이 결제되고, 이후에도 한 달마다 같은 날 자동결제돼요.');
  const renewal = C.noticeLines({ planName: '스탠다드', amount: 8900, chargeKind: 'renewal', chargeAt: '2026-11-25T03:00:00.000Z' });
  assert.equal(lines[3], renewal[3]);
});

test('필수 고지 — pause_end, 29일 이후는 말일 안내', () => {
  const lines = C.noticeLines({ planName: '플러스', amount: 14900, chargeKind: 'pause_end', chargeAt: '2026-10-31T03:00:00.000Z' });
  assert.equal(lines[2], '10월 31일에 14,900원이 결제되고, 이후에도 한 달마다 같은 날 자동결제돼요. 그 날짜가 없는 달은 말일에 결제돼요.');
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

test('셀프 환불 요청 없음(대표 9/18) — canRequestRefund를 내보내지 않는다', () => {
  assert.equal(C.canRequestRefund, undefined);
});

test('필수 고지 4번째 줄 — 청약철회 없이 해지·환불 기준(대표 9/18), firstCharge와 무관', () => {
  const head = '언제든 이 페이지에서 해지할 수 있어요. 해지해도 결제한 기간이 끝날 때까지 이용하실 수 있어요. ';
  const noRefund = '결제된 요금은 환불되지 않아요. 서비스 장애 등 회사 사정이 있을 때는 고객센터(1877-1979)로 연락해 주세요.';
  const before = '다음 결제일 전에 해지하면 다음 결제는 되지 않아요. ';
  [true, false, undefined].forEach((firstCharge) => {
    const trial = C.noticeLines({ planName: '스탠다드', amount: 8900, chargeKind: 'trial_end', chargeAt: '2026-10-25T03:00:00.000Z', firstCharge });
    assert.equal(trial[3], head + '첫 결제 전에 해지하면 청구되지 않아요. ' + noRefund);
    ['immediate', 'renewal', 'overdue', 'pause_end'].forEach((kind) => {
      const l = C.noticeLines({ planName: '스탠다드', amount: 8900, chargeKind: kind, chargeAt: '2026-10-25T03:00:00.000Z',
        nextChargeAt: '2026-11-25T03:00:00.000Z', nextAmount: 8900, firstCharge });
      assert.equal(l[3], head + before + noRefund, kind);
    });
    assert.equal(C.noticeLines({ planName: '스탠다드', amount: null, monthlyAmount: 8900, chargeKind: 'none', chargeAt: null, firstCharge })[3], head + noRefund);
  });
});

test('BILLING_CONSENT_VERSION — 청약철회 문구 삭제(2026-09-18c)', () => {
  assert.equal(C.BILLING_CONSENT_VERSION, '2026-09-18c');
});

test('cancelRefundText — 해지 화면 환불 안내(7일 환불 안내 없음)', () => {
  const noRefund = '이미 결제된 요금은 환불되지 않아요. 서비스 장애 등 회사 사정이 있을 때는 고객센터(1877-1979)로 연락해 주세요.';
  const active = { status: 'active', billing: { currentPeriodEnd: '2026-10-25T03:00:00.000Z' } };
  assert.equal(C.cancelRefundText(active, [{ status: 'paid', withdrawalEligible: false, refundRequest: null }]), noRefund);
  assert.equal(C.cancelRefundText(active, []), noRefund);
  assert.equal(C.cancelRefundText(active, undefined), noRefund);
  // 옛 서버가 withdrawalEligible: true를 보내도 환불 요청 안내는 하지 않는다
  assert.equal(C.cancelRefundText(active, [{ status: 'paid', withdrawalEligible: true, refundRequest: null }]), noRefund);
  // 예전에 보낸 환불 요청이 처리 중이면 "환불되지 않아요"로 혼동시키지 않는다
  assert.equal(C.cancelRefundText(active, [{ status: 'paid', refundRequest: 'open' }]), '');
  assert.equal(C.cancelRefundText(active, [{ status: 'paid', refundRequest: 'closed', refundResolution: 'rejected' }]), noRefund);
  // 결제된 이번 달 요금이 없는 상태(체험 중 · 밀린 결제 · 쉬는 중)에는 안내하지 않는다
  assert.equal(C.cancelRefundText({ status: 'trial', billing: {} }, []), '');
  assert.equal(C.cancelRefundText({ status: 'past_due', billing: {} }, []), '');
  assert.equal(C.cancelRefundText({ status: 'active', pause: { state: 'active' }, billing: {} }, []), '');
  assert.equal(C.cancelRefundText({ status: 'active', billing: { pause: { state: 'active' } } }, []), '');
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
  assert.equal(C.errorMessage('not_refundable'), '환불 요청할 수 없는 결제예요. 서비스 장애 등은 고객센터(1877-1979)로 문의해 주세요.');
  assert.equal(C.errorMessage('invalid_reason'), '해지 이유를 다시 확인해 주세요.');
  assert.equal(C.errorMessage('???', 'pause'), '잠시 후 다시 시도해 주세요. 계속 안 되면 고객센터(1877-1979)로 연락해 주세요.');
});

test('payEventRequest — 화이트리스트 이벤트만, 개인 정보 없이 이름만', () => {
  const r = C.payEventRequest('https://api.test', 'pay_view');
  assert.equal(r.url, 'https://api.test/web/pay-events');
  assert.deepEqual(JSON.parse(r.body), { events: [{ name: 'pay_view' }] });
  assert.equal(C.payEventRequest('https://api.test', 'unknown_event'), null);
  assert.deepEqual(C.PAY_EVENTS, ['pay_view', 'login_view', 'login_success', 'register_view', 'consent_checked', 'pg_open',
    'register_success', 'register_fail', 'cancel_view', 'cancel_done', 'pause_done']);
  assert.equal(C.payEventRequest('https://api.test', 'refund_request'), null);
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

test('errorMessage — invalid_reason은 해지 이유 문구(환불 요청 맥락 없음)', () => {
  assert.equal(C.errorMessage('invalid_reason', 'refund'), '해지 이유를 다시 확인해 주세요.');
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

test('refundRequestLabel — 환불 요청 처리 결과 표시', () => {
  assert.equal(C.refundRequestLabel({ refundRequest: 'open', refundResolution: null }), '환불 요청됨');
  assert.equal(C.refundRequestLabel({ refundRequest: 'closed', refundResolution: 'refunded' }), '환불 처리됨');
  assert.equal(C.refundRequestLabel({ refundRequest: 'closed', refundResolution: 'rejected' }), '환불 요청 반려 · 고객센터(1877-1979) 문의');
  assert.equal(C.refundRequestLabel({ refundRequest: 'closed', refundResolution: null }), '환불 요청 처리됨');
  assert.equal(C.refundRequestLabel({ refundRequest: 'closed' }), '환불 요청 처리됨');
  assert.equal(C.refundRequestLabel({ refundRequest: null }), null);
  assert.equal(C.refundRequestLabel({}), null);
  assert.equal(C.refundRequestLabel(null), null);
});

// ── 요금제 카드(대표 9/18 2차) — 그 가족의 실제 구성으로 부모님별 방식·포함 내용·금액 ──
const appBase = { elderId: 'e1', title: '엄마', mode: 'app', kind: 'base', amount: 8900, feature: '매일 · 하루 3분' };
const phoneExtra = { elderId: 'e2', title: '아빠', mode: 'phone', kind: 'extra', amount: null, feature: '주 5회 · 하루 3분' };

test('planLineText — {호칭} ({앱|전화}) {포함 내용} · {기본|한 분 더} {금액|준비 중}', () => {
  assert.equal(C.planLineText(appBase), '엄마 (앱) 매일 · 하루 3분 · 기본 8,900원');
  assert.equal(C.planLineText(phoneExtra), '아빠 (전화) 주 5회 · 하루 3분 · 한 분 더 준비 중');
  assert.equal(C.planLineText(Object.assign({}, phoneExtra, { amount: 0 })), '아빠 (전화) 주 5회 · 하루 3분 · 한 분 더 0원');
  // 호칭이 비었으면 '부모님'
  assert.equal(C.planLineText(Object.assign({}, appBase, { title: '' })), '부모님 (앱) 매일 · 하루 3분 · 기본 8,900원');
  // 포함 내용이 없으면(서버 누락) 빈칸을 두 번 찍지 않는다
  assert.equal(C.planLineText(Object.assign({}, appBase, { feature: undefined })), '엄마 (앱) · 기본 8,900원');
  // 호칭은 사용자 입력 그대로(가공·해석하지 않는다 — 화면에는 textContent로만 넣는다)
  assert.equal(C.planLineText(Object.assign({}, appBase, { title: '<b>엄마</b>' })), '<b>엄마</b> (앱) 매일 · 하루 3분 · 기본 8,900원');
});

test('modeSummary — 한 분이면 앱 설치/전화 방식, 여러 분이면 부모님 n분', () => {
  assert.equal(C.modeSummary([appBase]), '앱 설치');
  assert.equal(C.modeSummary([Object.assign({}, appBase, { mode: 'phone' })]), '전화 방식');
  assert.equal(C.modeSummary([appBase, phoneExtra]), '부모님 2분');
  assert.equal(C.modeSummary([]), null);
  assert.equal(C.modeSummary(undefined), null);
});

test('familyModeChips — 부모님별 칩 {호칭} · 앱으로/전화로 받아요(방식 구분)', () => {
  assert.deepEqual(C.familyModeChips([appBase, phoneExtra]), [
    { text: '엄마 · 앱으로 받아요', mode: 'app' },
    { text: '아빠 · 전화로 받아요', mode: 'phone' },
  ]);
  assert.deepEqual(C.familyModeChips([Object.assign({}, appBase, { title: '' })]), [{ text: '부모님 · 앱으로 받아요', mode: 'app' }]);
  assert.deepEqual(C.familyModeChips([]), []);
  assert.deepEqual(C.familyModeChips(undefined), []);
});

test('familyLines — planDetails에서 부모님 구성(줄)을 꺼낸다, 없으면 null(옛 서버)', () => {
  assert.equal(C.familyLines(undefined), null);
  assert.equal(C.familyLines({}), null);
  assert.deepEqual(C.familyLines({ lite: { amount: null, error: 'x', lines: [] }, standard: { amount: 8900, error: null, lines: [appBase] } }), [appBase]);
});

test('planCardModel — 합계·줄·준비 중 안내·선택 가능 여부', () => {
  // 부모님 두 분 이상 — 부모님별 줄+금액
  const ok = C.planCardModel('standard', { amount: 16800, error: null, lines: [appBase, Object.assign({}, appBase, { elderId: 'e3', title: '아빠', kind: 'extra', amount: 7900 })] });
  assert.equal(ok.name, '스탠다드');
  assert.equal(ok.priceText, '월 16,800원');
  assert.equal(ok.summary, null);
  assert.deepEqual(ok.lines.map(segText), ['엄마 (앱) 매일 · 하루 3분 · 기본 8,900원', '아빠 (앱) 매일 · 하루 3분 · 한 분 더 7,900원']);
  assert.equal(ok.selectable, true);
  assert.equal(ok.note, null);
  const pending = C.planCardModel('plus', { amount: null, error: 'phone_extra_price_undecided', lines: [appBase, phoneExtra] });
  assert.equal(pending.priceText, '준비 중');
  assert.equal(pending.selectable, false);
  assert.equal(pending.note, '전화 방식 부모님 한 분 더 요금은 아직 준비 중이에요. 고객센터(1877-1979)로 문의해 주세요.');
  // 검토 M2 — 카드 안내와 오류 안내가 같은 문구
  assert.equal(pending.note, C.errorMessage('phone_extra_price_undecided'));
  assert.equal(pending.lines.length, 2);
  // 합계가 없으면(다른 오류) 준비 중 안내 없이 선택 불가
  const other = C.planCardModel('lite', { amount: null, error: 'no_elder', lines: [] });
  assert.equal(other.selectable, false);
  assert.equal(other.note, null);
});

const segText = (segs) => segs.map((s) => s.text).join('');
const strongs = (segs) => segs.filter((s) => s.strong).map((s) => s.text);
const APP_FEATURE = { lite: '이틀에 한 번 · 하루 3분', standard: '매일 · 하루 3분', plus: '매일 · 하루 5분' };

test('featureSegments — 풀어 쓴 문구(안부·통화)와 앱 대비 다른 칸 굵게(기준은 서버 priceTable.app)', () => {
  // 전화 스탠다드: 주 5회(앱은 매일) 굵게
  let s = C.featureSegments('주 5회 · 하루 3분', APP_FEATURE.standard, true);
  assert.equal(segText(s), '주 5회 안부 · 하루 3분 통화');
  assert.deepEqual(strongs(s), ['주 5회 안부']);
  // 전화 플러스: 하루 3분(앱은 5분) 굵게
  s = C.featureSegments('매일 · 하루 3분', APP_FEATURE.plus, true);
  assert.equal(segText(s), '매일 안부 · 하루 3분 통화');
  assert.deepEqual(strongs(s), ['하루 3분 통화']);
  // 전화 라이트·앱: 앱과 같으면 굵게 없음
  assert.deepEqual(strongs(C.featureSegments('이틀에 한 번 · 하루 3분', APP_FEATURE.lite, true)), []);
  assert.equal(segText(C.featureSegments('이틀에 한 번 · 하루 3분', APP_FEATURE.lite, true)), '이틀에 한 번 안부 · 하루 3분 통화');
  assert.equal(segText(C.featureSegments('매일 · 하루 5분', APP_FEATURE.plus, true)), '매일 안부 · 하루 5분 통화');
  // 비교 기준이 없으면(옛 서버·요금표 없음) 굵게 없음
  assert.deepEqual(strongs(C.featureSegments('주 5회 · 하루 3분', null, true)), []);
  // 풀어 쓰지 않는 형태(여러 분 줄)는 원문 그대로, 굵게는 같게
  s = C.featureSegments('주 5회 · 하루 3분', APP_FEATURE.standard, false);
  assert.equal(segText(s), '주 5회 · 하루 3분');
  assert.deepEqual(strongs(s), ['주 5회']);
  assert.deepEqual(C.featureSegments('', APP_FEATURE.standard, true), []);
  assert.deepEqual(C.featureSegments(undefined, null, true), []);
});

test('planCardModel — 부모님 한 분이면 풀어 쓴 한 줄(금액 중복 없음)', () => {
  const phoneBase = { elderId: 'p1', title: '아빠', mode: 'phone', kind: 'base', amount: 24900, feature: '주 5회 · 하루 3분' };
  const m = C.planCardModel('standard', { amount: 24900, error: null, lines: [phoneBase] }, APP_FEATURE.standard);
  assert.equal(m.priceText, '월 24,900원');
  assert.equal(segText(m.summary), '주 5회 안부 · 하루 3분 통화');
  assert.deepEqual(strongs(m.summary), ['주 5회 안부']);
  assert.deepEqual(m.lines, []);
  assert.doesNotMatch(segText(m.summary), /원/);
  // 앱 한 분 — 굵게 없음
  const a = C.planCardModel('plus', { amount: 14900, error: null, lines: [Object.assign({}, appBase, { feature: '매일 · 하루 5분', amount: 14900 })] }, APP_FEATURE.plus);
  assert.equal(segText(a.summary), '매일 안부 · 하루 5분 통화');
  assert.deepEqual(strongs(a.summary), []);
});

test('planCardModel — 여러 분 줄에서도 전화 부모님의 앱 대비 다른 칸 굵게', () => {
  const m = C.planCardModel('standard', { amount: null, error: 'phone_extra_price_undecided', lines: [appBase, phoneExtra] }, APP_FEATURE.standard);
  assert.equal(m.summary, null);
  assert.deepEqual(m.lines.map(segText), ['엄마 (앱) 매일 · 하루 3분 · 기본 8,900원', '아빠 (전화) 주 5회 · 하루 3분 · 한 분 더 준비 중']);
  assert.deepEqual(m.lines.map(strongs), [[], ['주 5회']]);
  // 전화 기본 + 앱 한 분 더(플러스): 전화 줄의 하루 3분만 굵게
  const pb = { elderId: 'p1', title: '아빠', mode: 'phone', kind: 'base', amount: 29900, feature: '매일 · 하루 3분' };
  const ae = { elderId: 'e1', title: '엄마', mode: 'app', kind: 'extra', amount: 13900, feature: '매일 · 하루 5분' };
  const m2 = C.planCardModel('plus', { amount: 43800, error: null, lines: [pb, ae] }, APP_FEATURE.plus);
  assert.deepEqual(m2.lines.map(strongs), [['하루 3분'], []]);
  assert.equal(segText(m2.lines[1]), '엄마 (앱) 매일 · 하루 5분 · 한 분 더 13,900원');
});

test('priceTableSections — 참고용 전체 요금표(앱 설치·전화), 금액 없으면 준비 중', () => {
  const table = {
    app: { lite: { base: 5900, extra: 4900, feature: '이틀에 한 번 · 하루 3분' }, standard: { base: 8900, extra: 7900, feature: '매일 · 하루 3분' }, plus: { base: 14900, extra: 13900, feature: '매일 · 하루 5분' } },
    phone: { lite: { base: 19900, extra: null, feature: '이틀에 한 번 · 하루 3분' }, standard: { base: 24900, extra: null, feature: '주 5회 · 하루 3분' }, plus: { base: 29900, extra: null, feature: '매일 · 하루 3분' } },
  };
  const s = C.priceTableSections(table);
  assert.deepEqual(s.map((x) => x.title), ['앱 설치', '전화(무설치)']);
  assert.deepEqual(s[0].rows[0], { name: '라이트', feature: '이틀에 한 번 · 하루 3분', price: '기본 5,900원 · 한 분 더 4,900원' });
  assert.deepEqual(s[1].rows[1], { name: '스탠다드', feature: '주 5회 · 하루 3분', price: '기본 24,900원 · 한 분 더 준비 중' });
  assert.deepEqual(C.priceTableSections(undefined), []);
  assert.deepEqual(C.priceTableSections({ app: table.app }).map((x) => x.title), ['앱 설치']);
});

test('필수 고지 1번째 줄 — 방식 요약이 있으면 {요금제} 요금제 · {방식} · 월 {금액}', () => {
  const base = { planName: '스탠다드', amount: 8900, chargeKind: 'trial_end', chargeAt: '2026-10-25T03:00:00.000Z' };
  assert.equal(C.noticeLines(Object.assign({ modeSummary: '앱 설치' }, base))[0], '스탠다드 요금제 · 앱 설치 · 월 8,900원 (부가세 포함)');
  assert.equal(C.noticeLines(Object.assign({ modeSummary: '부모님 2분' }, base))[0], '스탠다드 요금제 · 부모님 2분 · 월 8,900원 (부가세 포함)');
  assert.equal(C.noticeLines(Object.assign({ modeSummary: null }, base))[0], '스탠다드 요금제 · 월 8,900원 (부가세 포함)');
  assert.equal(C.noticeLines({ planName: '스탠다드', amount: null, monthlyAmount: 8900, chargeKind: 'none', chargeAt: null, modeSummary: '전화 방식' })[0],
    '스탠다드 요금제 · 전화 방식 · 월 8,900원 (부가세 포함)');
});

test('요금제 카드 문구 — 금칙어·부가세 별도 없음', () => {
  const all = [C.planLineText(appBase), C.planLineText(phoneExtra), C.familyModeChips([appBase, phoneExtra]).map((c) => c.text).join(' '),
    segText(C.featureSegments('주 5회 · 하루 3분', APP_FEATURE.standard, true)),
    C.planCardModel('plus', { amount: null, error: 'phone_extra_price_undecided', lines: [phoneExtra] }).note].join(' ');
  assert.doesNotMatch(all, /위험|감지|부가세 별도/);
});

test('readOnlyCompositionLines — 준비 중(amount_error · phone_extra_price_undecided) 가족에게 구성을 읽기 전용으로 보인다(검토 M1)', () => {
  const pd = { lite: { amount: null, error: 'phone_extra_price_undecided', lines: [appBase, phoneExtra] } };
  const s = { isOwner: true, billingEnabled: true, subscription: { status: 'trial', billing: {} }, amount: null, amountError: 'phone_extra_price_undecided', planDetails: pd };
  assert.equal(C.decideView(s), 'amount_error');
  assert.deepEqual(C.readOnlyCompositionLines(s), [appBase, phoneExtra]);
  // 다른 금액 오류 · planDetails 없음(옛 서버) · 줄 없음이면 null(메시지만)
  assert.equal(C.readOnlyCompositionLines(Object.assign({}, s, { amountError: 'no_elder' })), null);
  assert.equal(C.readOnlyCompositionLines(Object.assign({}, s, { planDetails: undefined })), null);
  assert.equal(C.readOnlyCompositionLines(Object.assign({}, s, { planDetails: { lite: { amount: null, error: 'x', lines: [] } } })), null);
  assert.equal(C.readOnlyCompositionLines(null), null);
});

test('normalizePayer — KG이니시스 필수 결제자 정보(이름·휴대폰·이메일)를 다듬어 SDK customer 형식으로', () => {
  assert.deepEqual(C.normalizePayer({ name: ' 신보호 ', phone: '010-1234-5678', email: ' p@x.com ' }),
    { ok: true, value: { fullName: '신보호', phoneNumber: '01012345678', email: 'p@x.com' } });
  assert.equal(C.normalizePayer({ name: '', phone: '01012345678', email: 'p@x.com' }).error, 'payer_name');
  assert.equal(C.normalizePayer({ name: '신', phone: '0212345678', email: 'p@x.com' }).error, 'payer_phone');
  assert.equal(C.normalizePayer({ name: '신', phone: '010123', email: 'p@x.com' }).error, 'payer_phone');
  assert.equal(C.normalizePayer({ name: '신', phone: '01012345678', email: 'px.com' }).error, 'payer_email');
  assert.equal(C.normalizePayer(null).error, 'payer_name');
  ['payer_name', 'payer_phone', 'payer_email'].forEach((code) => assert.notEqual(C.errorMessage(code), C.errorMessage('없는코드')));
});

// ── 대표 9/18 3차: 청약철회 삭제 · 결제일 문구(가족별 첫 결제일 기준) ──
const EVERY_MONTH = '이후에도 한 달마다 같은 날 자동결제돼요.';
const MONTH_END = ' 그 날짜가 없는 달은 말일에 결제돼요.';

test('결제 기준일 billingDay — 서버 값이 우선, 29일 이상이면 말일 안내', () => {
  const imm = (billingDay) => C.noticeLines({ planName: '스탠다드', amount: 10800, chargeKind: 'immediate', chargeAt: '2026-09-18T03:00:00.000Z',
    nextChargeAt: '2026-10-18T03:00:00.000Z', nextAmount: 10800, billingDay })[2];
  assert.equal(imm(18), '다음 결제는 10월 18일(첫 결제일로부터 한 달 뒤)에 10,800원이고, ' + EVERY_MONTH);
  assert.equal(imm(undefined), imm(18)); // 옛 서버 — 결제 예정일에서 읽는다
  assert.equal(imm(null), imm(18));
  // 기준일이 31일인데 다음 결제가 2월 28일이면 날짜만으로는 모른다 — 서버 billingDay로 말일 안내를 붙인다
  const feb = (billingDay) => C.noticeLines({ planName: '스탠다드', amount: 8900, chargeKind: 'renewal', chargeAt: '2027-02-28T03:00:00.000Z', billingDay })[2];
  assert.equal(feb(31), '2월 28일에 8,900원이 결제되고, ' + EVERY_MONTH + MONTH_END);
  assert.equal(feb(undefined), '2월 28일에 8,900원이 결제되고, ' + EVERY_MONTH);
  assert.equal(feb(29), feb(31));
  assert.equal(feb(28), feb(undefined));
  // 이상한 값은 무시하고 결제 예정일에서 읽는다(화면이 깨지지 않는다)
  ['x', 0, 32, 15.5, ''].forEach((bad) => assert.equal(feb(bad), feb(undefined), String(bad)));
  // 옛 서버 + 기준일 30일 — 다음 결제 예정일(10월 30일)에서 읽어 말일 안내
  const overdue = C.noticeLines({ planName: '플러스', amount: 14900, chargeKind: 'overdue', chargeAt: '2026-09-26T03:00:00.000Z',
    nextChargeAt: '2026-10-30T03:00:00.000Z', nextAmount: 14900 })[2];
  assert.equal(overdue, '다음 결제는 10월 30일에 14,900원이고, ' + EVERY_MONTH + MONTH_END);
});

test('결제일 문구 — "매월 N일"처럼 회사 전체 고정일로 읽히는 표현이 없다', () => {
  const all = ['trial_end', 'renewal', 'overdue', 'immediate', 'pause_end'].map((kind) => C.noticeLines({
    planName: '스탠다드', amount: 8900, chargeKind: kind, chargeAt: '2026-10-31T03:00:00.000Z',
    nextChargeAt: '2026-11-30T03:00:00.000Z', nextAmount: 8900, billingDay: 31 }).join(' '))
    .concat([C.doneChargeLine({ chargeAt: '2026-10-31T03:00:00.000Z', amount: 8900, billingDay: 31 })]).join(' ');
  assert.doesNotMatch(all, /매월 \d+일/);
  assert.match(all, /한 달마다 같은 날/);
});

test('doneChargeLine — 등록 완료 화면의 결제 안내', () => {
  assert.equal(C.doneChargeLine({ chargeAt: '2026-10-25T03:00:00.000Z', amount: 8900 }), '10월 25일에 8,900원이 결제되고, ' + EVERY_MONTH);
  assert.equal(C.doneChargeLine({ chargeAt: '2026-10-31T03:00:00.000Z', amount: 14900 }), '10월 31일에 14,900원이 결제되고, ' + EVERY_MONTH + MONTH_END);
  assert.equal(C.doneChargeLine({ chargeAt: '2026-10-18T03:00:00.000Z', amount: 10800, billingDay: 30 }), '10월 18일에 10,800원이 결제되고, ' + EVERY_MONTH + MONTH_END);
  assert.equal(C.doneChargeLine({ chargeAt: null, amount: 8900 }), null);
  assert.equal(C.doneChargeLine(null), null);
});

// 화면에 나올 수 있는 문자열 전부 — PayCore 결과 + HTML 본문(주석 제외) + pay-app.js의 문자열 리터럴(주석 줄 제외).
function allScreenStrings() {
  const fs = require('node:fs');
  const path = require('node:path');
  const out = [];
  const opts = { planName: '스탠다드', amount: 8900, monthlyAmount: 8900, chargeAt: '2026-10-31T03:00:00.000Z',
    nextChargeAt: '2026-11-30T03:00:00.000Z', nextAmount: 8900, modeSummary: '앱 설치' };
  ['none', 'trial_end', 'renewal', 'overdue', 'immediate', 'pause_end', 'weird'].forEach((chargeKind) =>
    [true, false, undefined].forEach((firstCharge) => [31, undefined].forEach((billingDay) =>
      out.push(...C.noticeLines(Object.assign({}, opts, { chargeKind, firstCharge, billingDay }))))));
  const active = { status: 'active', billing: { currentPeriodEnd: '2026-10-25T03:00:00.000Z' } };
  out.push(C.cancelRefundText(active, [{ status: 'paid', withdrawalEligible: true, refundRequest: null }]));
  out.push(C.cancelRefundText(active, []));
  out.push(C.cancelKeepText(active, new Date('2026-10-01T00:00:00.000Z')));
  out.push(C.doneChargeLine({ chargeAt: '2026-10-31T03:00:00.000Z', amount: 8900 }));
  ['open', 'closed'].forEach((r) => ['refunded', 'rejected', null].forEach((x) => out.push(C.refundRequestLabel({ refundRequest: r, refundResolution: x }))));
  ['trial_end', 'overdue', 'immediate', 'renewal'].forEach((k) => out.push(C.submitLabel({ chargeKind: k, amount: 8900 })));
  out.push(C.pauseOffer({ eligible: true, from: '2026-10-25T03:00:00.000Z', until: '2026-11-25T03:00:00.000Z' }).text);
  // 단계 선택(9/19) — 이름표·조합 요약·카드·안내·검증·결과 문구
  const E3 = [{ elderId: 'a', title: '할머니', name: '김순자', mode: 'app', paired: false }, { elderId: 'b', title: '할아버지', name: '', mode: 'phone' }, { elderId: 'c', title: '', name: '', mode: 'app' }];
  E3.forEach((e, i) => out.push(C.elderLabel(e, i)));
  const T = { app: { lite: { base: 5900, extra: 4900, feature: '이틀에 한 번 · 하루 3분' }, standard: { base: 8900, extra: 7900, feature: '매일 · 하루 3분' }, plus: { base: 14900, extra: 13900, feature: '매일 · 하루 5분' } },
    phone: { lite: { base: 19900, extra: null, feature: '이틀에 한 번 · 하루 3분' }, standard: { base: 24900, extra: 23900, feature: '주 5회 · 하루 3분' }, plus: { base: 29900, extra: 28900, feature: '매일 · 하루 3분' } } };
  const mixedSel = [{ elderId: 'a', mode: 'app' }, { elderId: 'b', mode: 'phone' }];
  ['lite', 'standard', 'plus'].forEach((p) => {
    const m = C.stepPlanCardModel(p, mixedSel, E3, T);
    out.push(m.priceText, m.note, ...m.features.map((f) => f.map((x) => x.text).join('')));
  });
  out.push(C.selectionSummary(mixedSel), C.selectionSummary([mixedSel[1]]), C.selectionDescribe(mixedSel, E3), C.selectionConfirmText([mixedSel[0]], E3),
    C.selectionAppliedText({ appliesAt: 'now' }), C.selectionAppliedText({ appliesAt: 'next_billing', nextChargeAt: '2026-10-25T03:00:00.000Z' }),
    C.selectionPriceHint('lite', 5900), C.PHONE_MODE_PENDING, C.UNPAIRED_NOTE, C.UNPAIRED_NOTE_NO_PHONE, C.EXCLUDED_NOTE, C.SAME_PRICE_HINT,
    ...Object.values(C.STEP_TEXT), ...Object.values(C.MODE_CHOICE));
  const one = C.stepsSetCount(C.defaultStepState(E3, null, true), 1, E3);
  out.push(C.validateSteps(one, E3, {}).message, C.validateSteps(C.stepsSetCount(one, 2, E3), E3, {}).message);
  ['invalid_selection', 'phone_mode_unavailable', 'same_selection'].forEach((c) => out.push(C.errorMessage(c)));
  ['consent_required', 'not_refundable', 'invalid_reason', 'period_ended', '???'].forEach((c) =>
    ['pause', 'refund', undefined].forEach((ctx) => out.push(C.errorMessage(c, ctx))));
  const html = fs.readFileSync(path.join(__dirname, '../../banggeul-pay.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  out.push(html);
  const app = fs.readFileSync(path.join(__dirname, 'pay-app.js'), 'utf8')
    .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  out.push(...(app.match(/'(?:[^'\\\n]|\\.)*'/g) || []));
  return out.filter(Boolean).join('\n');
}

test('화면 문구에 7일 환불·청약철회·가족당 1회가 없다(대표 9/18)', () => {
  const all = allScreenStrings();
  assert.ok(all.includes('결제수단 등록')); // 실제로 화면 문자열을 모았는지 확인
  assert.ok(all.includes('방글이 앱 설치하기')); // pay-app.js 리터럴까지 모았는지 확인
  assert.ok(all.includes('환불되지 않아요'));
  assert.doesNotMatch(all, /7일|청약철회|가족당 1회/);
  assert.ok(!/refund-dialog|환불 요청 보내기/.test(all), '환불 요청 창이 남아 있다');
});

test('화면 문구에 금칙어(위험·감지·부가세 별도)가 없다', () => {
  assert.doesNotMatch(allScreenStrings(), /위험|감지|부가세 별도/);
});

// ── 단계 선택형 결제(9/19 API 계약) ──
const ELDERS = [
  { elderId: 'e1', title: '할머니', name: '김순자', mode: 'app', paired: true, billingExcluded: false },
  { elderId: 'e2', title: '할아버지', name: '', mode: 'phone', paired: false, billingExcluded: false },
];
const TABLE = {
  app: { lite: { base: 5900, extra: 4900, feature: '이틀에 한 번 · 하루 3분' }, standard: { base: 8900, extra: 7900, feature: '매일 · 하루 3분' }, plus: { base: 14900, extra: 13900, feature: '매일 · 하루 5분' } },
  phone: { lite: { base: 19900, extra: 18900, feature: '이틀에 한 번 · 하루 3분' }, standard: { base: 24900, extra: 23900, feature: '주 5회 · 하루 3분' }, plus: { base: 29900, extra: 28900, feature: '매일 · 하루 3분' } },
};

test('elderLabel — 호칭+이름, 이름 없으면 호칭, 호칭 없으면 이름, 둘 다 없으면 부모님 {순번}', () => {
  assert.equal(C.elderLabel({ title: '할머니', name: '김순자' }, 0), '할머니 김순자');
  assert.equal(C.elderLabel({ title: '할아버지', name: '' }, 1), '할아버지');
  assert.equal(C.elderLabel({ title: ' ', name: '박영수' }, 1), '박영수');
  assert.equal(C.elderLabel({ title: '', name: '' }, 0), '부모님 1');
  assert.equal(C.elderLabel({}, 1), '부모님 2');
  assert.equal(C.elderLabel({ title: '<b>엄마</b>', name: '' }, 0), '<b>엄마</b>'); // 가공하지 않는다(textContent로만)
});

test('hasSteps — /status에 elders·priceTable이 있어야 단계 화면(없으면 옛 요금제 카드로)', () => {
  assert.equal(C.hasSteps({ elders: ELDERS, priceTable: TABLE }), true);
  assert.equal(C.hasSteps({ priceTable: TABLE }), false);
  assert.equal(C.hasSteps({ elders: [], priceTable: TABLE }), false);
  assert.equal(C.hasSteps({ elders: ELDERS }), false);
  assert.equal(C.hasSteps(null), false);
});

test('defaultStepState — 모두 같은 방식이면 ①에 그 방식, 섞이면 부모님마다 펼침, 전원 선택', () => {
  const same = C.defaultStepState([ELDERS[0], Object.assign({}, ELDERS[1], { mode: 'app' })], null, true);
  assert.equal(same.perParent, false);
  assert.equal(same.sharedMode, 'app');
  assert.equal(same.count, 2);
  assert.deepEqual(same.chosen, ['e1', 'e2']);
  const mixed = C.defaultStepState(ELDERS, null, true);
  assert.equal(mixed.perParent, true);
  assert.deepEqual(mixed.modes, { e1: 'app', e2: 'phone' });
  assert.deepEqual(C.stepSelection(mixed, ELDERS), [{ elderId: 'e1', mode: 'app' }, { elderId: 'e2', mode: 'phone' }]);
});

test('defaultStepState — 서버 selection(청구 기준)이 있으면 그 부모님·방식, 구독 안 함 부모님은 빠진다', () => {
  const st = C.defaultStepState(ELDERS, [{ elderId: 'e2', mode: 'phone' }], true);
  assert.equal(st.count, 1);
  assert.deepEqual(st.chosen, ['e2']);
  assert.equal(st.perParent, false);
  assert.equal(st.sharedMode, 'phone');
  // 모르는 elderId는 무시, selection이 쓸모없으면 billingExcluded 아닌 분만
  const ex = C.defaultStepState([ELDERS[0], Object.assign({}, ELDERS[1], { billingExcluded: true })], [{ elderId: 'zz', mode: 'app' }], true);
  assert.deepEqual(ex.chosen, ['e1']);
  // 전원이 제외돼 있으면 전원(빈 선택으로 시작하지 않는다)
  const all = C.defaultStepState(ELDERS.map((e) => Object.assign({}, e, { billingExcluded: true })), null, true);
  assert.deepEqual(all.chosen, ['e1', 'e2']);
});

test('defaultStepState — 전화 방식을 못 쓰는 가족(phoneModeAvailable false)은 앱으로 시작', () => {
  const st = C.defaultStepState(ELDERS, null, false);
  assert.equal(st.perParent, false);
  assert.equal(st.sharedMode, 'app');
  assert.deepEqual(C.stepSelection(st, ELDERS).map((x) => x.mode), ['app', 'app']);
});

test('단계 상태 전이 — ① 모두 같게 · 부모님마다 다르게 펼치기/접기 · 부모님별 방식', () => {
  let st = C.defaultStepState(ELDERS, null, true); // 섞임 → 펼침
  st = C.stepsSetShared(st, 'phone');
  assert.equal(st.perParent, false);
  assert.deepEqual(C.stepSelection(st, ELDERS).map((x) => x.mode), ['phone', 'phone']);
  st = C.stepsSetPerParent(st, true, ELDERS); // 지금 보이는 방식 그대로 펼친다
  assert.deepEqual(st.modes, { e1: 'phone', e2: 'phone' });
  st = C.stepsSetElderMode(st, 'e1', 'app');
  assert.deepEqual(C.stepSelection(st, ELDERS), [{ elderId: 'e1', mode: 'app' }, { elderId: 'e2', mode: 'phone' }]);
  st = C.stepsSetPerParent(st, false, ELDERS); // 접으면 첫 분의 방식으로 모두
  assert.equal(st.perParent, false);
  assert.deepEqual(C.stepSelection(st, ELDERS).map((x) => x.mode), ['app', 'app']);
});

test('단계 상태 전이 — ② 몇 분·누구(한 분이면 누구 필수, 전원이면 모두)', () => {
  let st = C.defaultStepState(ELDERS, null, true);
  st = C.stepsSetCount(st, 1, ELDERS);
  assert.equal(st.count, 1);
  assert.deepEqual(st.chosen, []); // 다시 고르게 비운다
  let v = C.validateSteps(st, ELDERS, {});
  assert.equal(v.ok, false);
  assert.equal(v.error, 'who_required');
  assert.equal(v.message, '어느 부모님께 드릴지 골라 주세요.');
  st = C.stepsSetChosen(st, 'e2', true, ELDERS);
  st = C.stepsSetChosen(st, 'e1', true, ELDERS); // 한 분 — 라디오처럼 바뀐다
  assert.deepEqual(st.chosen, ['e1']);
  v = C.validateSteps(st, ELDERS, {});
  assert.equal(v.ok, true);
  assert.deepEqual(v.selection, [{ elderId: 'e1', mode: 'app' }]);
  st = C.stepsSetCount(st, 2, ELDERS); // 전원
  assert.deepEqual(st.chosen, ['e1', 'e2']);
  assert.equal(C.stepsSetCount(st, 9, ELDERS).count, 2); // 부모님 수를 넘지 않는다
  assert.equal(C.stepsSetCount(st, 0, ELDERS).count, 1);
});

test('단계 상태 전이 — 세 분 중 두 분(체크박스), 등록 순서 유지', () => {
  const three = ELDERS.concat([{ elderId: 'e3', title: '', name: '', mode: 'app' }]);
  let st = C.stepsSetCount(C.defaultStepState(three, null, true), 2, three);
  st = C.stepsSetChosen(st, 'e3', true, three);
  assert.equal(C.validateSteps(st, three, {}).message, '부모님 두 분을 골라 주세요.');
  st = C.stepsSetChosen(st, 'e1', true, three);
  assert.deepEqual(st.chosen, ['e1', 'e3']);
  assert.equal(C.validateSteps(st, three, {}).ok, true);
  st = C.stepsSetChosen(st, 'e1', false, three);
  assert.deepEqual(st.chosen, ['e3']);
  // 한 분으로 줄이면 이미 고른 한 분은 남는다
  assert.deepEqual(C.stepsSetCount(st, 1, three).chosen, ['e3']);
});

test('validateSteps — 전화 불가 가족에 전화 · 요금제 필수(고를 수 없는 요금제 포함) · 부모님 없음', () => {
  const st = C.stepsSetShared(C.defaultStepState(ELDERS, null, true), 'phone');
  const v = C.validateSteps(st, ELDERS, { phoneModeAvailable: false });
  assert.equal(v.error, 'phone_mode_unavailable');
  assert.equal(v.message, '전화 방식은 아직 준비 중이에요. 앱으로 받기를 골라 주세요.');
  assert.equal(C.validateSteps(st, ELDERS, { requirePlan: true, plan: null, priceTable: TABLE }).error, 'invalid_plan');
  assert.equal(C.validateSteps(st, ELDERS, { requirePlan: true, plan: 'gold', priceTable: TABLE }).error, 'invalid_plan');
  const noExtra = { app: TABLE.app, phone: Object.assign({}, TABLE.phone, { lite: { base: 19900, extra: null } }) };
  assert.equal(C.validateSteps(st, ELDERS, { requirePlan: true, plan: 'lite', priceTable: noExtra }).error, 'invalid_plan');
  assert.equal(C.validateSteps(st, ELDERS, { requirePlan: true, plan: 'lite', priceTable: TABLE }).ok, true);
  assert.equal(C.validateSteps(st, [], {}).error, 'no_elder');
});

test('displayTotal — 등록 순서 첫 분 기본·나머지 한 분 더, 방식별 요금(표시용)', () => {
  assert.equal(C.displayTotal('lite', [{ elderId: 'e2', mode: 'phone' }], ELDERS, TABLE), 19900);
  // 섞임: 할머니(앱, 먼저 등록) 기본 + 할아버지(전화) 한 분 더 — selection 순서와 무관
  assert.equal(C.displayTotal('standard', [{ elderId: 'e2', mode: 'phone' }, { elderId: 'e1', mode: 'app' }], ELDERS, TABLE), 8900 + 23900);
  assert.equal(C.displayTotal('plus', [{ elderId: 'e1', mode: 'phone' }, { elderId: 'e2', mode: 'phone' }], ELDERS, TABLE), 29900 + 28900);
  // 나중 등록한 분 한 분만 결제해도 그 분이 기본 요금
  assert.equal(C.displayTotal('standard', [{ elderId: 'e2', mode: 'app' }], ELDERS, TABLE), 8900);
  assert.deepEqual(C.displayTotals([{ elderId: 'e1', mode: 'app' }], ELDERS, TABLE), { lite: 5900, standard: 8900, plus: 14900 });
  assert.equal(C.displayTotal('lite', [], ELDERS, TABLE), null);
  assert.equal(C.displayTotal('lite', [{ elderId: 'e1', mode: 'app' }], ELDERS, null), null);
  assert.equal(C.displayTotal('lite', [{ elderId: 'e1', mode: 'app' }, { elderId: 'e2', mode: 'phone' }], ELDERS,
    { app: TABLE.app, phone: { lite: { base: 19900, extra: null } } }), null);
});

test('stepPlanCardModel — 월 합계 하나, 방식별 포함 내용(전화는 앱과 다른 칸 굵게), 섞이면 두 줄', () => {
  const phoneOne = C.stepPlanCardModel('standard', [{ elderId: 'e2', mode: 'phone' }], ELDERS, TABLE);
  assert.equal(phoneOne.priceText, '월 24,900원');
  assert.equal(phoneOne.selectable, true);
  assert.equal(phoneOne.features.length, 1);
  assert.equal(segText(phoneOne.features[0]), '주 5회 안부 · 하루 3분 통화');
  assert.deepEqual(strongs(phoneOne.features[0]), ['주 5회 안부']);
  const mixed = C.stepPlanCardModel('plus', [{ elderId: 'e1', mode: 'app' }, { elderId: 'e2', mode: 'phone' }], ELDERS, TABLE);
  assert.equal(mixed.priceText, '월 43,800원');
  assert.deepEqual(mixed.features.map(segText), ['앱: 매일 안부 · 하루 5분 통화', '전화: 매일 안부 · 하루 3분 통화']);
  assert.deepEqual(mixed.features.map(strongs), [[], ['하루 3분 통화']]);
  const pending = C.stepPlanCardModel('lite', [{ elderId: 'e1', mode: 'phone' }, { elderId: 'e2', mode: 'phone' }], ELDERS,
    { app: TABLE.app, phone: Object.assign({}, TABLE.phone, { lite: { base: 19900, extra: null, feature: 'x · y' } }) });
  assert.equal(pending.priceText, '준비 중');
  assert.equal(pending.selectable, false);
  assert.equal(pending.note, C.errorMessage('phone_extra_price_undecided'));
});

test('selectionSummary — "전화 · 한 분", 섞이면 "앱 1분 · 전화 1분" → 필수 고지 1번째 줄', () => {
  assert.equal(C.selectionSummary([{ elderId: 'e2', mode: 'phone' }]), '전화 · 한 분');
  assert.equal(C.selectionSummary([{ elderId: 'e1', mode: 'app' }, { elderId: 'e2', mode: 'app' }]), '앱 · 두 분');
  assert.equal(C.selectionSummary([{ elderId: 'e1', mode: 'app' }, { elderId: 'e2', mode: 'phone' }]), '앱 1분 · 전화 1분');
  assert.equal(C.selectionSummary([]), null);
  const line1 = C.noticeLines({ planName: '라이트', amount: 19900, monthlyAmount: 19900, chargeKind: 'trial_end',
    chargeAt: '2026-10-25T03:00:00.000Z', modeSummary: C.selectionSummary([{ elderId: 'e2', mode: 'phone' }]) })[0];
  assert.equal(line1, '라이트 요금제 · 전화 · 한 분 · 월 19,900원 (부가세 포함)');
  assert.equal(C.countWord(3), '세 분');
  assert.equal(C.countWord(12), '12분');
});

test('selectionDescribe · sameSelection — 구독 관리의 지금/다음 결제부터', () => {
  assert.equal(C.selectionDescribe([{ elderId: 'e2', mode: 'phone' }, { elderId: 'e1', mode: 'app' }], ELDERS), '할머니 김순자 (앱) · 할아버지 (전화)');
  assert.equal(C.selectionDescribe(null, ELDERS), '');
  assert.equal(C.sameSelection([{ elderId: 'e1', mode: 'app' }, { elderId: 'e2', mode: 'phone' }], [{ elderId: 'e2', mode: 'phone' }, { elderId: 'e1', mode: 'app' }]), true);
  assert.equal(C.sameSelection([{ elderId: 'e1', mode: 'app' }], [{ elderId: 'e1', mode: 'phone' }]), false);
  assert.equal(C.sameSelection([{ elderId: 'e1', mode: 'app' }], [{ elderId: 'e1', mode: 'app' }, { elderId: 'e2', mode: 'app' }]), false);
});

test('unpairedNotes — 앱 방식인데 앱 연결이 안 된(paired false) 고른 부모님에게만 권유(막지 않음)', () => {
  let st = C.stepsSetShared(C.defaultStepState(ELDERS, null, true), 'app');
  assert.deepEqual(C.unpairedNotes(st, ELDERS), [{ elderId: 'e2', label: '할아버지', text: '부모님 휴대폰에 방글이 앱 설치가 필요해요 — 전화로 받기를 권해요' }]);
  assert.equal(C.validateSteps(st, ELDERS, {}).ok, true); // 막지 않는다
  assert.deepEqual(C.unpairedNotes(C.stepsSetShared(st, 'phone'), ELDERS), []);
  st = C.stepsSetChosen(C.stepsSetCount(st, 1, ELDERS), 'e1', true, ELDERS); // 할아버지를 고르지 않으면 안내 없음
  assert.deepEqual(C.unpairedNotes(st, ELDERS), []);
  // 전화 방식을 못 쓰는 가족에게는 전화를 권하지 않는다
  assert.deepEqual(C.unpairedNotes(C.stepsSetShared(C.defaultStepState(ELDERS, null, false), 'app'), ELDERS, false).map((n) => n.text),
    ['부모님 휴대폰에 방글이 앱 설치가 필요해요']);
  // paired가 없으면(모름) 안내하지 않는다
  const unknown = [{ elderId: 'x', mode: 'app' }];
  assert.deepEqual(C.unpairedNotes(C.defaultStepState(unknown, null, true), unknown), []);
});

test('요청 본문 — checkout {method, plan, selection} · billing-key · selection (옛 흐름은 method만)', () => {
  const sel = [{ elderId: 'e2', mode: 'phone', extra: 'x' }];
  assert.deepEqual(C.checkoutBody('CARD', 'lite', sel), { method: 'CARD', plan: 'lite', selection: [{ elderId: 'e2', mode: 'phone' }] });
  assert.deepEqual(C.checkoutBody('CARD', null, null), { method: 'CARD' });
  assert.deepEqual(C.billingKeyBody('bk', { method: 'KAKAOPAY', consentVersion: 'v1', plan: 'plus', selection: sel }),
    { billingKey: 'bk', method: 'KAKAOPAY', consent: { autoPay: true, version: 'v1' }, plan: 'plus', selection: [{ elderId: 'e2', mode: 'phone' }] });
  // 옛 형식 PENDING·결제수단만 변경에는 plan·selection이 없다 — 싣지 않는다
  assert.deepEqual(C.billingKeyBody('bk', { method: 'CARD', consentVersion: 'v1', plan: null, selection: null }),
    { billingKey: 'bk', method: 'CARD', consent: { autoPay: true, version: 'v1' } });
  assert.deepEqual(C.billingKeyBody('bk', { method: 'CARD', consentVersion: 'v1' }), { billingKey: 'bk', method: 'CARD', consent: { autoPay: true, version: 'v1' } });
  assert.deepEqual(C.selectionBody(sel), { selection: [{ elderId: 'e2', mode: 'phone' }] });
  // 모바일 복귀 — sessionStorage JSON 왕복 뒤에도 같은 본문
  const pending = JSON.parse(JSON.stringify({ method: 'CARD', consentVersion: C.BILLING_CONSENT_VERSION, plan: 'lite', selection: sel }));
  assert.deepEqual(C.billingKeyBody('bk', pending), { billingKey: 'bk', method: 'CARD', consent: { autoPay: true, version: C.BILLING_CONSENT_VERSION },
    plan: 'lite', selection: [{ elderId: 'e2', mode: 'phone' }] });
});

test('checkoutMonthly — 버튼·고지 금액은 /checkout 응답만(줄 합계, 없으면 amount)', () => {
  assert.equal(C.checkoutMonthly({ amount: 19900, lines: [{ kind: 'base', amount: 8900 }, { kind: 'extra', amount: 23900 }] }), 32800);
  assert.equal(C.checkoutMonthly({ amount: 19900 }), 19900);
  assert.equal(C.checkoutMonthly({ amount: null, lines: [] }), null);
  assert.equal(C.checkoutMonthly({ amount: 5, lines: [{ amount: null }] }), 5);
  assert.equal(C.checkoutMonthly(null), null);
});

test('구독 관리 결과·확인·예상 금액 문구', () => {
  assert.equal(C.selectionAppliedText({ ok: true, appliesAt: 'now' }), '바로 적용됐어요.');
  assert.equal(C.selectionAppliedText({ appliesAt: 'next_billing', nextChargeAt: '2026-10-24T15:30:00.000Z' }), '다음 결제일(10월 25일)부터 적용돼요.');
  assert.equal(C.selectionAppliedText({ appliesAt: 'next_billing' }, '2026-11-01T03:00:00.000Z'), '다음 결제일(11월 1일)부터 적용돼요.');
  assert.equal(C.selectionAppliedText({ appliesAt: 'next_billing' }), '다음 결제일부터 적용돼요.');
  assert.equal(C.selectionConfirmText([{ elderId: 'e2', mode: 'phone' }], ELDERS),
    '전화 · 한 분으로 바꿀까요? 선택하지 않은 부모님은 안부전화가 멈춰요. 기록은 그대로 남고, 언제든 다시 추가할 수 있어요.');
  assert.equal(C.selectionConfirmText([{ elderId: 'e1', mode: 'app' }, { elderId: 'e2', mode: 'app' }], ELDERS), '앱 · 두 분으로 바꿀까요?');
  assert.equal(C.selectionPriceHint('standard', 16800), '바꾸면 스탠다드 요금제 월 16,800원이에요(부가세 포함).');
  assert.equal(C.selectionPriceHint('standard', null), '');
});

test('errorMessage — invalid_selection · phone_mode_unavailable', () => {
  assert.equal(C.errorMessage('invalid_selection'), '부모님 선택을 다시 확인해 주세요.');
  assert.equal(C.errorMessage('phone_mode_unavailable'), '전화 방식은 아직 준비 중이에요. 앱으로 받기를 골라 주세요.');
});

test('단계 화면 문구 — 확정 문구 그대로, 금칙어 검사가 새 문구까지 모은다', () => {
  assert.equal(C.PHONE_MODE_PENDING, '전화 방식 준비 중이에요');
  assert.equal(C.EXCLUDED_NOTE, '선택하지 않은 부모님은 안부전화가 멈춰요. 기록은 그대로 남고, 언제든 다시 추가할 수 있어요.');
  assert.equal(C.SAME_PRICE_HINT, '할머니·할아버지도 같은 요금이에요');
  assert.equal(C.STEP_TEXT.perParentOpen, '부모님마다 다르게 할게요');
  assert.deepEqual(C.MODE_CHOICE, { app: '앱으로 받기', phone: '전화로 받기' });
  const all = allScreenStrings();
  ['부모님마다 다르게 할게요', '전화 방식 준비 중이에요', '할머니 김순자', '앱 1분 · 전화 1분', '다음 결제일(10월 25일)부터 적용돼요.',
    '방식·인원 바꾸기', '어느 분께 드릴까요?'].forEach((t) => assert.ok(all.includes(t), t));
});
