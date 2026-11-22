// 비공개 QA 빌드에서만 secure env를 런타임 설정으로 바꾸기 전 검증하는 계약이다.
// 실제 Toss test key·merchant credential·handoff code는 이 파일이나 저장소에 넣지 않는다.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PayQaContract = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function qaError(code) {
    var e = new Error(code); e.code = code; return e;
  }
  function requiredString(env, key) {
    var value = env && env[key];
    if (typeof value !== 'string' || !value.trim()) throw qaError('qa_secure_env_missing');
    return value.trim();
  }
  function qaRuntimeConfig(env) {
    var origin = requiredString(env, 'QA_WEB_ORIGIN');
    var clientKey = requiredString(env, 'TOSS_TEST_CLIENT_KEY');
    var url;
    try { url = new URL(origin); } catch (e) { throw qaError('qa_origin_invalid'); }
    if (url.protocol !== 'https:' || url.origin === 'https://www.krafte.net' || url.pathname !== '/') throw qaError('qa_origin_invalid');
    return {
      environment: 'qa', origin: url.origin, redirectUri: url.origin + '/banggeul-pay.html',
      allowedWebReturnOrigins: [url.origin], appHandoffReturnUri: 'banggeul://payment-return',
      tossDirectEnabled: true, tossPaymentsClientKey: clientKey, qaCancelOnly: true,
    };
  }
  return { qaRuntimeConfig: qaRuntimeConfig };
});
