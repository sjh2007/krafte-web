const test = require('node:test');
const assert = require('node:assert/strict');
const Q = require('./pay-qa-contract.js');

test('QA runtime config는 secure env에 있는 값만 사용하고 production origin을 거부한다', () => {
  const qa = Q.qaRuntimeConfig({ QA_WEB_ORIGIN: 'https://qa.example.test', TOSS_TEST_CLIENT_KEY: 'provided-at-runtime' });
  assert.deepEqual(qa, {
    environment: 'qa', origin: 'https://qa.example.test', redirectUri: 'https://qa.example.test/banggeul-pay.html',
    allowedWebReturnOrigins: ['https://qa.example.test'], appHandoffReturnUri: 'banggeul://payment-return',
    tossDirectEnabled: true, tossPaymentsClientKey: 'provided-at-runtime', qaCancelOnly: true,
  });
  assert.throws(() => Q.qaRuntimeConfig({ QA_WEB_ORIGIN: 'https://www.krafte.net', TOSS_TEST_CLIENT_KEY: 'provided-at-runtime' }), { code: 'qa_origin_invalid' });
  assert.throws(() => Q.qaRuntimeConfig({ QA_WEB_ORIGIN: 'https://qa.example.test' }), { code: 'qa_secure_env_missing' });
});
