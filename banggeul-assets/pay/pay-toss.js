// Toss Payments 직접연동 어댑터. 기본값은 비활성(test/disabled)이며 다른 PG로 우회하지 않는다.
(function (root) {
  'use strict';
  var SDK_URL = 'https://js.tosspayments.com/v2/standard';
  function disabled() {
    return Promise.reject(Object.assign(new Error('toss_direct_disabled'), { code: 'toss_direct_disabled' }));
  }
  // QA에서 실제 사용자 취소만 증빙할 때 사용하는 별도 capability다. 일반 결제 CTA는 이 목적값을
  // 만들지 않으므로 QA에서도 카드 등록/청구 경로를 열 수 없다. 성공 반환 뒤 서버 API는 호출하지 않는다.
  function qaCancelEvidence(config, request) {
    return !!(config && config.environment === 'qa' && config.qaCancelOnly === true
      && request && request.qaPurpose === 'user_cancel_evidence');
  }
  function requestBillingAuth(config, request) {
    var enabled = config && config.tossDirectEnabled === true && config.tossPaymentsClientKey;
    if (!enabled || (config.environment === 'qa' && !qaCancelEvidence(config, request))) return disabled();
    if (typeof root.TossPayments !== 'function') return loadSdk().then(function () { return requestBillingAuth(config, request); });
    // Toss Payments SDK 직접 호출만 허용한다. 카드 등록 성공 뒤 서버 API 처리와 실제 청구는
    // 별도 Go 승인·백엔드 검수 범위이며 이 비활성 후보에서는 실행되지 않는다.
    return root.TossPayments(config.tossPaymentsClientKey).requestBillingAuth({
      method: 'CARD', customerKey: request.customerKey, successUrl: request.successUrl, failUrl: request.failUrl,
    });
  }
  function loadSdk() {
    if (!root.document) return Promise.reject(Object.assign(new Error('toss_sdk_unavailable'), { code: 'toss_sdk_unavailable' }));
    return new Promise(function (resolve, reject) {
      var script = root.document.createElement('script');
      script.src = SDK_URL; script.async = true;
      script.onload = resolve;
      script.onerror = function () { reject(Object.assign(new Error('toss_sdk_unavailable'), { code: 'toss_sdk_unavailable' })); };
      root.document.head.appendChild(script);
    });
  }
  root.PayToss = { requestBillingAuth: requestBillingAuth, qaCancelEvidence: qaCancelEvidence, SDK_URL: SDK_URL };
})(window);
