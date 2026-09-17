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
    var price = formatWon(opts.amount);
    var line1 = opts.planName + ' 요금제 · 월 ' + price + ' (부가세 포함)';
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

    var date = formatKstDate(opts.chargeAt);
    var day = kstDayOfMonth(opts.chargeAt);
    var nextDate = opts.nextChargeAt ? formatKstDate(opts.nextChargeAt) : null;
    var nextDay = opts.nextChargeAt ? kstDayOfMonth(opts.nextChargeAt) : null;
    var nextPrice = formatWon(opts.nextAmount);

    var line2, line3, firstChargeClause;

    if (kind === 'renewal') {
      // 이미 결제된 이용 기간 안에서 결제수단만 바꾸는 경우 — 오늘은 결제되지 않는다.
      line2 = '이미 결제한 이용 기간이 ' + date + '까지예요. 오늘은 결제되지 않아요.';
      line3 = date + '에 ' + price + '이 결제되고, 이후 매월 ' + day + '일에 자동결제돼요.';
      firstChargeClause = '';
    } else if (kind === 'overdue') {
      // 밀린 결제가 있다 — 등록하는 순간 밀린 금액부터 처리하고, 이후 정기 결제로 돌아간다.
      line2 = '결제되지 않은 ' + price + '이 등록 후 바로 결제돼요.';
      line3 = '다음 결제는 ' + nextDate + '에 ' + nextPrice + '이고, 이후 매월 ' + nextDay + '일에 자동결제돼요.';
      firstChargeClause = '';
    } else if (kind === 'immediate') {
      // 체험이 이미 끝난 뒤의 신규(또는 재)등록 — 등록하는 순간 바로 첫 결제가 일어난다.
      line2 = '등록하면 바로 첫 결제(' + price + ')가 진행돼요.';
      line3 = '다음 결제는 ' + nextDate + '에 ' + nextPrice + '이고, 이후 매월 ' + nextDay + '일에 자동결제돼요.';
      firstChargeClause = '';
    } else {
      // 'trial_end' — 체험 중 최초 등록. 결제는 체험이 끝나는 날부터 시작된다.
      line2 = '오늘은 결제되지 않아요. ' + date + '까지 무료로 이용하실 수 있어요.';
      line3 = date + '부터 매월 ' + day + '일에 ' + price + '이 자동결제돼요.' +
        (day >= 29 ? ' 그 날짜가 없는 달은 마지막 날에 결제돼요.' : '');
      firstChargeClause = '첫 결제 전에 해지하면 청구되지 않아요. ';
    }

    var line4 = '언제든 이 페이지에서 해지할 수 있어요. 해지해도 결제한 기간이 끝날 때까지 이용하실 수 있어요. ' +
      firstChargeClause +
      '결제 후 7일 안에 안부전화 이용 기록이 없으면 전액 환불을 요청하실 수 있어요(고객센터 ' + CS_PHONE + ').';
    return [line1, line2, line3, line4];
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
  };

  function errorMessage(code) {
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
    BILLING_CONSENT_VERSION: BILLING_CONSENT_VERSION, PLAN_NAMES: PLAN_NAMES, METHOD_LABELS: METHOD_LABELS,
    formatWon: formatWon, formatKstDate: formatKstDate, kstDayOfMonth: kstDayOfMonth,
    noticeLines: noticeLines, decideView: decideView, decideErrorView: decideErrorView,
    errorMessage: errorMessage, paymentStatusLabel: paymentStatusLabel,
    makeOAuthState: makeOAuthState, parseOAuthReturn: parseOAuthReturn,
    kakaoAuthorizeUrl: kakaoAuthorizeUrl, naverAuthorizeUrl: naverAuthorizeUrl,
    parsePortoneReturn: parsePortoneReturn,
  };
});
