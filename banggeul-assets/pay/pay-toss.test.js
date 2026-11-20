const test = require('node:test');
const assert = require('node:assert/strict');
const card = require('./pay-toss');
const checkout = {provider:'TOSS_PAYMENTS', method:'CARD', clientKey:'test_ck_fixture', customerKey:'fixture-family'};
const context = {plan:'plus', selection:[{elderId:'fixture-parent', mode:'app'}], consent:{autoPay:true, version:'2026-09-18c'}};
function storage() {
  const values = new Map();
  return {setItem:(k,v)=>values.set(k,v), getItem:k=>values.get(k) || null, removeItem:k=>values.delete(k)};
}
async function begin(store, nonce) {
  let options;
  const sdk = () => ({payment:()=>({requestBillingAuth:args=>{options=args;}})});
  await card.open(checkout, context, sdk, store, 'https://example.test/banggeul-pay.html?appHandoff=stale', nonce);
  return new URL(options.successUrl);
}
test('returned authorization is single-use and retains selected plan, parents and consent', async () => {
  const store = storage();
  const url = await begin(store,'attempt-a');
  assert.equal(url.searchParams.has('appHandoff'),false);
  url.searchParams.set('authKey','fixture-auth');
  url.searchParams.set('customerKey',checkout.customerKey);
  assert.deepEqual(card.take(url.search,store).body,{method:'CARD',authKey:'fixture-auth',customerKey:checkout.customerKey,...context});
  assert.equal(card.take(url.search,store).body,undefined);
});
test('old return cannot consume a new attempt; wrong customer cannot register', async () => {
  const store = storage();
  const old = await begin(store,'old');
  const current = await begin(store,'current');
  assert.equal(card.take(old.search,store).error,'invalid');
  current.searchParams.set('authKey','fixture-auth');
  current.searchParams.set('customerKey','another-family');
  assert.equal(card.take(current.search,store).error,'invalid');
});
test('non-direct checkouts, secret keys and non-card methods are rejected before SDK initialization',async()=>{
  for(const change of [{provider:'PORTONE'},{method:'KAKAOPAY'},{clientKey:'test_sk_fixture'},{customerKey:''}])
    await assert.rejects(card.open({...checkout,...change},context,()=>assert.fail(),storage(),'https://example.test','nonce'),/payment_window_failed/);
});

test('SDK rejection clears attempt and reopening creates clean success and fail URLs', async () => {
  const store = storage();
  const url = 'https://example.test/banggeul-pay.html?appHandoff=private#fragment';
  const rejected = () => ({ payment: () => ({ requestBillingAuth: async () => { throw Error('USER_CANCEL'); } }) });
  await assert.rejects(card.open(checkout, context, rejected, store, url, 'first'), /USER_CANCEL/);
  assert.equal(store.getItem('banggeulTossAttempt'), null);
  let options;
  await card.open(checkout, context, () => ({payment: () => ({requestBillingAuth: args => {options = args;}})}), store, url, 'second');
  for (const [field, kind] of [['successUrl','success'], ['failUrl','fail']]) {
    assert.equal(options[field], 'https://example.test/banggeul-pay.html?attempt=second&tossReturn=' + kind);
  }
  assert.equal(card.take(new URL(options.failUrl).search + '&code=USER_CANCEL', store).error,'cancel');
  await begin(store,'third');
});
test('ambiguous callbacks and URLs carrying credentials fail before returning an authorization', async () => {
  const store = storage();
  const url = await begin(store, 'new');
  url.searchParams.set('authKey','fixture-auth');
  url.searchParams.set('customerKey',checkout.customerKey);
  for (const extra of ['&authKey=another','&attempt=other','&customerKey=other','&tossReturn=fail','&code=USER_CANCEL']) {
    assert.equal(card.take(url.search + extra, store).error,'invalid');
  }
  await assert.rejects(card.open(checkout, context, () => assert.fail(), store, 'https://user:password@example.test/page', 'bad'), /payment_window_failed/);
  await assert.rejects(card.open(checkout, context, () => assert.fail(), store, 'http://example.test/page', 'bad'), /payment_window_failed/);
});

test('fail callback mixed with success fields is invalid, even for a cancellation code', async () => {
  for (const extra of ['authKey=fixture', 'customerKey=fixture-family', 'authKey=fixture&customerKey=fixture-family', 'authKey=', 'customerKey=']) {
    const store = storage();
    await begin(store, 'mixed');
    const query = '?attempt=mixed&tossReturn=fail&code=USER_CANCEL';
    assert.deepEqual(card.take(query + '&' + extra, store), {error:'invalid'});
    assert.equal(card.take(query, store).error, 'cancel');
  }
});

test('public checkout requires a live client key and preserves the server order on return', async () => {
  const store = storage();
  const page = 'https://www.krafte.net/banggeul-pay.html?appHandoff=used#top';
  await assert.rejects(card.open(checkout, context, () => assert.fail(), store, page, 'attempt'), /payment_window_failed/);
  let urls;
  const sdk = () => ({payment: () => ({requestBillingAuth: args => { urls = args; }})});
  const live = {...checkout, clientKey:'live_ck_fixture', orderId:'order-fixture'};
  await card.open(live, context, sdk, store, page, 'attempt');
  assert.equal(urls.failUrl, 'https://www.krafte.net/banggeul-pay.html?attempt=attempt&tossReturn=fail');
  const success = new URL(urls.successUrl);
  assert.equal(success.href, 'https://www.krafte.net/banggeul-pay.html?attempt=attempt&tossReturn=success');
  success.searchParams.set('authKey','fixture-auth');
  success.searchParams.set('customerKey',checkout.customerKey);
  assert.equal(card.take(success.search,store).body.orderId,live.orderId);
});
