// banggeul-assets/pay/pay-app.js — 화면 배선. 순수 로직은 PayCore, 로그인은 PayAuth.
(function () {
  'use strict';
  var CFG = window.PAY_CONFIG;
  var C = window.PayCore;
  var auth = window.PayAuth.createAuth({ fetch: window.fetch.bind(window), storage: window.sessionStorage, config: CFG });
  var OAUTH_STATE_KEY = 'banggeulPayOAuthState';
  var PENDING_KEY = 'banggeulPayPending';
  var IS_MOBILE = C.isMobileUA(navigator.userAgent); // 모바일은 결제자 칸을 줄인다(대표 9/19)
  var VIEWS = ['loading', 'login', 'register', 'done', 'manage', 'message'];
  // steps — 단계 선택 상태(등록 'reg' · 구독 관리 'mg'). stepMode — 등록 화면이 단계 선택으로 그려졌는지(새 서버).
  var state = { status: null, checkout: null, steps: {}, stepMode: false };
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
    $('msg-plans').innerHTML = '';
    $('msg-plans').hidden = true;
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
      if (view === 'free') return message('무료로 이용 중인 가족이에요', '결제할 것이 없어요. 궁금한 점은 고객센터(' + C.CS_PHONE + ')로 연락해 주세요.');
      if (view === 'billing_off') return message('결제 기능을 준비하고 있어요', '무료 체험은 그대로 이용하실 수 있어요. 결제가 열리면 알려드릴게요.');
      if (view === 'amount_error') {
        message('요금을 계산하지 못했어요', C.errorMessage(r.data.amountError));
        var composition = C.readOnlyCompositionLines(r.data);
        if (composition) {
          planCards($('msg-plans'), 'msgPlan', null, composition, true);
          $('msg-plans').hidden = false;
        }
        return;
      }
      if (view === 'manage') return renderManage();
      return renderRegister();
    }).catch(fail);
  }

  // ── 결제수단 등록 ──
  function el(tag, className, value) {
    var e = document.createElement(tag);
    if (className) e.className = className;
    if (value !== undefined) e.textContent = value;
    return e;
  }
  // 요금제 고르기. 서버가 planDetails를 주면 요금제 카드(부모님별 방식·포함 내용·금액) + 참고용 전체 요금표(접힘),
  // 없으면(옛 서버) 이름·금액 라디오만. 호칭 등 서버 문자열은 전부 textContent로만 넣는다(innerHTML 금지).
  function planChoices(container, name, selected) {
    container.innerHTML = '';
    var s = state.status;
    var lines = C.familyLines(s.planDetails);
    if (lines) return planCards(container, name, selected, lines);
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
  // readOnly — 요금을 정할 수 없는 가족의 안내 화면에서 구성만 보여 줄 때(라디오는 모두 비활성·선택 없음).
  // 조각 [{ text, strong }]을 글자 노드·<strong>으로 붙인다(textContent만 — innerHTML 금지).
  function appendSegments(parent, segs) {
    segs.forEach(function (sg) {
      parent.appendChild(sg.strong ? el('strong', '', sg.text) : document.createTextNode(sg.text));
    });
    return parent;
  }
  function planCards(container, name, selected, lines, readOnly) {
    var s = state.status;
    // 우리 가족 이용 방식 — 부모님별 칩(방식별 색). 호칭은 textContent.
    var modes = el('div', 'family-modes');
    modes.appendChild(el('p', 'family-modes-label', '우리 가족 이용 방식'));
    var chips = el('ul', 'mode-chips');
    chips.setAttribute('aria-label', '우리 가족 이용 방식');
    C.familyModeChips(lines).forEach(function (c) { chips.appendChild(el('li', 'mode-chip mode-' + c.mode, c.text)); });
    modes.appendChild(chips);
    container.appendChild(modes);
    ['lite', 'standard', 'plus'].forEach(function (p) {
      // 방식별 차이 굵게의 기준 — 서버 priceTable.app[plan].feature(웹에 요금표를 두지 않는다).
      var appFeature = s.priceTable && s.priceTable.app && s.priceTable.app[p] ? s.priceTable.app[p].feature : null;
      var m = C.planCardModel(p, s.planDetails[p], appFeature);
      // label은 라디오와 이름·금액만 감싼다(label 안에 ul·p를 두지 않는다). 부모님별 줄·안내는 aria-describedby로 잇는다 —
      // 라디오의 이름은 요금제 이름·금액만 읽힌다.
      var card = el('div', 'plan-card');
      var head = el('label', 'plan-head');
      var input = document.createElement('input');
      input.type = 'radio'; input.name = name; input.value = p;
      input.checked = !readOnly && p === selected;
      input.disabled = readOnly || !m.selectable;
      head.appendChild(input);
      head.appendChild(el('span', 'plan-name', m.name));
      head.appendChild(el('span', 'price', m.priceText));
      card.appendChild(head);
      var ids = [];
      if (m.summary) {
        // 부모님 한 분 — 요금제 이름 아래 풀어 쓴 한 줄(본문 크기, 금액은 머리에만).
        var sum = appendSegments(el('p', 'plan-summary'), m.summary);
        sum.id = name + '-' + p + '-summary';
        card.appendChild(sum);
        ids.push(sum.id);
      } else if (m.lines.length) {
        var ul = el('ul', 'plan-lines');
        ul.id = name + '-' + p + '-lines';
        m.lines.forEach(function (segs) { ul.appendChild(appendSegments(el('li'), segs)); });
        card.appendChild(ul);
        ids.push(ul.id);
      }
      if (m.note) {
        var note = el('p', 'plan-note', m.note);
        note.id = name + '-' + p + '-note';
        card.appendChild(note);
        ids.push(note.id);
      }
      if (ids.length) input.setAttribute('aria-describedby', ids.join(' '));
      container.appendChild(card);
    });
    var sections = C.priceTableSections(s.priceTable);
    if (!sections.length) return;
    var details = el('details', 'price-table');
    details.appendChild(el('summary', '', '전체 요금표 보기'));
    details.appendChild(el('p', 'muted small', '참고용 요금표예요. 여기서는 고를 수 없고, 이용 방식(앱 설치·전화)은 부모님별로 방글이 앱에서 정해져요.'));
    sections.forEach(function (sec) {
      details.appendChild(el('h3', '', sec.title));
      var ul = el('ul', 'plan-lines');
      sec.rows.forEach(function (r) { ul.appendChild(el('li', '', r.name + ' · ' + r.feature + ' · ' + r.price)); });
      details.appendChild(ul);
    });
    container.appendChild(details);
  }
  function selectedValue(name) {
    var el = document.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : null;
  }

  // ── 단계 선택(① 이용 방식 → ② 몇 분·누구 → ③ 요금제) — 등록('reg')과 구독 관리('mg', ①②만)가 같이 쓴다.
  // 선택이 바뀔 때마다 통째로 다시 그리고, 초점은 같은 id의 입력으로 되돌린다(키보드·화면 낭독 사용자).
  // 호칭·이름 등 서버 문자열은 전부 textContent로만 넣는다(innerHTML 금지).
  function phoneOk() { return state.status.phoneModeAvailable !== false; }
  function choiceInput(type, id, name, value, labelText, checked, disabled, data) {
    var label = el('label', 'choice');
    label.htmlFor = id;
    var input = document.createElement('input');
    input.type = type; input.id = id; input.name = name; input.value = value;
    input.checked = !!checked; input.disabled = !!disabled;
    Object.keys(data || {}).forEach(function (k) { input.dataset[k] = data[k]; });
    label.appendChild(input);
    label.appendChild(el('span', 'choice-text', labelText));
    return label;
  }
  function stepFieldset(prefix, key, no, legendText) {
    var f = el('fieldset', 'card step');
    f.id = prefix + '-step-' + key;
    var lg = el('legend');
    var num = el('span', 'step-no', String(no));
    num.setAttribute('aria-hidden', 'true');
    lg.appendChild(num);
    lg.appendChild(document.createTextNode(legendText));
    f.appendChild(lg);
    return f;
  }
  // ③ 요금제 카드(단계 화면·구독 관리 공용) — 고른 조합의 월 합계 하나(표시용, priceTable로 계산)와 방식별 포함 내용.
  function stepPlanCards(container, name, selected, selection) {
    var s = state.status;
    C.PLAN_KEYS.forEach(function (p) {
      var m = C.stepPlanCardModel(p, selection, s.elders, s.priceTable);
      var card = el('div', 'plan-card');
      var head = el('label', 'plan-head');
      var input = document.createElement('input');
      input.type = 'radio'; input.name = name; input.value = p; input.id = name + '-' + p;
      input.checked = p === selected;
      input.disabled = !m.selectable;
      input.dataset.act = 'plan';
      head.htmlFor = input.id;
      head.appendChild(input);
      head.appendChild(el('span', 'plan-name', m.name));
      head.appendChild(el('span', 'price', m.priceText));
      card.appendChild(head);
      var ids = [];
      m.features.forEach(function (segs, i) {
        var f = appendSegments(el('p', 'plan-summary'), segs);
        f.id = name + '-' + p + '-f' + i;
        card.appendChild(f);
        ids.push(f.id);
      });
      if (m.note) {
        var note = el('p', 'plan-note', m.note);
        note.id = name + '-' + p + '-note';
        card.appendChild(note);
        ids.push(note.id);
      }
      if (ids.length) input.setAttribute('aria-describedby', ids.join(' '));
      container.appendChild(card);
    });
  }
  // 금액 표시에 쓸 조합 — "누구"를 다 고르기 전에는 등록 순서 앞의 {몇 분}으로 어림한다(표시용일 뿐, 결제 금액은 /checkout).
  function displaySelection(st, elders) {
    var v = C.validateSteps(st, elders, {});
    if (v.ok) return v.selection;
    var ids = elders.map(function (e) { return String(e.elderId); });
    var pick = st.chosen.slice();
    ids.forEach(function (id) { if (pick.length < st.count && pick.indexOf(id) < 0) pick.push(id); });
    return ids.filter(function (id) { return pick.indexOf(id) >= 0; }).map(function (id) { return { elderId: id, mode: C.effectiveMode(st, id) }; });
  }
  function renderSteps(prefix) {
    var ctx = state.steps[prefix];
    var s = state.status;
    var elders = s.elders;
    var st = ctx.st;
    var T = C.STEP_TEXT;
    var box = $(prefix + '-steps');
    var active = document.activeElement;
    var focusId = active && box.contains(active) ? active.id : null;
    box.innerHTML = '';
    var no = 1;
    var notes = {};
    C.unpairedNotes(st, elders, s.phoneModeAvailable).forEach(function (n) { notes[n.elderId] = n; });

    // ① 이용 방식 — 모두 같은 방식(기본) 또는 부모님마다 다르게.
    var f1 = stepFieldset(prefix, 'mode', no++, T.modeLegend);
    var seg = el('div', 'seg');
    ['app', 'phone'].forEach(function (m) {
      seg.appendChild(choiceInput('radio', prefix + '-mode-' + m, prefix + 'Mode', m, C.MODE_CHOICE[m],
        !st.perParent && st.sharedMode === m, m === 'phone' && !phoneOk(), { act: 'mode' }));
    });
    f1.appendChild(seg);
    if (!phoneOk()) {
      var pending = el('p', 'step-text muted', C.PHONE_MODE_PENDING);
      pending.id = prefix + '-phone-pending';
      f1.appendChild(pending);
      seg.querySelector('input[value="phone"]').setAttribute('aria-describedby', pending.id);
    }
    if (elders.length > 1) {
      var link = el('button', 'link step-link', st.perParent ? T.perParentClose : T.perParentOpen);
      link.type = 'button';
      link.id = prefix + '-per-parent';
      link.dataset.act = 'perParent';
      link.setAttribute('aria-expanded', st.perParent ? 'true' : 'false');
      f1.appendChild(link);
    }
    if (st.perParent) {
      var pp = el('div', 'per-parent');
      pp.id = prefix + '-per-parent-box';
      f1.querySelector('#' + prefix + '-per-parent').setAttribute('aria-controls', pp.id);
      elders.forEach(function (e, i) {
        var row = el('fieldset', 'per-row');
        row.appendChild(el('legend', '', C.elderLabel(e, i, elders)));
        var rs = el('div', 'seg');
        ['app', 'phone'].forEach(function (m) {
          rs.appendChild(choiceInput('radio', prefix + '-elder-' + i + '-' + m, prefix + 'Elder' + i, m, C.MODE_CHOICE[m],
            C.effectiveMode(st, e.elderId) === m, m === 'phone' && !phoneOk(), { act: 'elderMode', elder: String(e.elderId) }));
        });
        row.appendChild(rs);
        var n = notes[String(e.elderId)];
        if (n) row.appendChild(el('p', 'step-note', n.text));
        pp.appendChild(row);
      });
      f1.appendChild(pp);
    } else {
      Object.keys(notes).forEach(function (id) { f1.appendChild(el('p', 'step-note', notes[id].label + ': ' + notes[id].text)); });
    }
    box.appendChild(f1);

    // ② 몇 분·누구 — 부모님이 한 분뿐이면 통째로 숨긴다.
    if (elders.length > 1) {
      var f2 = stepFieldset(prefix, 'count', no++, T.countLegend);
      f2.appendChild(el('p', 'step-hint', C.SAME_PRICE_HINT));
      var cs = el('div', 'seg');
      for (var c = 1; c <= elders.length; c++) {
        cs.appendChild(choiceInput('radio', prefix + '-count-' + c, prefix + 'Count', String(c), C.countWord(c), st.count === c, false, { act: 'count' }));
      }
      f2.appendChild(cs);
      if (st.count < elders.length) {
        var who = el('fieldset', 'who');
        who.appendChild(el('legend', '', st.count === 1 ? '어느 분께 전화 드릴까요?' : '어느 분들께 전화 드릴까요? (' + C.countWord(st.count) + ')'));
        var wl = el('div', 'choices');
        elders.forEach(function (e, i) {
          var on = st.chosen.indexOf(String(e.elderId)) >= 0;
          var full = st.count > 1 && !on && st.chosen.length >= st.count; // 이미 {몇 분}만큼 골랐으면 나머지는 잠근다
          var item = choiceInput(st.count === 1 ? 'radio' : 'checkbox', prefix + '-who-' + i, prefix + 'Who', String(e.elderId),
            C.elderLabel(e, i, elders), on, full, { act: 'who', elder: String(e.elderId) });
          if (st.count === 1) item.querySelector('input').required = true;
          wl.appendChild(item);
        });
        who.appendChild(wl);
        var check = C.validateSteps(st, elders, {});
        if (!check.ok && check.error === 'who_required') {
          var msg = el('p', 'step-error', check.message);
          msg.id = prefix + '-who-msg';
          who.appendChild(msg);
          who.setAttribute('aria-describedby', msg.id);
        }
        f2.appendChild(who);
        f2.appendChild(el('p', 'step-text', C.EXCLUDED_NOTE));
      }
      box.appendChild(f2);
    }

    var selection = displaySelection(st, elders);
    if (ctx.withPlans) {
      // ③ 요금제 — 고른 조합의 월 금액 하나씩.
      var f3 = stepFieldset(prefix, 'plan', no++, T.planLegend);
      f3.appendChild(el('p', 'step-hint', T.vatNote));
      var pc = el('div', 'choices');
      stepPlanCards(pc, prefix + 'Plan', ctx.plan, selection);
      f3.appendChild(pc);
      box.appendChild(f3);
    } else {
      // 구독 관리 — 요금제는 여기서 고르지 않는다. 지금 요금제가 고른 조합의 통화 일정에 모자라면 미리 알린다(바꾸기는 막음).
      var limits = C.planBlockers(ctx.plan, selection, elders);
      var hint = limits.length ? '' : C.selectionPriceHint(ctx.plan, C.displayTotal(ctx.plan, selection, elders, s.priceTable));
      limits.forEach(function (b) { box.appendChild(el('p', 'step-note', C.planLimitNote(b))); });
      if (hint) {
        var est = el('p', 'step-text', hint);
        est.id = prefix + '-estimate';
        box.appendChild(est);
      }
    }
    if (focusId && $(focusId)) $(focusId).focus();
  }
  function onStepEvent(prefix, ev) {
    var t = ev.target;
    var act = t && t.dataset && t.dataset.act;
    var ctx = state.steps[prefix];
    if (!act || !ctx) return;
    // 링크(버튼)는 click, 입력은 change로만 받는다.
    if ((act === 'perParent') !== (ev.type === 'click')) return;
    var elders = state.status.elders;
    if (act === 'perParent') ctx.st = C.stepsSetPerParent(ctx.st, !ctx.st.perParent, elders);
    else if (act === 'mode') ctx.st = C.stepsSetShared(ctx.st, t.value);
    else if (act === 'elderMode') ctx.st = C.stepsSetElderMode(ctx.st, t.dataset.elder, t.value);
    else if (act === 'count') ctx.st = C.stepsSetCount(ctx.st, Number(t.value), elders);
    else if (act === 'who') ctx.st = C.stepsSetChosen(ctx.st, t.dataset.elder, t.checked, elders);
    else if (act === 'plan') ctx.plan = t.value;
    else return;
    // 방식·누구가 바뀌어 지금 요금제가 부모님 통화 일정에 모자라면 고를 수 있는 가장 싼 요금제로 옮긴다(등록 화면).
    if (act !== 'plan' && ctx.withPlans) ctx.plan = C.ensureValidPlan(ctx.plan, displaySelection(ctx.st, elders), elders, state.status.priceTable);
    renderSteps(prefix);
    if (prefix === 'reg') refreshCheckout(); // 바뀔 때마다 서버 금액을 다시 받고 동의를 풀어 둔다
    else $('mg-selection-msg').textContent = '';
  }

  function renderRegister(fromManage) {
    var s = state.status;
    // 새 서버(/status에 elders·priceTable)면 단계 선택, 아니면(옛 서버) 지금까지의 요금제 카드. 결제수단만 바꾸러 온
    // 경우엔 방식·인원·요금제를 여기서 고르지 않는다(구독 관리에서 바꾼다) — 둘 다 숨긴다.
    state.stepMode = !fromManage && C.hasSteps(s);
    $('reg-steps').innerHTML = '';
    $('reg-steps').hidden = !state.stepMode;
    if (state.stepMode) {
      var regSt = C.defaultStepState(s.elders, s.selection, s.phoneModeAvailable);
      state.steps.reg = { st: regSt, plan: C.ensureValidPlan(s.plan, displaySelection(regSt, s.elders), s.elders, s.priceTable), withPlans: true };
      renderSteps('reg');
      $('reg-plans').innerHTML = '';
    } else {
      state.steps.reg = null;
      text($('reg-elders'), s.planDetails ? '금액은 모두 부가세 포함이에요.' : '부모님 ' + s.elderCount + '분 기준 금액이에요(부가세 포함).');
      planChoices($('reg-plans'), 'regPlan', s.plan);
    }
    $('reg-consent').checked = false;
    $('reg-submit').disabled = true;
    $('reg-submit').setAttribute('aria-busy', 'false');
    $('reg-back-manage').hidden = !fromManage;
    $('reg-plan-card').hidden = !!fromManage || state.stepMode;
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
    // 단계 화면 — 고른 요금제·부모님(selection)으로 미리보기를 받는다. 다 고르기 전이면 서버에 묻지 않고 안내만 한다
    // (seq는 이미 올렸다 — 진행 중이던 이전 응답은 버려진다).
    var sent = null;
    if (state.stepMode && state.steps.reg) {
      var ctx = state.steps.reg;
      var v = C.validateSteps(ctx.st, state.status.elders, {
        phoneModeAvailable: state.status.phoneModeAvailable, plan: ctx.plan, priceTable: state.status.priceTable, requirePlan: true,
      });
      if (!v.ok) { list.appendChild(li(v.message)); return Promise.resolve(); }
      sent = { plan: ctx.plan, selection: v.selection };
    }
    var body = sent ? C.checkoutBody(method, sent.plan, sent.selection) : { method: method };
    return auth.api('/family/billing/checkout', { method: 'POST', body: body }).then(function (r) {
      if (seq !== checkoutSeq) return; // 그 사이 더 최신 요청이 있었다 — 이 응답은 버린다
      if (r.status !== 200) throw r;
      // sent — 이 응답을 받은 요금제·selection. 등록(billing-key)은 화면이 아니라 이 값을 그대로 보낸다.
      state.checkout = Object.assign({}, r.data, { method: method, sent: sent });
      prefillPayer(r.data.customer);
      // 해지 예약 중 결제수단만 바꾸는 경우(chargeKind: 'none')는 동의 문구도 달라진다.
      text($('reg-consent-label'), r.data.chargeKind === 'none' ? CONSENT_LABEL_CANCEL_PENDING : CONSENT_LABEL_DEFAULT);
      var planKey = r.data.plan || (sent && sent.plan);
      var monthlyAmount, summary;
      if (sent) {
        // 단계 화면 — 1번째 줄·버튼 금액은 /checkout 응답만 쓴다(부모님별 줄 합계, 없으면 amount). 요약은 서버가 정규화한 selection.
        monthlyAmount = C.checkoutMonthly(r.data);
        summary = C.selectionSummary(r.data.selection || sent.selection);
      } else {
        // 1번째 줄의 월 가격은 이 결제가 속한 요금제(r.data.plan) 기준이다 — 밀린 결제 중 요금제를 바꿨다면
        // state.status.amount(가족의 현재 요금제 가격)와 다를 수 있다. amounts 맵에 없으면(구버전 호환) 그 값을 쓴다.
        monthlyAmount = state.status.amounts[planKey];
        if (monthlyAmount === null || monthlyAmount === undefined) monthlyAmount = state.status.amount;
        summary = C.modeSummary(state.status.planDetails && state.status.planDetails[planKey] && state.status.planDetails[planKey].lines);
      }
      C.noticeLines({
        planName: C.PLAN_NAMES[planKey], amount: r.data.amount, chargeAt: r.data.chargeAt, chargeKind: r.data.chargeKind,
        nextChargeAt: r.data.nextChargeAt, nextAmount: r.data.nextAmount, monthlyAmount: monthlyAmount,
        // 결제 기준일 — /checkout의 billingDay, 없으면 /status의 값. 둘 다 없으면(옛 서버) PayCore가 결제 예정일에서 읽는다.
        billingDay: r.data.billingDay !== undefined ? r.data.billingDay : state.status.billingDay, now: new Date(),
        modeSummary: summary,
      }).forEach(function (line) { list.appendChild(li(line)); });
      // A-1 — 누르면 무엇이 일어나는지(금액)를 버튼에 적는다. 필수 고지 4종 바로 아래 버튼이다.
      text($('reg-submit'), C.submitLabel({ chargeKind: r.data.chargeKind, amount: r.data.amount, monthlyAmount: monthlyAmount }));
      updateSubmit();
    }).catch(function (e) {
      if (seq !== checkoutSeq) return;
      state.checkout = null;
      updateSubmit();
      var loggedOut = fail(e);
      // 위쪽 배너는 스크롤 밖일 수 있다 — 단계 화면이면 버튼 바로 위 안내에도 같은 문구를 둔다.
      if (!loggedOut && state.stepMode) list.appendChild(li(C.errorMessage((e && e.data && e.data.error) || (e && e.code))));
    });
  }
  // 서버가 준 결제자 정보(지난 등록값·로그인 이메일)로 빈 칸만 채운다 — 이미 입력한 값은 덮지 않는다.
  // 포트원 SDK customer — 비어 있는 선택값(모바일의 휴대폰·이메일)은 싣지 않는다.
  function sdkCustomer(customerId, v) {
    var c = { customerId: customerId, fullName: v.fullName };
    if (v.phoneNumber) c.phoneNumber = v.phoneNumber;
    if (v.email) c.email = v.email;
    return c;
  }

  function prefillPayer(c) {
    if (!c) return;
    [['payer-name', c.fullName], ['payer-phone', c.phoneNumber], ['payer-email', c.email]].forEach(function (p) {
      var input = $(p[0]);
      if (input && !input.value && p[1]) input.value = p[1];
    });
    // 모바일은 이름을 알면 "결제하시는 분" 칸 전체를 숨기고 버튼에서 바로 결제창으로 간다(대표 9/19).
    // 칸이 숨어도 미리 채운 값(이름·있으면 휴대폰·이메일)은 그대로 결제창 요청에 실린다.
    var show = C.payerFieldsToShow(IS_MOBILE, c);
    $('payer-name-row').hidden = !show.name;
    $('payer-phone-row').hidden = !show.phone;
    $('payer-email-row').hidden = !show.email;
    $('payer-card').hidden = !(show.name || show.phone || show.email);
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
    // method·동의 버전(단계 화면이면 요금제·selection까지)은 여기서 지역 변수로 붙잡아 둔다 — PC 경로는 이 값을 그대로 쓰고 PENDING을 다시 읽지 않는다
    // (그 사이 PENDING이 지워지거나 바뀌어도 이미 열린 결제창의 결과는 안전하게 등록으로 이어진다).
    var method = co.method;
    var consentVersion = C.BILLING_CONSENT_VERSION;
    // 단계 화면이면 이 결제 준비값을 받은 요금제·selection도 함께 붙잡는다(옛 흐름·결제수단만 변경이면 null).
    var sent = co.sent || null;
    var captured = { method: method, consentVersion: consentVersion, plan: sent ? sent.plan : null, selection: sent ? sent.selection : null };
    var payer = C.normalizePayer({ name: $('payer-name').value, phone: $('payer-phone').value, email: $('payer-email').value }, { mobile: IS_MOBILE });
    if (!payer.ok) {
      banner(C.errorMessage(payer.error));
      var bad = { payer_name: 'payer-name', payer_phone: 'payer-phone', payer_email: 'payer-email' }[payer.error];
      // 숨겨 둔 칸이 틀렸으면(미리 채운 값이 형식에 안 맞음) 칸을 다시 보여 고칠 수 있게 한다.
      if ($(bad)) { $('payer-card').hidden = false; $(bad + '-row').hidden = false; $(bad).focus(); }
      return;
    }
    busy($('reg-submit'), true);
    // 모바일은 결제창이 페이지를 떠났다 돌아온다(새로고침으로 지역 변수가 사라진다) — 그때 쓸 값만 여기 보관한다.
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(captured));
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
      customer: sdkCustomer(co.customer.customerId, payer.value),
      // KG이니시스 모바일 빌링은 제공 기간(offerPeriod)이 필수다(9/19 실호출: 없으면 INVALID_REQUEST
      // "offerPeriod AT_LEAST_ONE_REQUIRED"). 월 자동결제라 1개월 주기. PC에서도 넣어도 정상 동작 확인.
      offerPeriod: { interval: '1m' },
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
      return submitBillingKey(resp.billingKey, captured);
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
      body: C.billingKeyBody(billingKey, pending), // plan·selection은 있을 때만(단계 화면)
    }).then(function (r) {
      if (r.status !== 200) throw r;
      renderDone(r.data);
    }).catch(function (e) { track('register_fail'); load().then(function () { fail(e); }); });
  }

  function renderDone(result) {
    var list = $('done-lines');
    list.innerHTML = '';
    if (result.chargeAt && result.amount) {
      var billingDay = result.billingDay !== undefined ? result.billingDay
        : (state.checkout && state.checkout.billingDay !== undefined ? state.checkout.billingDay : state.status && state.status.billingDay);
      list.appendChild(li(C.doneChargeLine({ chargeAt: result.chargeAt, amount: result.amount, billingDay: billingDay })));
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
    if (C.hasSteps(s)) {
      // 새 서버 — 요금제 카드 금액은 다음 청구 기준 조합(pendingSelection, 없으면 selection)으로 보인다(표시용).
      $('mg-plans').innerHTML = '';
      stepPlanCards($('mg-plans'), 'mgPlan', b.pendingPlan || s.currentPlan, nextSelection(s));
    } else {
      planChoices($('mg-plans'), 'mgPlan', b.pendingPlan || s.currentPlan);
    }
    renderManageSelection();

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
    rows.forEach(function (p) {
      var tr = document.createElement('tr');
      tr.appendChild(text(document.createElement('td'), C.formatKstDate(p.paidAt || p.dueAt)));
      tr.appendChild(text(document.createElement('td'), C.formatWon(p.amount)));
      tr.appendChild(text(document.createElement('td'), C.paymentStatusLabel(p.status)));
      var action = document.createElement('td');
      var refundLabel = C.refundRequestLabel(p);
      // 셀프 환불 요청은 없앴다(대표 9/18) — 예전에 보낸 요청의 상태만 보여 준다.
      if (refundLabel) text(action, refundLabel);
      tr.appendChild(action);
      body.appendChild(tr);
    });
    $('mg-history-empty').hidden = rows.length > 0;
    show('manage');
  }

  // 다음 청구 기준 조합 — 바꿔 둔 것(pendingSelection)이 있으면 그것, 없으면 지금 청구 기준(selection).
  // 서버가 selection을 안 주면(과도기) 부모님 목록의 기본값으로 대신한다.
  function nextSelection(s) {
    if (s.pendingSelection && s.pendingSelection.length) return s.pendingSelection;
    if (s.selection && s.selection.length) return s.selection;
    return C.stepSelection(C.defaultStepState(s.elders, null, s.phoneModeAvailable), s.elders);
  }

  // 방식·인원 — 지금 청구 기준과 다음 결제부터 바뀔 조합을 보여 주고, "방식·인원 바꾸기"로 단계 선택(①②)을 연다.
  function renderManageSelection() {
    var s = state.status;
    var on = C.hasSteps(s);
    $('mg-selection-card').hidden = !on;
    state.steps.mg = null;
    $('mg-steps').innerHTML = '';
    $('mg-steps').hidden = true;
    $('mg-selection-actions').hidden = true;
    $('mg-selection-open').hidden = false;
    $('mg-selection-open').setAttribute('aria-expanded', 'false');
    text($('mg-selection-msg'), '');
    busy($('mg-selection-submit'), false);
    if (!on) return;
    var dl = $('mg-selection-facts');
    dl.innerHTML = '';
    fact(dl, '지금', C.selectionDescribe(s.selection, s.elders));
    fact(dl, '다음 결제부터', s.pendingSelection && s.pendingSelection.length ? C.selectionDescribe(s.pendingSelection, s.elders) : '');
  }
  function openManageSelection() {
    var s = state.status;
    var b = s.subscription.billing || {};
    state.steps.mg = {
      st: C.defaultStepState(s.elders, s.pendingSelection && s.pendingSelection.length ? s.pendingSelection : s.selection, s.phoneModeAvailable),
      plan: b.pendingPlan || s.currentPlan, withPlans: false,
    };
    $('mg-steps').hidden = false;
    renderSteps('mg');
    $('mg-selection-open').hidden = true;
    $('mg-selection-open').setAttribute('aria-expanded', 'true');
    $('mg-selection-actions').hidden = false;
    var first = $('mg-steps').querySelector('input:not([disabled])');
    if (first) first.focus();
  }
  function submitManageSelection() {
    var s = state.status;
    var ctx = state.steps.mg;
    if (!ctx) return;
    var msgEl = $('mg-selection-msg');
    var v = C.validateSteps(ctx.st, s.elders, { phoneModeAvailable: s.phoneModeAvailable, plan: ctx.plan });
    if (!v.ok) return text(msgEl, v.message);
    if (C.sameSelection(v.selection, nextSelection(s))) return text(msgEl, C.errorMessage('same_selection'));
    text(msgEl, '');
    confirmDialog(C.selectionConfirmText(v.selection, s.elders)).then(function (yes) {
      if (!yes) return;
      var btn = $('mg-selection-submit');
      busy(btn, true);
      var nextAt = (s.subscription.billing || {}).nextPaymentAt;
      auth.api('/family/billing/selection', { method: 'POST', body: C.selectionBody(v.selection) }).then(function (r) {
        if (r.status !== 200) throw r;
        var done = C.selectionAppliedText(r.data, nextAt);
        return load().then(function () { banner(done, true); });
      }).catch(function (e) {
        busy(btn, false);
        if (fail(e)) return;
        text(msgEl, C.errorMessage((e && e.data && e.data.error) || (e && e.code)));
      });
    });
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
    var refundText = C.cancelRefundText(s.subscription, s.payments);
    text($('cs-refund'), refundText);
    $('cs-refund').hidden = !refundText;
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
    $('payer-form').onsubmit = function (ev) { ev.preventDefault(); }; // 엔터로 페이지가 새로고침되지 않게
    prefillPayer({}); // 첫 화면부터 모바일은 이름 칸만(결제 준비값이 오면 다시 맞춘다)
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
    $('reg-plans').onchange = onPlanChange; // 옛 서버(단계 화면 아님)에서만 쓰인다
    ['reg', 'mg'].forEach(function (prefix) {
      $(prefix + '-steps').addEventListener('change', function (ev) { onStepEvent(prefix, ev); });
      $(prefix + '-steps').addEventListener('click', function (ev) { onStepEvent(prefix, ev); });
    });
    $('mg-selection-open').onclick = openManageSelection;
    $('mg-selection-cancel').onclick = renderManageSelection;
    $('mg-selection-submit').onclick = submitManageSelection;
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
