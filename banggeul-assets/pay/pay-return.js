// Toss 반환·앱 handoff 계약. 외부 PG 값이나 인가 코드는 앱에 전달하지 않는다.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PayReturn = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var PRODUCTION_WEB_ORIGIN = 'https://www.krafte.net';
  var RETURN_PATH = '/banggeul-pay.html';

  function configError() {
    var e = new Error('invalid_return_origin');
    e.code = 'invalid_return_origin';
    return e;
  }

  // 결제 반환은 환경별 승인된 단일 HTTPS origin·경로만 허용한다. 운영 후보와 QA 후보가
  // 서로의 origin·인증 설정을 공유하지 않도록 환경과 allowlist를 함께 검증한다.
  // query/hash를 설정값에서 물려받지 않는다.
  function checkedWebBase(config) {
    try {
      var origin = new URL(config && config.origin).origin;
      var redirect = new URL(config && config.redirectUri);
      var origins = config && config.allowedWebReturnOrigins;
      var environment = config && config.environment;
      if (!Array.isArray(origins) || origins.length !== 1 || (environment !== 'production-candidate' && environment !== 'qa')) throw configError();
      var approved = new URL(origins[0]).origin;
      if (approved !== origins[0] || approved !== origin || redirect.origin !== origin || redirect.pathname !== RETURN_PATH) throw configError();
      if (environment === 'production-candidate' && approved !== PRODUCTION_WEB_ORIGIN) throw configError();
      if (environment === 'qa' && approved === PRODUCTION_WEB_ORIGIN) throw configError();
      return new URL(RETURN_PATH, origin);
    } catch (e) {
      throw e && e.code === 'invalid_return_origin' ? e : configError();
    }
  }

  function tossReturnUrl(config, state) {
    if (['success', 'failed', 'cancelled'].indexOf(state) < 0) throw configError();
    var url = checkedWebBase(config);
    url.searchParams.set('tossBillingReturn', state);
    return url.toString();
  }

  // Toss Billing Auth는 취소 전용 URL을 제공하지 않고 failUrl에 USER_CANCEL을 붙여 돌려준다.
  // 해당 값은 웹에서만 판별하고, 앱에는 cancelled라는 상태 외에는 전달하지 않는다.
  function tossReturnState(search) {
    var q = new URLSearchParams(search || '');
    var state = q.get('tossBillingReturn');
    if (state === 'failed' && q.get('code') === 'USER_CANCEL') return 'cancelled';
    if (state === 'success' || state === 'failed' || state === 'cancelled') return state;
    return null;
  }

  // native 수신 계약: banggeul://payment-return?status=handoff_expired|cancelled
  // 인증 코드·Toss 코드·메시지·결제 결과는 query에 절대 싣지 않는다.
  function appReturnUrl(config, status) {
    if (['handoff_expired', 'cancelled'].indexOf(status) < 0) throw configError();
    try {
      var url = new URL(config && config.appHandoffReturnUri);
      if (url.protocol !== 'banggeul:' || url.hostname !== 'payment-return') throw configError();
      url.search = '';
      url.hash = '';
      url.searchParams.set('status', status);
      return url.toString();
    } catch (e) {
      throw e && e.code === 'invalid_return_origin' ? e : configError();
    }
  }

  // native에는 상태 코드만 전달하고, 고객 메시지는 웹·Android가 같은 고정 문구로 각각 표시한다.
  // PG 오류·인증 코드·결제 결과는 메시지에도 포함하지 않는다.
  function appReturnMessage(status) {
    if (status === 'handoff_expired') return '앱 로그인 연결이 만료되었어요. 앱에서 다시 시도해 주세요.';
    if (status === 'cancelled') return '결제수단 등록을 취소했어요. 카드 등록이나 청구는 시작되지 않았어요.';
    throw configError();
  }

  return { PRODUCTION_WEB_ORIGIN: PRODUCTION_WEB_ORIGIN, tossReturnUrl: tossReturnUrl, tossReturnState: tossReturnState, appReturnUrl: appReturnUrl, appReturnMessage: appReturnMessage };
});
