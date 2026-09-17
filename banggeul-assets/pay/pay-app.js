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
  var checkoutSeq = 0; // 요금제·결제수단을 빠르게 바꿀 때 오래된 /checkout 응답을 무시하기 위한 순번
  var googleInitTries = 0;

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
    // HTTP 401은 서버가 어떤 오류 코드를 실어 보내든 세션 만료와 같이 취급한다.
    if ((err && err.status === 401) || code === 'unauthorized') code = 'session_expired';
    if (code === 'session_expired') {
      auth.signOut();
      show('login');
      banner(C.errorMessage(code));
      return;
    }
    // 불러오는 중 화면에서 실패하면 배너만으로는 안 보인다 — 다시 시도할 수 있는 안내 화면을 보여준다.
    if (!$('view-loading').hidden) {
      return message('잠시 문제가 생겼어요', C.errorMessage(code), { label: '다시 시도', onclick: load });
    }
    banner(C.errorMessage(code));
  }

  // ── 안내 화면 ──
  function message(title, body, action) {
    text($('msg-title'), title);
    text($('msg-body'), body);
    var a = $('msg-action');
    a.hidden = !action;
    a.onclick = null;
    if (action) {
      a.textContent = action.label;
      if (action.onclick) {
        a.href = '#';
        a.onclick = function (ev) { ev.preventDefault(); action.onclick(); };
      } else {
        a.href = action.href;
      }
    }
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

  function renderRegister(fromManage) {
    var s = state.status;
    text($('reg-elders'), '부모님 ' + s.elderCount + '분 기준 금액이에요(부가세 포함).');
    planChoices($('reg-plans'), 'regPlan', s.plan);
    $('reg-consent').checked = false;
    $('reg-submit').disabled = true;
    $('reg-submit').setAttribute('aria-busy', 'false');
    $('reg-back-manage').hidden = !fromManage;
    show('register');
    return refreshCheckout();
  }

  // 결제 예정 시각·금액은 서버가 정한다 — 결제수단을 바꿀 때마다 다시 받아 고지를 그린다.
  function refreshCheckout() {
    var method = selectedValue('method');
    var list = $('reg-notice');
    list.innerHTML = '';
    // 새 요청을 시작하는 순간 이전 결제 준비값·동의는 무효로 만든다(다른 수단·요금제의 값으로 등록되는 것을 막는다).
    state.checkout = null;
    $('reg-consent').checked = false;
    updateSubmit();
    var seq = ++checkoutSeq;
    return auth.api('/family/billing/checkout', { method: 'POST', body: { method: method } }).then(function (r) {
      if (seq !== checkoutSeq) return; // 그 사이 더 최신 요청이 있었다 — 이 응답은 버린다
      if (r.status !== 200) throw r;
      state.checkout = Object.assign({}, r.data, { method: method });
      C.noticeLines({ planName: C.PLAN_NAMES[r.data.plan], amount: r.data.amount, chargeAt: r.data.chargeAt, now: new Date() })
        .forEach(function (line) { list.appendChild(li(line)); });
      updateSubmit();
    }).catch(function (e) {
      if (seq !== checkoutSeq) return;
      state.checkout = null;
      updateSubmit();
      fail(e);
    });
  }
  function updateSubmit() { $('reg-submit').disabled = !($('reg-consent').checked && state.checkout); }

  function onPlanChange() {
    var plan = selectedValue('regPlan');
    if (!plan || plan === state.status.plan) return;
    // 새 요금제 반영이 끝나기 전까지는 이전 요금제 기준 결제 준비값으로 등록할 수 없게 막는다.
    state.checkout = null;
    $('reg-consent').checked = false;
    updateSubmit();
    checkoutSeq++; // 진행 중이던 refreshCheckout 응답이 있었다면 무효화한다
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
    if (!co || !$('reg-consent').checked) return banner(C.errorMessage('consent_required'));
    // 결제 준비값을 받아온 그 결제수단으로 등록한다 — 그 사이 라디오를 다시 바꿨을 가능성을 배제한다.
    var method = co.method;
    busy($('reg-submit'), true);
    // 모바일은 결제창이 페이지를 떠났다 돌아온다 — 고른 수단과 동의를 잠시 보관한다.
    sessionStorage.setItem(PENDING_KEY, JSON.stringify({ method: method, consentVersion: C.BILLING_CONSENT_VERSION }));
    if (!window.PortOne) {
      // SDK가 아직 로드되지 않았거나 차단됐다 — 새 창을 열지 않고 바로 안내한다.
      sessionStorage.removeItem(PENDING_KEY);
      busy($('reg-submit'), false);
      return banner(C.errorMessage('payment_window_failed'));
    }
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
      if (resp.code || !resp.billingKey) {
        // 결제창을 닫았거나 실패했다 — 다시 시도하려면 새 issueId가 필요하다(같은 값은 재사용할 수 없다).
        sessionStorage.removeItem(PENDING_KEY);
        busy($('reg-submit'), false);
        return refreshCheckout().then(function () { banner(resp.message || C.errorMessage('payment_window_failed')); });
      }
      busy($('reg-submit'), false);
      return submitBillingKey(resp.billingKey);
    }).catch(function (e) {
      sessionStorage.removeItem(PENDING_KEY);
      busy($('reg-submit'), false);
      return refreshCheckout().then(function () { fail(e); });
    });
  }

  function submitBillingKey(billingKey) {
    var pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) || 'null');
    sessionStorage.removeItem(PENDING_KEY);
    if (!pending) return load().then(function () { banner(C.errorMessage('payment_window_failed')); });
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
    var periodEnd = b.currentPeriodEnd || sub.trialEndsAt;
    var periodEnded = !!periodEnd && new Date(periodEnd).getTime() <= Date.now();
    $('mg-cancel').hidden = !b.nextPaymentAt;
    $('mg-resume').hidden = !b.cancelAtPeriodEnd || periodEnded;
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
    if (!window.google || !window.google.accounts) {
      googleInitTries++;
      if (googleInitTries > 20) { $('login-google').hidden = true; return; } // 약 6초 — SDK가 안 뜨면 포기하고 숨긴다
      return setTimeout(initGoogle, 300);
    }
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
    $('mg-method').onclick = function () { renderRegister(true); };
    $('reg-back-manage').onclick = renderManage;
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
