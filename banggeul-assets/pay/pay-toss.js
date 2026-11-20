// The checkout server owns the merchant key, family binding, amount and billing schedule.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TossCard = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var storageKey = 'banggeulTossAttempt';
  function valid(co, hostname) {
    var publicKey = hostname === 'www.krafte.net' || hostname === 'krafte.net'
      ? /^live_ck_[A-Za-z0-9_-]+$/ : /^(test|live)_ck_[A-Za-z0-9_-]+$/;
    return !!co && co.provider === 'TOSS_PAYMENTS' && co.method === 'CARD' &&
      typeof co.clientKey === 'string' && publicKey.test(co.clientKey) &&
      typeof co.customerKey === 'string' && /^[A-Za-z0-9_=-]{2,50}$/.test(co.customerKey);
  }
  function clear(storage) { storage.removeItem(storageKey); }
  async function open(co, context, sdk, storage, url, nonce) {
    var back = new URL(url);
    if (!valid(co, back.hostname) || typeof sdk !== 'function') throw Error('payment_window_failed');
    if (back.username || back.password || (back.protocol !== 'https:' &&
        !(back.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(back.hostname)))) {
      throw Error('payment_window_failed');
    }
    back.search = ''; back.hash = '';
    back.searchParams.set('attempt', nonce);
    back.searchParams.set('tossReturn', 'success');
    var successUrl = back.href;
    back.searchParams.set('tossReturn', 'fail');
    storage.setItem(storageKey, JSON.stringify({nonce:nonce, orderId:co.orderId, customerKey:co.customerKey, context:context}));
    try {
      await sdk(co.clientKey).payment({customerKey:co.customerKey}).requestBillingAuth({
        method:'CARD', successUrl:successUrl, failUrl:back.href
      });
    } catch (err) { clear(storage); throw err; }
  }
  function take(search, storage) {
    var q = new URLSearchParams(search);
    var fields = ['attempt', 'tossReturn', 'authKey', 'customerKey', 'code'];
    if (fields.some(function (field) { return q.getAll(field).length > 1; })) return {error:'invalid'};
    if (q.get('tossReturn') === 'success' && q.has('code')) return {error:'invalid'};
    if (q.get('tossReturn') === 'fail' && (q.has('authKey') || q.has('customerKey'))) return {error:'invalid'};
    var pending;
    try { pending = JSON.parse(storage.getItem(storageKey)); } catch (_) { clear(storage); }
    if (!pending || pending.nonce !== q.get('attempt')) return {error:'invalid'};
    clear(storage);
    if (q.get('tossReturn') === 'fail' && q.get('code') === 'INVALID_CARD_NUMBER') return {error:'invalid_card_number', context:pending.context};
    if (q.get('tossReturn') === 'fail') return {error:/^(USER_CANCEL|PAY_PROCESS_CANCELED)$/.test(q.get('code')) ? 'cancel' : 'invalid', context:pending.context};
    var key = q.get('authKey');
    if (q.get('tossReturn') !== 'success' || pending.customerKey !== q.get('customerKey') ||
        !key || !key.trim() || key.length > 1000) return {error:'invalid'};
    var ctx = pending.context;
    var body = {method:'CARD', authKey:key, customerKey:pending.customerKey, consent:ctx.consent};
    if (pending.orderId) body.orderId = pending.orderId;
    if (ctx.playAttemptId) body.playAttemptId = ctx.playAttemptId;
    if (ctx.plan) body.plan = ctx.plan;
    if (ctx.selection) body.selection = ctx.selection;
    return {body:body};
  }
  return {valid:valid, open:open, take:take, clear:clear};
});
