const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('./pay-return.js');

const CONFIG = {
  origin: 'https://www.krafte.net',
  redirectUri: 'https://www.krafte.net/banggeul-pay.html',
  environment: 'production-candidate',
  allowedWebReturnOrigins: ['https://www.krafte.net'],
  appHandoffReturnUri: 'banggeul://payment-return',
};

test('Toss 반환 URL은 승인된 웹 origin·결제 페이지로만 만든다', () => {
  assert.equal(R.tossReturnUrl(CONFIG, 'success'), 'https://www.krafte.net/banggeul-pay.html?tossBillingReturn=success');
  assert.equal(R.tossReturnUrl(CONFIG, 'failed'), 'https://www.krafte.net/banggeul-pay.html?tossBillingReturn=failed');
  assert.equal(R.tossReturnUrl(CONFIG, 'cancelled'), 'https://www.krafte.net/banggeul-pay.html?tossBillingReturn=cancelled');
  assert.throws(() => R.tossReturnUrl({ ...CONFIG, origin: 'https://attacker.example' }, 'cancelled'), { code: 'invalid_return_origin' });
  assert.throws(() => R.tossReturnUrl({ ...CONFIG, redirectUri: 'https://www.krafte.net/other.html' }, 'cancelled'), { code: 'invalid_return_origin' });
});

test('운영 후보와 QA 후보는 웹 반환 origin을 혼용하지 않는다', () => {
  const qa = { ...CONFIG, origin: 'https://qa.example.test', redirectUri: 'https://qa.example.test/banggeul-pay.html', environment: 'qa', allowedWebReturnOrigins: ['https://qa.example.test'] };
  assert.equal(R.tossReturnUrl(qa, 'failed'), 'https://qa.example.test/banggeul-pay.html?tossBillingReturn=failed');
  assert.throws(() => R.tossReturnUrl({ ...qa, allowedWebReturnOrigins: ['https://www.krafte.net'] }, 'failed'), { code: 'invalid_return_origin' });
  assert.throws(() => R.tossReturnUrl({ ...CONFIG, environment: 'qa' }, 'failed'), { code: 'invalid_return_origin' });
  assert.throws(() => R.tossReturnUrl({ ...CONFIG, allowedWebReturnOrigins: ['https://www.krafte.net', 'https://qa.example.test'] }, 'failed'), { code: 'invalid_return_origin' });
});

test('Toss 취소는 USER_CANCEL만 cancelled로 정규화한다', () => {
  assert.equal(R.tossReturnState('?tossBillingReturn=failed&code=USER_CANCEL&message=ignored'), 'cancelled');
  assert.equal(R.tossReturnState('?tossBillingReturn=failed&code=PAY_PROCESS_CANCELED'), 'failed');
  assert.equal(R.tossReturnState('?tossBillingReturn=cancelled'), 'cancelled');
  assert.equal(R.tossReturnState('?code=USER_CANCEL'), null);
});

test('앱 반환은 허용된 상태만, native 계약으로만 전달한다', () => {
  assert.equal(R.appReturnUrl(CONFIG, 'handoff_expired'), 'banggeul://payment-return?status=handoff_expired');
  assert.equal(R.appReturnUrl(CONFIG, 'cancelled'), 'banggeul://payment-return?status=cancelled');
  assert.throws(() => R.appReturnUrl(CONFIG, 'failed'), { code: 'invalid_return_origin' });
  assert.throws(() => R.appReturnUrl({ ...CONFIG, appHandoffReturnUri: 'https://attacker.example/' }, 'cancelled'), { code: 'invalid_return_origin' });
});

test('앱 반환 메시지는 고정 상태 문구만 사용하고 PG 값을 포함하지 않는다', () => {
  assert.equal(R.appReturnMessage('handoff_expired'), '앱 로그인 연결이 만료되었어요. 앱에서 다시 시도해 주세요.');
  assert.equal(R.appReturnMessage('cancelled'), '결제수단 등록을 취소했어요. 카드 등록이나 청구는 시작되지 않았어요.');
  assert.throws(() => R.appReturnMessage('failed'), { code: 'invalid_return_origin' });
});
