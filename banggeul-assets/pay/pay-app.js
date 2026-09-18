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
  var CONSENT_LABEL_DEFAULT = '위 내용을 확인했고, 매월 자동결제에 동의합니다.';
  var CONSENT_LABEL_CANCEL_PENDING = '위 내용을 확인했고, 해지를 취소하면 이 결제수단으로 자동결제되는 것에 동의합니다.';

  function $(id) { return document.getElementById(id); }
  var currentView = null;
  function show(view) {
    if (view === 'login' && currentView !== 'login') track('login_view');
    currentView = view;
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
  // 결제 흐름 측정 — 이벤트 이름만 보낸다(사용자 ID·기기 정보 없음). 실패는 조용히 무시한다.
  // sendBeacon은 쿠키를 싣는(credentials include) 요청이라 서버 CORS(Access-Control-Allow-Origin: *)와 맞지 않는다 —
  // 같은 성질(페이지를 떠나도 전송)의 fetch keepalive를 쿠키·referrer 없이, 사전 확인이 없는 text/plain으로 보낸다.
  // pay_view·login_view·consent_checked는 탭(세션)당 한 번만 센다(로그인·결제창 복귀로 다시 열려도 방문 한 번).
  var TRACKED_ONCE_PREFIX = 'banggeulPayTracked.';
  function track(name) {
    try {
      if (C.ONCE_PER_TAB_EVENTS.indexOf(name) >= 0) {
        if (sessionStorage.getItem(TRACKED_ONCE_PREFIX + name)) return;
        sessionStorage.setItem(TRACKED_ONCE_PREFIX + name, '1');
      }
      var req = C.payEventRequest(CFG.apiBase, name);
      if (!req || !window.fetch) return;
      window.fetch(req.url, {
        method: 'POST', headers: { 'Content-Type': req.contentType }, body: req.body,
        keepalive: true, credentials: 'omit', mode: 'cors', referrerPolicy: 'no-referrer',
      }).catch(function () {});
    } catch (e) { /* 측정 실패는 화면 흐름에 영향을 주지 않는다 */ }
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
      function cleanup() {
        $('confirm-yes').onclick = null;
        $('confirm-no').onclick = null;
        d.removeEventListener('cancel', onCancel);
      }
      function done(v) { cleanup(); d.close(); resolve(v); }
      // Esc — 대화상자는 브라우저가 기본 동작으로 이미 닫는다. 취소로 본다.
      function onCancel() { cleanup(); resolve(false); }
      $('confirm-yes').onclick = function () { done(true); };
      $('confirm-no').onclick = function () { done(false); };
      d.addEventListener('cancel', onCancel);
      d.showModal();
    });
  }
  // context: 'pause' — 쉬어가기 요청·취소에서 온 오류(period_ended 문구가 해지 취소와 다르다).
  function fail(err, context) {
    var code = (err && err.code) || (err && err.data && err.data.error) || 'unknown';
    // HTTP 401은 서버가 어떤 오류 코드를 실어 보내든 세션 만료와 같이 취급한다.
    if ((err && err.status === 401) || code === 'unauthorized') code = 'session_expired';
    if (code === 'session_expired') {
      auth.signOut();
      show('login');
      banner(C.errorMessage(code));
      return true; // 로그인 화면으로 보냈다 — 호출한 쪽은 이어서 서버 상태를 다시 묻지 않는다
    }
    // 불러오는 중 화면에서 실패하면 배너만으로는 안 보인다 — 다시 시도할 수 있는 안내 화면을 보여준다.
    if (!$('view-loading').hidden) {
      message('잠시 문제가 생겼어요', C.errorMessage(code, context), { label: '다시 시도', onclick: load });
      return false;
    }
    banner(C.errorMessage(code, context));
    return false;
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
    // 이미 등록된 가족이 결제수단만 바꾸러 온 경우엔 요금제는 구독 관리 화면에서 바꾼다 — 여기선 숨긴다.
    $('reg-plan-card').hidden = !!fromManage;
    text($('reg-submit'), C.submitLabel(null));
    show('register');
    track('register_view');
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
    text($('reg-submit'), C.submitLabel(null));
    updateSubmit();
    var seq = ++checkoutSeq;
    return auth.api('/family/billing/checkout', { method: 'POST', body: { method: method } }).then(function (r) {
      if (seq !== checkoutSeq) return; // 그 사이 더 최신 요청이 있었다 — 이 응답은 버린다
      if (r.status !== 200) throw r;
      state.checkout = Object.assign({}, r.data, { method: method });
      // 해지 예약 중 결제수단만 바꾸는 경우(chargeKind: 'none')는 동의 문구도 달라진다.
      text($('reg-consent-label'), r.data.chargeKind === 'none' ? CONSENT_LABEL_CANCEL_PENDING : CONSENT_LABEL_DEFAULT);
      // 1번째 줄의 월 가격은 이 결제가 속한 요금제(r.data.plan) 기준이다 — 밀린 결제 중 요금제를 바꿨다면
      // state.status.amount(가족의 현재 요금제 가격)와 다를 수 있다. amounts 맵에 없으면(구버전 호환) 그 값을 쓴다.
      var monthlyAmount = state.status.amounts[r.data.plan];
      if (monthlyAmount === null || monthlyAmount === undefined) monthlyAmount = state.status.amount;
      C.noticeLines({
        planName: C.PLAN_NAMES[r.data.plan], amount: r.data.amount, chargeAt: r.data.chargeAt, chargeKind: r.data.chargeKind,
        nextChargeAt: r.data.nextChargeAt, nextAmount: r.data.nextAmount, monthlyAmount: monthlyAmount, now: new Date(),
      }).forEach(function (line) { list.appendChild(li(line)); });
      // A-1 — 누르면 무엇이 일어나는지(금액)를 버튼에 적는다. 필수 고지 4종 바로 아래 버튼이다.
      text($('reg-submit'), C.submitLabel({ chargeKind: r.data.chargeKind, amount: r.data.amount, monthlyAmount: monthlyAmount }));
      updateSubmit();
    }).catch(function (e) {
      if (seq !== checkoutSeq) return;
      state.checkout = null;
      updateSubmit();
      fail(e);
    });
  }
  // 결제 준비값(checkout)이 없거나, 있어도 결제 성격(chargeKind)을 서버가 알 수 없는 값으로 줬으면 동의·등록을 막는다 —
  // 무엇에 동의하는지 정해지기 전에는 누를 수 없게 한다.
  function updateSubmit() {
    var ready = !!state.checkout && !!C.CHARGE_KINDS[state.checkout.chargeKind];
    $('reg-consent').disabled = !ready;
    $('reg-submit').disabled = !($('reg-consent').checked && ready);
  }

  function onPlanChange() {
    var plan = selectedValue('regPlan');
    var previousPlan = state.status.plan; // 서버에 마지막으로 확정된 값 — 취소하면 이 값으로 되돌린다
    if (!plan || plan === previousPlan) return;
    // 결제수단 등록 전이라 요금제를 바꿔도 청구되지 않는다 — 그래도 확인은 받는다. 라디오는 이미 바뀌어 보이니
    // 취소하면 되돌린다.
    var amount = state.status.amounts[plan];
    confirmDialog('요금제를 ' + C.PLAN_NAMES[plan] + '(월 ' + C.formatWon(amount) + ')로 바꿀까요? 결제수단 등록 전이라 결제되지 않아요.')
      .then(function (yes) {
        if (!yes) { planChoices($('reg-plans'), 'regPlan', previousPlan); return; }
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
        }).catch(function (e) {
          var loggedOut = fail(e);
          if (loggedOut) return; // 로그인 화면으로 이동했다 — 여기서 더 상태를 묻지 않는다
          // 요금제 변경 자체는 서버에 이미 반영됐을 수도 있다 — 화면을 서버의 실제 상태로 다시 맞춘다.
          return auth.api('/family/billing/status').then(function (r2) {
            if (r2.status !== 200) throw r2;
            state.status = r2.data;
            planChoices($('reg-plans'), 'regPlan', state.status.plan);
            return refreshCheckout();
          }).catch(fail);
        });
      });
  }

  function onRegister() {
    var co = state.checkout;
    if (!co || !$('reg-consent').checked) return banner(C.errorMessage('consent_required'));
    // 결제 준비값을 받아온 그 결제수단으로 등록한다 — 그 사이 라디오를 다시 바꿨을 가능성을 배제한다.
    // method·동의 버전은 여기서 지역 변수로 붙잡아 둔다 — PC 경로는 이 값을 그대로 쓰고 PENDING을 다시 읽지 않는다
    // (그 사이 PENDING이 지워지거나 바뀌어도 이미 열린 결제창의 결과는 안전하게 등록으로 이어진다).
    var method = co.method;
    var consentVersion = C.BILLING_CONSENT_VERSION;
    busy($('reg-submit'), true);
    // 모바일은 결제창이 페이지를 떠났다 돌아온다(새로고침으로 지역 변수가 사라진다) — 그때 쓸 값만 여기 보관한다.
    sessionStorage.setItem(PENDING_KEY, JSON.stringify({ method: method, consentVersion: consentVersion }));
    if (!window.PortOne) {
      // SDK가 아직 로드되지 않았거나 차단됐다 — 새 창을 열지 않고 바로 안내한다.
      sessionStorage.removeItem(PENDING_KEY);
      busy($('reg-submit'), false);
      return banner(C.errorMessage('payment_window_failed'));
    }
    // 카드 입력 등으로 결제창을 오래 열어 둘 수 있다 — 버튼만 다시 눌리게 풀어줄 뿐, PENDING도 checkout도
    // 건드리지 않는다. 원래 결제창 Promise가 나중에 실제로 끝나면 그 결과로 그대로 이어서 처리한다.
    var settled = false;
    var stuckTimer = setTimeout(function () {
      if (!settled) busy($('reg-submit'), false);
    }, 5 * 60 * 1000);
    track('pg_open');
    window.PortOne.requestIssueBillingKey({
      storeId: co.storeId,
      channelKey: co.channelKey,
      billingKeyMethod: co.billingKeyMethod,
      issueId: co.issueId,
      issueName: co.issueName,
      customer: { customerId: co.customer.customerId },
      redirectUrl: CFG.redirectUri + '?pgReturn=1',
    }).then(function (resp) {
      settled = true;
      clearTimeout(stuckTimer);
      if (!resp) return; // 모바일 리다이렉트 — 복귀 후 처리(그때는 PENDING을 읽는다)
      if (resp.code || !resp.billingKey) {
        // 결제창을 닫았거나 실패했다 — 다시 시도하려면 새 issueId가 필요하다(같은 값은 재사용할 수 없다).
        // 포트원이 준 메시지는 화면에 그대로 옮기지 않는다(코드만 콘솔에 남긴다).
        console.warn('PortOne 결제창 실패:', resp.code);
        track('register_fail');
        sessionStorage.removeItem(PENDING_KEY);
        busy($('reg-submit'), false);
        return refreshCheckout().then(function () {
          // refreshCheckout 자체가 실패했으면(state.checkout이 여전히 null) 그 실패가 이미 로그인 이동·다시 시도
          // 화면·배너로 안내를 끝냈다 — 결제창 실패 배너로 덮어쓰지 않는다.
          if (state.checkout) banner(C.errorMessage('payment_window_failed'));
        });
      }
      busy($('reg-submit'), false);
      // PENDING을 다시 읽지 않고 클릭 시점에 붙잡아 둔 값을 그대로 쓴다.
      return submitBillingKey(resp.billingKey, { method: method, consentVersion: consentVersion });
    }).catch(function (e) {
      settled = true;
      clearTimeout(stuckTimer);
      sessionStorage.removeItem(PENDING_KEY);
      busy($('reg-submit'), false);
      return refreshCheckout().then(function () {
        if (state.checkout) fail(e);
      });
    });
  }

  // captured가 있으면(PC 경로 — onRegister가 클릭 시점 값을 직접 넘긴다) PENDING을 읽지 않는다.
  // 모바일 복귀(handleReturns)만 PENDING에 의존한다 — 새로고침으로 지역 변수가 사라지기 때문이다.
  function submitBillingKey(billingKey, captured) {
    var pending = captured || JSON.parse(sessionStorage.getItem(PENDING_KEY) || 'null');
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
    }).catch(function (e) { track('register_fail'); load().then(function () { fail(e); }); });
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
    $('done-app').href = CFG.appDeepLink;
    show('done');
    track('register_success');
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
    if (sub.expired) fact(dl, '안내', '다시 구독하면 등록 후 바로 결제돼요.');
    var periodEnd = b.currentPeriodEnd || sub.trialEndsAt;
    var periodEnded = !!periodEnd && new Date(periodEnd).getTime() <= Date.now();
    $('mg-cancel').hidden = !b.nextPaymentAt;
    $('mg-resume').hidden = !b.cancelAtPeriodEnd || periodEnded;
    text($('mg-method'), sub.expired ? '결제수단 등록하고 다시 구독하기' : '결제수단 변경');
    planChoices($('mg-plans'), 'mgPlan', b.pendingPlan || s.currentPlan);

    // 한 달 쉬어가기 — 예정이면 취소 버튼, 쉬는 중이면 고객센터 안내 한 줄.
    var resumeAmount = s.amounts[b.pendingPlan || s.currentPlan];
    if (resumeAmount === null || resumeAmount === undefined) resumeAmount = s.amount; // 그래도 없으면 금액 절을 뺀다
    var pauseView = C.pauseManageText(sub.pause || b.pause, resumeAmount);
    $('mg-pause').hidden = !pauseView;
    if (pauseView) {
      text($('mg-pause-text'), pauseView.text);
      $('mg-pause-cancel').hidden = !pauseView.canCancel;
      $('mg-pause-cs').hidden = pauseView.canCancel;
    }

    var body = $('mg-history');
    body.innerHTML = '';
    var rows = (s.payments || []).filter(function (p) { return p.status !== 'revoked'; });
    var now = new Date();
    rows.forEach(function (p) {
      var tr = document.createElement('tr');
      tr.appendChild(text(document.createElement('td'), C.formatKstDate(p.paidAt || p.dueAt)));
      tr.appendChild(text(document.createElement('td'), C.formatWon(p.amount)));
      tr.appendChild(text(document.createElement('td'), C.paymentStatusLabel(p.status)));
      var action = document.createElement('td');
      var refundLabel = C.refundRequestLabel(p);
      if (refundLabel) {
        text(action, refundLabel); // 처리된 요청(closed)도 다시 요청 버튼을 띄우지 않는다
      } else if (C.canRequestRefund(p, now)) {
        var btn = text(document.createElement('button'), '환불 요청');
        btn.type = 'button';
        btn.className = 'btn';
        btn.onclick = function () { openRefund(p); };
        action.appendChild(btn);
      }
      tr.appendChild(action);
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

  // ── 해지 화면(쉬어가기 제안 · 이용 안내 · 해지 이유) ──
  function renderReasons() {
    var box = $('cs-reasons');
    box.innerHTML = '';
    C.CANCEL_REASONS.forEach(function (r) {
      var label = document.createElement('label');
      label.className = 'choice';
      var input = document.createElement('input');
      input.type = 'radio'; input.name = 'cancelReason'; input.value = r.value;
      label.appendChild(input);
      label.appendChild(document.createTextNode(' ' + r.label));
      box.appendChild(label);
    });
    var other = $('cs-reason-text');
    other.value = '';
    other.hidden = true;
  }

  function onCancel() {
    var s = state.status;
    var offer = C.pauseOffer(s.pause);
    $('cs-pause').hidden = offer.kind !== 'offer';
    text($('cs-pause-text'), offer.kind === 'offer' ? offer.text : '');
    $('cs-pause-limit').hidden = offer.kind !== 'limit';
    text($('cs-pause-limit'), offer.kind === 'limit' ? offer.text : '');
    text($('cs-keep'), C.cancelKeepText(s.subscription, new Date()));
    renderReasons();
    busy($('cs-cancel-btn'), false);
    track('cancel_view');
    $('cancel-sheet').showModal();
  }

  function closeCancelSheet() {
    var d = $('cancel-sheet');
    if (d.open) d.close();
  }

  function onCancelConfirm() {
    var reason = selectedValue('cancelReason');
    var reasonText = $('cs-reason-text').value.trim();
    var body = {};
    if (reason) body.reason = reason;
    if (reason === 'other' && reasonText) body.reasonText = reasonText.slice(0, 300);
    busy($('cs-cancel-btn'), true);
    auth.api('/family/billing/cancel', { method: 'POST', body: body }).then(function (r) {
      if (r.status !== 200) throw r;
      closeCancelSheet();
      track('cancel_done');
      return load().then(function () { banner('해지했어요.', true); });
    }).catch(function (e) {
      busy($('cs-cancel-btn'), false);
      closeCancelSheet();
      fail(e);
    });
  }

  function onPauseRequest() {
    var p = state.status.pause || {};
    closeCancelSheet();
    confirmDialog(C.formatKstDate(p.from) + '부터 ' + C.formatKstDate(p.until) + '까지 결제와 안부전화를 쉬어요. 한 달 쉬어가기를 신청할까요?')
      .then(function (yes) {
        if (!yes) return;
        auth.api('/family/billing/pause', { method: 'POST' }).then(function (r) {
          if (r.status !== 200) throw r;
          track('pause_done');
          var sp = r.data && r.data.subscription && r.data.subscription.pause;
          var until = (sp && sp.until) || p.until;
          return load().then(function () { banner('한 달 쉬어가기를 신청했어요. ' + C.formatKstDate(until) + '에 자동으로 다시 시작돼요.', true); });
        }).catch(function (e) { fail(e, 'pause'); });
      });
  }

  // ── 환불 요청 ──
  function openRefund(payment) {
    var d = $('refund-dialog');
    $('rf-reason').value = '';
    busy($('rf-yes'), false);
    $('rf-no').onclick = function () { d.close(); };
    $('rf-yes').onclick = function () {
      var reason = $('rf-reason').value.trim().slice(0, 300);
      var body = { paymentId: payment.paymentId };
      if (reason) body.reason = reason;
      busy($('rf-yes'), true);
      auth.api('/family/billing/refund-request', { method: 'POST', body: body }).then(function (r) {
        if (r.status !== 200) throw r;
        d.close();
        track('refund_request');
        return load().then(function () { banner('환불 요청을 보냈어요. 확인 후 고객센터(' + CFG.csPhone + ')에서 연락드려요.', true); });
      }).catch(function (e) {
        busy($('rf-yes'), false);
        d.close();
        fail(e, 'refund');
      });
    };
    d.showModal();
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
        .then(onLoginSuccess).catch(function (e) { show('login'); fail(e); });
    }
    var pg = C.parsePortoneReturn(location.search);
    if (pg) {
      clearUrl();
      if (!auth.getSession()) { show('login'); return Promise.resolve(banner(C.errorMessage('session_expired'))); }
      if (pg.code || !pg.billingKey) {
        // 포트원이 준 메시지는 화면에 그대로 옮기지 않는다(코드만 콘솔에 남긴다).
        console.warn('PortOne 결제창 실패(모바일 복귀):', pg.code);
        track('register_fail');
        sessionStorage.removeItem(PENDING_KEY);
        return load().then(function () { banner(C.errorMessage('payment_window_failed')); });
      }
      return submitBillingKey(pg.billingKey);
    }
    if (!auth.getSession()) { show('login'); return Promise.resolve(); }
    return load();
  }

  function onLoginSuccess() {
    track('login_success');
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
        auth.signInWithGoogleIdToken(resp.credential).then(onLoginSuccess).catch(function (e) { show('login'); fail(e); });
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
      auth.signInWithEmail($('email').value.trim(), $('password').value).then(onLoginSuccess).catch(function (e) { show('login'); fail(e); });
    };
    $('logout').onclick = function () { auth.signOut(); banner(''); show('login'); };
    $('play-link-login').href = CFG.playStoreUrl;
    Array.prototype.forEach.call(document.querySelectorAll('.cs-phone'), function (el) { el.textContent = C.CS_PHONE; });
    $('reg-consent').onchange = function () {
      if ($('reg-consent').checked) track('consent_checked');
      updateSubmit();
    };
    $('reg-submit').onclick = onRegister;
    Array.prototype.forEach.call(document.querySelectorAll('input[name="method"]'), function (el) { el.onchange = refreshCheckout; });
    $('reg-plans').onchange = onPlanChange;
    $('done-manage').onclick = function () { load(); };
    $('mg-method').onclick = function () { renderRegister(true); };
    $('reg-back-manage').onclick = renderManage;
    $('mg-cancel').onclick = onCancel;
    $('cs-keep-btn').onclick = closeCancelSheet;
    $('cs-cancel-btn').onclick = onCancelConfirm;
    $('cs-pause-btn').onclick = onPauseRequest;
    $('cs-reasons').onchange = function () {
      var other = selectedValue('cancelReason') === 'other';
      $('cs-reason-text').hidden = !other;
      if (other) $('cs-reason-text').focus();
    };
    // 바깥(배경)을 누르면 계속 이용으로 본다. Esc는 브라우저 기본 동작으로 닫힌다(= 계속 이용).
    $('cancel-sheet').addEventListener('click', function (ev) {
      var d = $('cancel-sheet');
      if (ev.target !== d) return;
      var r = d.getBoundingClientRect();
      var inside = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
      if (!inside) closeCancelSheet();
    });
    $('mg-pause-cancel').onclick = function () {
      confirmDialog('쉬어가기를 취소할까요? 원래 결제일에 자동결제돼요.').then(function (yes) {
        if (!yes) return;
        auth.api('/family/billing/pause/cancel', { method: 'POST' }).then(function (r) {
          if (r.status !== 200) throw r;
          return load().then(function () { banner('쉬어가기를 취소했어요.', true); });
        }).catch(function (e) { fail(e, 'pause'); });
      });
    };
    $('mg-resume').onclick = function () { postAndReload('/family/billing/resume', undefined, '해지를 취소했어요. 다음 결제일에 자동결제돼요.'); };
    $('mg-plan-submit').onclick = function () {
      var plan = selectedValue('mgPlan');
      var sub = state.status.subscription;
      var b = sub.billing || {};
      var current = b.pendingPlan || state.status.currentPlan;
      if (!plan || plan === current) return;
      var name = C.PLAN_NAMES[plan];
      var amount = C.formatWon(state.status.amounts[plan]);
      var msg;
      if (b.cancelAtPeriodEnd) {
        // 해지 예약 중이면 상태(트라이얼·활성·연체)와 무관하게 더 이상 결제가 없다 — 요금만 바뀐다.
        msg = name + '으로 바뀌어요. 해지 예약 중이라 결제되지 않아요.';
      } else if (sub.status === 'trial') {
        msg = '지금 바로 ' + name + '으로 바뀌어요. 체험이 끝나면 월 ' + amount + '이 결제돼요.';
      } else if (sub.status === 'past_due') {
        msg = b.nextPaymentAt
          ? name + ' 요금은 다음 결제부터 적용되고, 결제되지 않은 금액은 기존 요금으로 곧 다시 결제돼요.'
          : name + ' 요금은 다음 결제부터 적용돼요. 결제수단을 다시 등록하면 결제가 진행돼요.';
      } else {
        msg = b.nextPaymentAt
          ? '다음 결제일(' + C.formatKstDate(b.nextPaymentAt) + ')부터 ' + name + ' 월 ' + amount + '으로 바뀌어요.'
          : '다음 결제부터 ' + name + ' 월 ' + amount + '으로 바뀌어요.';
      }
      confirmDialog(msg).then(function (yes) {
        if (yes) postAndReload('/family/billing/plan', { plan: plan }, '요금제를 바꿨어요.');
      });
    };
  }

  bind();
  initGoogle();
  if (!C.isReturnLoad(location.search)) track('pay_view');
  handleReturns();
})();
