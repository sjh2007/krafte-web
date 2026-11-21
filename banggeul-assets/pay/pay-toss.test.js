const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function load(TossPayments) {
  const window = { TossPayments };
  vm.runInNewContext(fs.readFileSync(__dirname + '/pay-toss.js', 'utf8'), { window });
  return window.PayToss;
}

test('disabled 후보는 Toss SDK·카드 등록을 호출하지 않는다', async () => {
  let calls = 0;
  const toss = load(() => { calls++; });
  await assert.rejects(toss.requestBillingAuth({ tossDirectEnabled: false }, {}), { code: 'toss_direct_disabled' });
  assert.equal(calls, 0);
});

test('Toss SDK 주소는 직접연동 표준 SDK뿐이다', () => {
  assert.equal(load().SDK_URL, 'https://js.tosspayments.com/v2/standard');
});

test('활성화 뒤에도 Toss Payments 직접 SDK만 호출한다', async () => {
  const calls = [];
  const toss = load((key) => ({ requestBillingAuth: (body) => { calls.push({ key, body }); return Promise.resolve(); } }));
  await toss.requestBillingAuth({ tossDirectEnabled: true, tossPaymentsClientKey: 'test_ck' }, { customerKey: 'customer_1', successUrl: 'https://example.test/s', failUrl: 'https://example.test/f' });
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{ key: 'test_ck', body: { method: 'CARD', customerKey: 'customer_1', successUrl: 'https://example.test/s', failUrl: 'https://example.test/f' } }]);
});
