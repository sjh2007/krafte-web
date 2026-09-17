// banggeul-assets/pay/pay-app.js — 화면 배선. 순수 로직은 PayCore, 로그인은 PayAuth.
(function () {
  'use strict';
  var CFG = window.PAY_CONFIG;
  var C = window.PayCore;
  var auth = window.PayAuth.createAuth({ fetch: window.fetch.bind(window), storage: window.sessionStorage, config: CFG });
  var OAUTH_STATE_KEY = 'banggeulPayOAuthState';
  var PENDING_KEY = 'banggeulPayPending';
  var VIEWS = ['loading', 'login', 'register', 'done', 'manage', 'message'];
  var state = { status: null, checkout: null };

  function $(id) { return document.getElementById(id); }
  function show(view) {
    VIEWS.forEach(function (v) { $('view-' + v).hidden = v !== view; });
    $('logout').hidden = view === 'login' || view === 'loading' || !auth.getSession();
    window.scrollTo(0, 0);
  }
  function banner(text, ok) {
    var b = $('banner');
    b.textContent = text || '';
    b.className = 'banner' + (ok ? ' ok' : '');
    b.hidden = !text;
  }
  function clearUrl() { history.replaceState(null, '', location.pathname); }
  function randomHex() {
    var a = new Uint8Array(16);
    crypto.getRandomValues(a);
    return Array.prototype.map.call(a, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
  }
  function text(el, value) { el.textContent = value; return el; }
  function li(value) { return text(document.createElement('li'), value); }
  function busy(btn, on) { btn.disabled = on; btn.setAttribute('aria-busy', on ? 'true' : 'false'); }
  function confirmDialog(message) {
    return new Promise(function (resolve) {
      var d = $('confirm-dialog');
      $('confirm-text').textContent = message;
      function done(v) { $('confirm-yes').onclick = null; $('confirm-no').onclick = null; d.close(); resolve(v); }
      $('confirm-yes').onclick = function () { done(true); };
      $('confirm-no').onclick = function () { done(false); };
      d.showModal();
    });
  }
  function fail(err) {
    var code = (err && err.code) || (err && err.data && err.data.error) || 'unknown';
    if (code === 'session_expired') { auth.signOut(); show('login'); }
    banner(C.errorMessage(code));
  }

  // ── 안내 화면 ──
  function message(title, body, action) {
    text($('msg-title'), title);
    text($('msg-body'), body);
    var a = $('msg-action');
    a.hidden = !action;
    if (action) { a.textContent = action.label; a.href = action.href; }
    show('message');
  }

  // ── 상태 불러오기 → 화면 결정 ──
  function load() {
    banner('');
    show('loading');
    return auth.api('/family/billing/status').then(function (r) {
      if (r.status === 404 && C.decideErrorView(r.data.error) === 'no_family') {
        return message('먼저 방글이 앱에서 가입해 주세요', '앱에서 가입하고 부모님을 등록하면 30일 무료 체험이 시작돼요. 그 뒤 이 페이지에서 결제수단을 등록할 수 있어요.',
          { label: '방글이 앱 설치하기', href: CFG.playStoreUrl });
      }
      if (r.status !== 200) throw r;
      state.status = r.data;
      var view = C.decideView(r.data);
      if (view === 'not_owner') return message('대표 보호자만 결제할 수 있어요', '가족을 처음 만든 대표 보호자 계정으로 로그인해 주세요.');
      if (view === 'free') return message('무료로 이용 중인 가족이에요', '결제할 것이 없어요. 궁금한 점은 고객센터(' + CFG.csPhone + ')로 연락해 주세요.');
      if (view === 'billing_off') return message('결제 기능을 준비하고 있어요', '무료 체험은 그대로 이용하실 수 있어요. 결제가 열리면 알려드릴게요.');
      if (view === 'amount_error') return message('요금을 계산하지 못했어요', C.errorMessage(r.data.amountError));
      if (view === 'manage') return renderManage();
      return renderRegister();
    }).catch(fail);
  }

  // ── 결제수단 등록 ──
  function planChoices(container, name, selected) {
    container.innerHTML = '';
    ['lite', 'standard', 'plus'].forEach(function (p) {
      var amount = state.status.amounts[p];
      var label = document.createElement('label');
      label.className = 'choice';
      var input = document.createElement('input');
      input.type = 'radio'; input.name = name; input.value = p; input.checked = p === selected; input.disabled = amount === null;
      label.appendChild(input);
      label.appendChild(document.createTextNode(' ' + C.PLAN_NAMES[p]));
      label.appendChild(text(Object.assign(document.createElement('span'), { className: 'price' }), amount === null ? '준비 중' : '월 ' + C.formatWon(amount)));
      container.appendChild(label);
    });
  }
  function selectedValue(name) {
    var el = document.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : null;
  }

  function renderRegister() {
    var s = state.status;
    text($('reg-elders'), '부모님 ' + s.elderCount + '분 기준 금액이에요(부가세 포함).');
    planChoices($('reg-plans'), 'regPlan', s.plan);
    $('reg-consent').checked = false;
    $('reg-submit').disabled = true;
    show('register');
    return refreshCheckout();
  }

  // 결제 예정 시각·금액은 서버가 정한다 — 결제수단을 바꿀 때마다 다시 받아 고지를 그린다.
  function refreshCheckout() {
    var method = selectedValue('method');
    var list = $('reg-notice');
    list.innerHTML = '';
    return auth.api('/family/billing/checkout', { method: 'POST', body: { method: method } }).then(function (r) {
      if (r.status !== 200) { state.checkout = null; throw r; }
      state.checkout = r.data;
      C.noticeLines({ planName: C.PLAN_NAMES[r.data.plan], amount: r.data.amount, chargeAt: r.data.chargeAt, now: new Date() })
        .forEach(function (line) { list.appendChild(li(line)); });
      updateSubmit();
    }).catch(fail);
  }
  function updateSubmit() { $('reg-submit').disabled = !($('reg-consent').checked && state.checkout); }

  function onPlanChange() {
    var plan = selectedValue('regPlan');
    if (!plan || plan === state.status.plan) return;
    auth.api('/family/billing/plan', { method: 'POST', body: { plan: plan } }).then(function (r) {
      if (r.status !== 200) throw r;
      return auth.api('/family/billing/status');
    }).then(function (r) {
      if (r.status !== 200) throw r;
      state.status = r.data;
      return refreshCheckout();
    }).catch(function (e) { planChoices($('reg-plans'), 'regPlan', state.status.plan); fail(e); });
  }

  function onRegister() {
    var co = state.checkout;
    var method = selectedValue('method');
    if (!co || !$('reg-consent').checked) return banner(C.errorMessage('consent_required'));
    busy($('reg-submit'), true);
    // 모바일은 결제창이 페이지를 떠났다 돌아온다 — 고른 수단과 동의를 잠시 보관한다.
    sessionStorage.setItem(PENDING_KEY, JSON.stringify({ method: method, consentVersion: C.BILLING_CONSENT_VERSION }));
    window.PortOne.requestIssueBillingKey({
      storeId: co.storeId,
      channelKey: co.channelKey,
      billingKeyMethod: co.billingKeyMethod,
      issueId: co.issueId,
      issueName: co.issueName,
      customer: { customerId: co.customer.customerId },
      redirectUrl: CFG.redirectUri + '?pgReturn=1',
    }).then(function (resp) {
      if (!resp) return; // 모바일 리다이렉트 — 복귀 후 처리
      if (resp.code || !resp.billingKey) { busy($('reg-submit'), false); return banner(resp.message || C.errorMessage('payment_window_failed')); }
      return submitBillingKey(resp.billingKey);
    }).catch(function (e) { busy($('reg-submit'), false); fail(e); });
  }

  function submitBillingKey(billingKey) {
    var pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) || 'null');
    sessionStorage.removeItem(PENDING_KEY);
    if (!pending) return banner(C.errorMessage('payment_window_failed'));
    banner(''); // 이전 시도의 오류 배너가 성공 화면에 남지 않도록 지운다.
    show('loading');
    return auth.api('/family/billing/billing-key', {
      method: 'POST',
      body: { billingKey: billingKey, method: pending.method, consent: { autoPay: true, version: pending.consentVersion } },
    }).then(function (r) {
      if (r.status !== 200) throw r;
      renderDone(r.data);
    }).catch(function (e) { load().then(function () { fail(e); }); });
  }

  function renderDone(result) {
    var list = $('done-lines');
    list.innerHTML = '';
    if (result.chargeAt && result.amount) {
      list.appendChild(li(C.formatKstDate(result.chargeAt) + '부터 매월 ' + C.kstDayOfMonth(result.chargeAt) + '일에 ' + C.formatWon(result.amount) + '이 자동결제돼요.'));
    } else if (!result.chargeAt) {
      list.appendChild(li('해지 예약은 그대로예요. 결제수단만 바뀌었어요.'));
    }
    if (result.scheduled === false) list.appendChild(li('결제 예약을 확인하고 있어요. 문제가 있으면 안내드릴게요.'));
    list.appendChild(li('해지는 언제든 이 페이지의 "구독 관리"에서 할 수 있어요.'));
    list.appendChild(li('안내 메일·알림을 받지 못하셨다면 고객센터(' + CFG.csPhone + ')로 연락해 주세요.'));
    $('done-app').href = CFG.appDeepLink;
    show('done');
  }

  // ── 구독 관리 ──
  function fact(dl, label, value) {
    if (!value) return;
    dl.appendChild(text(document.createElement('dt'), label));
    dl.appendChild(text(document.createElement('dd'), value));
  }

  function renderManage() {
    var s = state.status;
    var sub = s.subscription;
    var b = sub.billing || {};
    text($('mg-status'), sub.statusLabel || '');
    var dl = $('mg-facts');
    dl.innerHTML = '';
    fact(dl, '요금제', C.PLAN_NAMES[s.currentPlan] + ' · 월 ' + C.formatWon(s.amounts[s.currentPlan]));
    fact(dl, '다음 결제부터', b.pendingPlan ? C.PLAN_NAMES[b.pendingPlan] + ' · 월 ' + C.formatWon(s.amounts[b.pendingPlan]) : '');
    fact(dl, '결제수단', C.METHOD_LABELS[b.method] || '');
    fact(dl, '다음 결제일', b.nextPaymentAt ? C.formatKstDate(b.nextPaymentAt) : '');
    fact(dl, '이용 기간', b.cancelAtPeriodEnd ? C.formatKstDate(b.currentPeriodEnd || sub.trialEndsAt) + '까지 이용 후 해지돼요' : '');
    fact(dl, '결제 확인', b.graceEndsAt ? '결제가 되지 않았어요. ' + C.formatKstDate(b.graceEndsAt) + '까지 결제수단을 확인해 주세요.' : '');
    $('mg-cancel').hidden = !b.nextPaymentAt;
    $('mg-resume').hidden = !b.cancelAtPeriodEnd;
    planChoices($('mg-plans'), 'mgPlan', b.pendingPlan || s.currentPlan);

    var body = $('mg-history');
    body.innerHTML = '';
    var rows = (s.payments || []).filter(function (p) { return p.status !== 'revoked'; });
    rows.forEach(function (p) {
      var tr = document.createElement('tr');
      tr.appendChild(text(document.createElement('td'), C.formatKstDate(p.paidAt || p.dueAt)));
      tr.appendChild(text(document.createElement('td'), C.formatWon(p.amount)));
      tr.appendChild(text(document.createElement('td'), C.paymentStatusLabel(p.status)));
      body.appendChild(tr);
    });
    $('mg-history-empty').hidden = rows.length > 0;
    show('manage');
  }

  function postAndReload(path, body, okText) {
    return auth.api(path, { method: 'POST', body: body }).then(function (r) {
      if (r.status !== 200) throw r;
      return load().then(function () { banner(okText, true); });
    }).catch(fail);
  }

  function onCancel() {
    var b = state.status.subscription.billing || {};
    var until = b.currentPeriodEnd || state.status.subscription.trialEndsAt;
    confirmDialog('구독을 해지할까요? ' + (until ? C.formatKstDate(until) + '까지는 그대로 이용하실 수 있고, 그 뒤로는 결제되지 않아요.' : '더 이상 결제되지 않아요.'))
      .then(function (yes) { if (yes) postAndReload('/family/billing/cancel', undefined, '해지했어요.'); });
  }

  // ── 시작 ──
  function handleReturns() {
    var oauth = C.parseOAuthReturn(location.search);
    if (oauth) {
      var expected = sessionStorage.getItem(OAUTH_STATE_KEY);
      sessionStorage.removeItem(OAUTH_STATE_KEY);
      clearUrl();
      if (oauth.error) { show('login'); return Promise.resolve(banner(C.errorMessage('invalid_social_token'))); }
      if (!expected || expected !== oauth.state) { show('login'); return Promise.resolve(banner(C.errorMessage('oauth_state_mismatch'))); }
      show('loading');
      return auth.signInWithWebCode({ provider: oauth.provider, code: oauth.code, state: oauth.state, redirectUri: CFG.redirectUri })
        .then(load).catch(function (e) { show('login'); fail(e); });
    }
    var pg = C.parsePortoneReturn(location.search);
    if (pg) {
      clearUrl();
      if (!auth.getSession()) { show('login'); return Promise.resolve(banner(C.errorMessage('session_expired'))); }
      if (pg.code || !pg.billingKey) {
        sessionStorage.removeItem(PENDING_KEY);
        return load().then(function () { banner(pg.message || C.errorMessage('payment_window_failed')); });
      }
      return submitBillingKey(pg.billingKey);
    }
    if (!auth.getSession()) { show('login'); return Promise.resolve(); }
    return load();
  }

  function startOAuth(provider) {
    var st = C.makeOAuthState(provider, randomHex());
    sessionStorage.setItem(OAUTH_STATE_KEY, st);
    location.href = provider === 'kakao'
      ? C.kakaoAuthorizeUrl({ restKey: CFG.kakaoRestKey, redirectUri: CFG.redirectUri, state: st })
      : C.naverAuthorizeUrl({ clientId: CFG.naverClientId, redirectUri: CFG.redirectUri, state: st });
  }

  function initGoogle() {
    if (!window.google || !window.google.accounts) return setTimeout(initGoogle, 300);
    window.google.accounts.id.initialize({
      client_id: CFG.googleWebClientId,
      callback: function (resp) {
        show('loading');
        auth.signInWithGoogleIdToken(resp.credential).then(load).catch(function (e) { show('login'); fail(e); });
      },
    });
    window.google.accounts.id.renderButton($('login-google'), { theme: 'outline', size: 'large', text: 'signin_with', width: 320, locale: 'ko' });
  }

  function bind() {
    $('login-naver').onclick = function () { startOAuth('naver'); };
    $('login-kakao').onclick = function () { startOAuth('kakao'); };
    $('email-form').onsubmit = function (ev) {
      ev.preventDefault();
      show('loading');
      auth.signInWithEmail($('email').value.trim(), $('password').value).then(load).catch(function (e) { show('login'); fail(e); });
    };
    $('logout').onclick = function () { auth.signOut(); banner(''); show('login'); };
    $('play-link-login').href = CFG.playStoreUrl;
    $('reg-consent').onchange = updateSubmit;
    $('reg-submit').onclick = onRegister;
    Array.prototype.forEach.call(document.querySelectorAll('input[name="method"]'), function (el) { el.onchange = refreshCheckout; });
    $('reg-plans').onchange = onPlanChange;
    $('done-manage').onclick = function () { load(); };
    $('mg-method').onclick = renderRegister;
    $('mg-cancel').onclick = onCancel;
    $('mg-resume').onclick = function () { postAndReload('/family/billing/resume', undefined, '해지를 취소했어요. 다음 결제일에 자동결제돼요.'); };
    $('mg-plan-submit').onclick = function () {
      var plan = selectedValue('mgPlan');
      postAndReload('/family/billing/plan', { plan: plan }, '요금제를 바꿨어요.');
    };
  }

  bind();
  initGoogle();
  handleReturns();
})();
