// Toss Payments 직접연동 어댑터. 기본값은 비활성(test/disabled)이며 다른 PG로 우회하지 않는다.
(function (root) {
  'use strict';
  var SDK_URL = 'https://js.tosspayments.com/v2/standard';
  function disabled() {
    return Promise.reject(Object.assign(new Error('toss_direct_disabled'), { code: 'toss_direct_disabled' }));
  }
  function requestBillingAuth(config, request) {
    if (!config || config.tossDirectEnabled !== true || !config.tossPaymentsClientKey) return disabled();
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
  root.PayToss = { requestBillingAuth: requestBillingAuth, SDK_URL: SDK_URL };
})(window);
