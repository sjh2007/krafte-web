// banggeul-assets/pay/pay-core.js
// 방글이 웹 결제 화면의 순수 로직 — 브라우저(window.PayCore)와 node --test 양쪽에서 쓴다.
// 금액은 서버 응답만 쓰고 여기서 계산하지 않는다(요금표를 웹에 두지 않는다).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PayCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var KST_MS = 9 * 60 * 60 * 1000;
  var BILLING_CONSENT_VERSION = '2026-09-17';
  var CS_PHONE = '1877-1979';
  var PLAN_NAMES = { lite: '라이트', standard: '스탠다드', plus: '플러스' };
  var METHOD_LABELS = { CARD: '카드', KAKAOPAY: '카카오페이', NAVERPAY: '네이버페이' };
  var OAUTH_PROVIDERS = { kakao: true, naver: true };
  var CHARGE_KINDS = { none: true, trial_end: true, renewal: true, overdue: true, immediate: true, pause_end: true };
  // 해지 이유 — 서버 화이트리스트(CANCEL_REASONS)와 같은 순서·값. 라벨은 운영 콘솔과 같다.
  var CANCEL_REASONS = [
    { value: 'price', label: '요금이 부담돼요' },
    { value: 'not_used', label: '부모님이 잘 안 받으세요' },
    { value: 'call_quality', label: '통화가 아쉬워요' },
    { value: 'no_longer_needed', label: '이제 필요 없어요' },
    { value: 'other', label: '기타' },
  ];
  // 결제 흐름 측정 — 서버 화이트리스트(PAY_EVENTS)와 같다. 이벤트 이름만 보낸다(개인 정보 없음).
  var PAY_EVENTS = ['pay_view', 'login_view', 'login_success', 'register_view', 'consent_checked', 'pg_open',
    'register_success', 'register_fail', 'cancel_view', 'cancel_done', 'pause_done', 'refund_request'];
  // 탭(세션)당 한 번만 세는 이벤트 — 로그인·결제창 복귀로 페이지가 다시 열려도 방문 한 번으로 센다.
  var ONCE_PER_TAB_EVENTS = ['pay_view', 'login_view', 'consent_checked'];
  var REFUND_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

  function formatWon(n) {
    if (n === null || n === undefined || isNaN(Number(n))) return '-';
    return Number(n).toLocaleString('ko-KR') + '원';
  }

  function kstParts(iso) {
    var d = new Date(new Date(iso).getTime() + KST_MS);
    return { month: d.getUTCMonth() + 1, day: d.getUTCDate() };
  }

  function formatKstDate(iso) {
    var p = kstParts(iso);
    return p.month + '월 ' + p.day + '일';
  }

  function kstDayOfMonth(iso) {
    return kstParts(iso).day;
  }

  // 대장 §8-4 구독 필수 표기 4종: 가격 · 무료 기간 · 자동결제 시점 · 해지 방법.
  // 문구는 서버가 정한 chargeKind로만 정한다(시간차 어림짐작 안 함): none · trial_end · renewal · overdue · immediate.
  function noticeLines(opts) {
    // 1번째 줄은 "이번 청구액"이 아니라 요금제의 월 정액을 보여준다 — chargeKind가 'none'이면 이번 청구(amount)는
    // 없어도(null) 요금제 자체의 월 가격(monthlyAmount)은 있다. monthlyAmount가 없으면 구버전 호출 호환으로 amount를 쓴다.
    var line1Price = formatWon((opts.monthlyAmount !== null && opts.monthlyAmount !== undefined) ? opts.monthlyAmount : opts.amount);
    var line1 = opts.planName + ' 요금제 · 월 ' + line1Price + ' (부가세 포함)';
    var kind = opts.chargeKind;

    // chargeKind가 'none'이거나(구버전 호출 호환) chargeAt이 없으면 해지 예약 중에 결제수단만 바꾸는 경우다.
    if (kind === 'none' || (!kind && (opts.chargeAt === null || opts.chargeAt === undefined))) {
      return [
        line1,
        '결제수단만 바뀌고, 해지 예약은 그대로예요. 추가로 결제되지 않아요.',
        '해지를 취소하면 다음 결제일부터 이 결제수단으로 자동결제돼요.',
        '언제든 이 페이지에서 해지할 수 있어요. 해지해도 결제한 기간이 끝날 때까지 이용하실 수 있어요. ' +
          '결제 후 7일 안에 안부전화 이용 기록이 없으면 전액 환불을 요청하실 수 있어요(고객센터 ' + CS_PHONE + ').',
      ];
    }

    if (!CHARGE_KINDS[kind]) {
      // 서버가 결제 성격을 못 정했거나 모르는 값을 보냈다 — 잘못된 안내를 하느니 새로고침을 권한다.
      // 등록 버튼 자체를 막는 건 pay-app 쪽(updateSubmit)의 몫이다.
      return [line1, '결제 예정 정보를 확인하지 못했어요. 새로고침 후 다시 확인해 주세요.'];
    }

    var price = formatWon(opts.amount);
    var date = formatKstDate(opts.chargeAt);
    var day = kstDayOfMonth(opts.chargeAt);
    var nextDate = opts.nextChargeAt ? formatKstDate(opts.nextChargeAt) : null;
    var nextDay = opts.nextChargeAt ? kstDayOfMonth(opts.nextChargeAt) : null;
    var nextPrice = formatWon(opts.nextAmount);
    var monthEnd = ' 그 날짜가 없는 달은 마지막 날에 결제돼요.';

    var line2, line3, firstChargeClause;

    if (kind === 'pause_end') {
      // 쉬어가기 중(또는 예정)에 결제수단만 바꾸는 경우 — 쉬어가기가 끝나는 날 결제가 다시 시작된다.
      line2 = '쉬어가기가 ' + date + '에 끝나요. 오늘은 결제되지 않아요.';
      line3 = date + '에 ' + price + '이 결제되고, 이후 매월 ' + day + '일에 자동결제돼요.' + (day >= 29 ? monthEnd : '');
      firstChargeClause = '';
    } else if (kind === 'renewal') {
      // 이미 결제된 이용 기간 안에서 결제수단만 바꾸는 경우 — 오늘은 결제되지 않는다.
      line2 = '이미 결제한 이용 기간이 ' + date + '까지예요. 오늘은 결제되지 않아요.';
      line3 = date + '에 ' + price + '이 결제되고, 이후 매월 ' + day + '일에 자동결제돼요.' + (day >= 29 ? monthEnd : '');
      firstChargeClause = '';
    } else if (kind === 'overdue') {
      // 밀린 결제가 있다 — 등록하는 순간 밀린 금액부터 처리하고, 이후 정기 결제로 돌아간다.
      line2 = '결제되지 않은 ' + price + '이 등록 후 바로 결제돼요.';
      line3 = '다음 결제는 ' + nextDate + '에 ' + nextPrice + '이고, 이후 매월 ' + nextDay + '일에 자동결제돼요.' + (nextDay >= 29 ? monthEnd : '');
      firstChargeClause = '';
    } else if (kind === 'immediate') {
      // 체험이 이미 끝난 뒤의 신규(또는 재)등록 — 등록하는 순간 바로 첫 결제가 일어난다.
      line2 = '등록하면 바로 첫 결제(' + price + ')가 진행돼요.';
      line3 = '다음 결제는 ' + nextDate + '에 ' + nextPrice + '이고, 이후 매월 ' + nextDay + '일에 자동결제돼요.' + (nextDay >= 29 ? monthEnd : '');
      firstChargeClause = '';
    } else {
      // 'trial_end' — 체험 중 최초 등록. 결제는 체험이 끝나는 날부터 시작된다.
      line2 = '오늘은 결제되지 않아요. ' + date + '까지 무료로 이용하실 수 있어요.';
      line3 = date + '부터 매월 ' + day + '일에 ' + price + '이 자동결제돼요.' + (day >= 29 ? monthEnd : '');
      firstChargeClause = '첫 결제 전에 해지하면 청구되지 않아요. ';
    }

    var line4 = '언제든 이 페이지에서 해지할 수 있어요. 해지해도 결제한 기간이 끝날 때까지 이용하실 수 있어요. ' +
      firstChargeClause +
      '결제 후 7일 안에 안부전화 이용 기록이 없으면 전액 환불을 요청하실 수 있어요(고객센터 ' + CS_PHONE + ').';
    return [line1, line2, line3, line4];
  }

  // A-1 등록 버튼 문구 — 누르면 무엇이 일어나는지(얼마가 언제) 버튼에 적는다. 금액은 서버 값만 쓴다.
  function submitLabel(o) {
    o = o || {};
    var kind = o.chargeKind;
    if (kind === 'trial_end') {
      var monthly = (o.monthlyAmount !== null && o.monthlyAmount !== undefined) ? o.monthlyAmount : o.amount;
      return '무료 체험 후 월 ' + formatWon(monthly) + ' 자동결제 등록';
    }
    if (kind === 'overdue') return formatWon(o.amount) + ' 결제하고 다시 이용하기';
    if (kind === 'immediate') return formatWon(o.amount) + ' 결제하고 시작하기';
    if (kind === 'renewal' || kind === 'none' || kind === 'pause_end') return '결제수단 변경';
    return '결제수단 등록';
  }

  // 해지 화면의 한 달 쉬어가기 안내. kind: 'offer'(카드와 버튼) · 'limit'(한 줄 안내) · 'none'(숨김).
  function pauseOffer(p) {
    if (p && p.eligible && p.from && p.until) {
      return {
        kind: 'offer',
        text: '다음 결제일(' + formatKstDate(p.from) + ')부터 한 달 동안 결제와 안부전화를 쉬어요. ' +
          formatKstDate(p.until) + '에 자동으로 다시 시작되고, 3일 전과 1일 전에 알려 드려요. 1년에 2번까지 쓸 수 있어요.',
      };
    }
    if (p && !p.eligible && p.reason === 'pause_limit') return { kind: 'limit', text: '쉬어가기는 1년에 2번까지 쓸 수 있어요.' };
    return { kind: 'none', text: '' };
  }

  // 구독 관리의 쉬어가기 표시 — 예정이면 웹에서 취소할 수 있고, 쉬는 중이면 취소할 수 없다(고객센터 안내).
  function pauseManageText(pause, amount) {
    if (!pause || !pause.from || !pause.until) return null;
    if (pause.state === 'active') {
      var hasAmount = amount !== null && amount !== undefined && !isNaN(Number(amount));
      return {
        text: '쉬어가는 중이에요. ' + formatKstDate(pause.until) +
          (hasAmount ? '에 다시 시작하고 ' + formatWon(amount) + '이 결제돼요.' : '에 다시 시작해요.'),
        canCancel: false,
      };
    }
    return { text: '쉬어가기 예정: ' + formatKstDate(pause.from) + ' ~ ' + formatKstDate(pause.until) + ' · 그동안 결제와 안부전화가 쉬어요', canCancel: true };
  }

  // 해지 화면 ② — 해지해도 언제까지 쓰는지. 결제가 밀린 상태(past_due)는 바로 끝난다(기존 문구).
  function cancelKeepText(sub, now) {
    sub = sub || {};
    var b = sub.billing || {};
    var reports = ' 지금까지 받은 리포트는 해지 후에도 보호자 앱에서 볼 수 있어요.';
    if (sub.status === 'past_due') return '지금 바로 해지되고 안부전화가 중단돼요. 결제되지 않은 금액은 청구되지 않아요.';
    var pause = sub.pause || b.pause;
    // 쉬는 중 해지 — 결제한 기간은 이미 끝났으므로 바로 종료된다.
    if (pause && pause.state === 'active') return '해지하면 바로 종료돼요.' + reports;
    // 쉬어가기 예정 중 해지 — 서버가 예정을 함께 지운다(쓰지 않은 쉬어가기는 횟수에서 빠진다).
    var pauseNote = pause && pause.state === 'scheduled' ? ' 쉬어가기 예정도 함께 취소돼요.' : '';
    var until = sub.status === 'trial' ? sub.trialEndsAt : b.currentPeriodEnd;
    var nowMs = (now ? new Date(now) : new Date()).getTime();
    if (until && new Date(until).getTime() > nowMs) return '해지해도 ' + formatKstDate(until) + '까지 이용하실 수 있어요.' + pauseNote + reports;
    return '해지하면 더 이상 결제되지 않아요.' + pauseNote + reports;
  }

  // 결제 내역의 환불 요청 버튼 — 결제 완료이고 결제 후 7일 안이며 아직 요청하지 않은 결제만.
  function canRequestRefund(p, now) {
    if (!p || p.status !== 'paid' || !p.paidAt || p.refundRequest) return false;
    var nowMs = (now ? new Date(now) : new Date()).getTime();
    var paidMs = new Date(p.paidAt).getTime();
    return !isNaN(paidMs) && nowMs - paidMs < REFUND_WINDOW_MS;
  }

  // 결제 흐름 측정 요청 — 화이트리스트에 없는 이름은 보내지 않는다(null).
  function payEventRequest(apiBase, name) {
    if (PAY_EVENTS.indexOf(name) < 0) return null;
    // text/plain — CORS 사전 확인(OPTIONS) 없이 보낸다. 본문은 JSON 문자열 그대로다(서버가 text/plain을 받는다).
    return { url: apiBase + '/web/pay-events', body: JSON.stringify({ events: [{ name: name }] }), contentType: 'text/plain;charset=UTF-8' };
  }

  // 로그인(카카오·네이버) 또는 모바일 결제창에서 돌아와 페이지가 다시 열린 경우.
  function isReturnLoad(search) {
    return !!(parseOAuthReturn(search) || parsePortoneReturn(search));
  }

  function decideView(s) {
    var sub = (s && s.subscription) || {};
    var billing = sub.billing || {};
    if (!s.isOwner) return 'not_owner';
    if (sub.status === 'free') return 'free';
    if (billing.registered && sub.status !== 'expired') return 'manage';
    if (!s.billingEnabled) return 'billing_off';
    if (s.amount === null || s.amount === undefined) return 'amount_error';
    return 'register';
  }

  function decideErrorView(code) {
    return code === 'no_family' ? 'no_family' : null;
  }

  var PAUSE_UNAVAILABLE = '지금은 쉬어가기를 신청할 수 없어요.';
  var ERROR_MESSAGES = {
    consent_required: '자동결제 동의에 체크해 주세요.',
    owner_only: '결제는 대표 보호자만 할 수 있어요.',
    no_family: '방글이 앱에서 먼저 가입해 주세요.',
    billing_disabled: '결제 기능을 준비하고 있어요. 조금만 기다려 주세요.',
    portone_not_configured: '결제 기능을 준비하고 있어요. 조금만 기다려 주세요.',
    portone_error: '결제사 연결이 잠시 원활하지 않아요. 잠시 후 다시 시도해 주세요.',
    method_unavailable: '선택하신 결제수단은 지금 쓸 수 없어요. 다른 결제수단을 골라 주세요.',
    invalid_billing_key: '결제수단 등록을 확인하지 못했어요. 다시 시도해 주세요.',
    free_family: '무료로 이용 중인 가족이라 결제할 것이 없어요.',
    no_elder: '등록된 부모님이 없어요. 방글이 앱에서 부모님을 먼저 등록해 주세요.',
    phone_extra_price_undecided: '전화 방식 부모님을 추가한 요금은 아직 준비 중이에요. 고객센터(' + CS_PHONE + ')로 문의해 주세요.',
    nothing_to_cancel: '해지할 예정 결제가 없어요.',
    not_canceled: '해지 예약 상태가 아니에요.',
    period_ended: '이용 기간이 이미 끝나 해지를 취소할 수 없어요. 결제수단을 다시 등록해 주세요.',
    same_plan: '지금과 같은 요금제예요.',
    invalid_plan: '요금제를 다시 골라 주세요.',
    invalid_login: '이메일 또는 비밀번호가 맞지 않아요.',
    locked: '로그인 시도가 많았어요. 잠시 후 다시 시도해 주세요.',
    invalid_social_token: '로그인에 실패했어요. 다시 시도해 주세요.',
    account_link_required: '이 이메일은 다른 방법으로 가입돼 있어요. 가입하신 방법(이메일 등)으로 로그인해 주세요.',
    web_login_not_configured: '이 로그인 방법을 준비하고 있어요. 다른 방법으로 로그인해 주세요.',
    session_expired: '다시 로그인해 주세요.',
    unauthorized: '다시 로그인해 주세요.',
    oauth_state_mismatch: '로그인 확인에 실패했어요. 다시 시도해 주세요.',
    payment_window_failed: '결제수단 등록이 완료되지 않았어요. 다시 시도해 주세요.',
    not_active: PAUSE_UNAVAILABLE,
    canceled: PAUSE_UNAVAILABLE,
    no_billing: PAUSE_UNAVAILABLE,
    already_paused: PAUSE_UNAVAILABLE,
    not_scheduled: PAUSE_UNAVAILABLE,
    pause_limit: '쉬어가기는 1년에 2번까지 쓸 수 있어요.',
    pause_started: '이미 쉬어가는 중이라 취소할 수 없어요. 고객센터(' + CS_PHONE + ')로 연락해 주세요.',
    not_paused: '쉬어가기 예정이 없어요.',
    not_refundable: '환불 요청할 수 없는 결제예요.',
    invalid_reason: '해지 이유를 다시 확인해 주세요.',
  };
  // period_ended는 해지 취소(resume)에서도 쓰는 코드라, 쉬어가기 요청에서 받은 경우에만 쉬어가기 문구로 바꾼다.
  // 환불 요청의 invalid_reason은 해지 이유가 아니라 요청 내용(사유) 문제다.
  var CONTEXT_MESSAGES = {
    pause: { period_ended: PAUSE_UNAVAILABLE },
    refund: { invalid_reason: '환불 요청 내용을 다시 확인해 주세요.' },
  };

  function errorMessage(code, context) {
    var byContext = CONTEXT_MESSAGES[context];
    if (byContext && byContext[code]) return byContext[code];
    return ERROR_MESSAGES[code] || '잠시 후 다시 시도해 주세요. 계속 안 되면 고객센터(' + CS_PHONE + ')로 연락해 주세요.';
  }

  function paymentStatusLabel(status) {
    var labels = {
      scheduled: '결제 예정', paid: '결제 완료', failed: '결제 실패',
      cancelled: '환불 완료', partial_cancelled: '부분 환불', revoked: '예약 취소',
    };
    return labels[status] || status;
  }

  function makeOAuthState(provider, randomHex) {
    return provider + '.' + randomHex;
  }

  function parseOAuthReturn(search) {
    var q = new URLSearchParams(search || '');
    var state = q.get('state');
    if (!state || (!q.get('code') && !q.get('error'))) return null;
    var provider = state.split('.')[0];
    if (!OAUTH_PROVIDERS[provider]) return null;
    return { provider: provider, code: q.get('code'), state: state, error: q.get('error') };
  }

  function authorizeUrl(base, clientId, redirectUri, state) {
    var q = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: redirectUri, state: state });
    return base + '?' + q.toString();
  }

  function kakaoAuthorizeUrl(o) {
    return authorizeUrl('https://kauth.kakao.com/oauth/authorize', o.restKey, o.redirectUri, o.state);
  }

  function naverAuthorizeUrl(o) {
    return authorizeUrl('https://nid.naver.com/oauth2.0/authorize', o.clientId, o.redirectUri, o.state);
  }

  // 모바일에서는 포트원 결제창이 redirectUrl로 돌아온다. 우리 표식 pgReturn=1이 붙은 복귀만 처리한다.
  function parsePortoneReturn(search) {
    var q = new URLSearchParams(search || '');
    if (q.get('pgReturn') !== '1') return null;
    return { billingKey: q.get('billingKey'), code: q.get('code'), message: q.get('message') };
  }

  return {
    BILLING_CONSENT_VERSION: BILLING_CONSENT_VERSION, PLAN_NAMES: PLAN_NAMES, METHOD_LABELS: METHOD_LABELS, CHARGE_KINDS: CHARGE_KINDS,
    formatWon: formatWon, formatKstDate: formatKstDate, kstDayOfMonth: kstDayOfMonth,
    noticeLines: noticeLines, decideView: decideView, decideErrorView: decideErrorView,
    errorMessage: errorMessage, paymentStatusLabel: paymentStatusLabel,
    makeOAuthState: makeOAuthState, parseOAuthReturn: parseOAuthReturn,
    kakaoAuthorizeUrl: kakaoAuthorizeUrl, naverAuthorizeUrl: naverAuthorizeUrl,
    parsePortoneReturn: parsePortoneReturn,
    CANCEL_REASONS: CANCEL_REASONS, PAY_EVENTS: PAY_EVENTS, ONCE_PER_TAB_EVENTS: ONCE_PER_TAB_EVENTS, CS_PHONE: CS_PHONE,
    isReturnLoad: isReturnLoad,
    submitLabel: submitLabel, pauseOffer: pauseOffer, pauseManageText: pauseManageText,
    cancelKeepText: cancelKeepText, canRequestRefund: canRequestRefund, payEventRequest: payEventRequest,
  };
});
