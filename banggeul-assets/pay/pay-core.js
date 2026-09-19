// banggeul-assets/pay/pay-core.js
// 방글이 웹 결제 화면의 순수 로직 — 브라우저(window.PayCore)와 node --test 양쪽에서 쓴다.
// 요금표를 웹에 두지 않는다. 결제·고지 금액은 서버(/checkout) 응답만 쓰고, 단계 화면의 요금제 카드 금액만
// 서버가 준 priceTable로 표시용 합계를 낸다(displayTotal).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PayCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var KST_MS = 9 * 60 * 60 * 1000;
  var BILLING_CONSENT_VERSION = '2026-09-18c'; // 청약철회 문구 삭제, 대표 9/18
  var CS_PHONE = '1877-1979';
  var PLAN_NAMES = { lite: '라이트', standard: '스탠다드', plus: '플러스' };
  var METHOD_LABELS = { CARD: '카드', KAKAOPAY: '카카오페이', NAVERPAY: '네이버페이' };
  var OAUTH_PROVIDERS = { kakao: true, naver: true };
  var CHARGE_KINDS = { none: true, trial_end: true, renewal: true, overdue: true, immediate: true, pause_end: true };
  // 해지 이유 — 서버 화이트리스트(CANCEL_REASONS)와 같은 순서·값. 라벨은 운영 콘솔과 같다.
  var CANCEL_REASONS = [
    { value: 'price', label: '요금이 부담돼요' },
    { value: 'not_used', label: '부모님이 잘 안 받으세요' },
    { value: 'call_quality', label: '통화가 아쉬워요' },
    { value: 'no_longer_needed', label: '이제 필요 없어요' },
    { value: 'other', label: '기타' },
  ];
  // 결제 흐름 측정 — 서버 화이트리스트(PAY_EVENTS)와 같다. 이벤트 이름만 보낸다(개인 정보 없음).
  var PAY_EVENTS = ['pay_view', 'login_view', 'login_success', 'register_view', 'consent_checked', 'pg_open',
    'register_success', 'register_fail', 'cancel_view', 'cancel_done', 'pause_done'];
  // 탭(세션)당 한 번만 세는 이벤트 — 로그인·결제창 복귀로 페이지가 다시 열려도 방문 한 번으로 센다.
  var ONCE_PER_TAB_EVENTS = ['pay_view', 'login_view', 'consent_checked'];

  function formatWon(n) {
    if (n === null || n === undefined || isNaN(Number(n))) return '-';
    return Number(n).toLocaleString('ko-KR') + '원';
  }

  function kstParts(iso) {
    var d = new Date(new Date(iso).getTime() + KST_MS);
    return { month: d.getUTCMonth() + 1, day: d.getUTCDate() };
  }

  function formatKstDate(iso) {
    var p = kstParts(iso);
    return p.month + '월 ' + p.day + '일';
  }

  function kstDayOfMonth(iso) {
    return kstParts(iso).day;
  }

  // 환불 기준(대표 9/18) — 고객 요청 환불(청약철회)은 두지 않는다. 첫 결제를 포함해 결제된 요금은 환불하지 않고,
  // 서비스 장애 등 회사 사정은 고객센터로 안내한다.
  var CANCEL_ANYTIME = '언제든 이 페이지에서 해지할 수 있어요. 해지해도 결제한 기간이 끝날 때까지 이용하실 수 있어요. ';
  var NO_REFUND = '결제된 요금은 환불되지 않아요. 서비스 장애 등 회사 사정이 있을 때는 고객센터(' + CS_PHONE + ')로 연락해 주세요.';
  var MONTH_END = ' 그 날짜가 없는 달은 말일에 결제돼요.';
  var EVERY_MONTH = '이후에도 한 달마다 같은 날 자동결제돼요.';

  // 가족의 결제 기준일(1~31, KST) — 서버 billingDay가 우선이고, 없으면(옛 서버) 주어진 결제 예정일의 날짜로 대신한다.
  function billingDayOf(billingDay, fallbackIso) {
    var d = Number(billingDay);
    if (billingDay !== null && billingDay !== undefined && billingDay !== '' && d >= 1 && d <= 31 && Math.floor(d) === d) return d;
    return fallbackIso ? kstDayOfMonth(fallbackIso) : null;
  }
  function monthEndClause(day) { return day >= 29 ? MONTH_END : ''; }

  // 결제수단 등록 완료 화면의 결제 안내 한 줄 — 회사 전체의 정해진 날짜처럼 읽히지 않게 "한 달마다 같은 날"로 쓴다.
  function doneChargeLine(o) {
    if (!o || !o.chargeAt) return null;
    return formatKstDate(o.chargeAt) + '에 ' + formatWon(o.amount) + '이 결제되고, ' + EVERY_MONTH +
      monthEndClause(billingDayOf(o.billingDay, o.chargeAt));
  }

  // 대장 §8-4 구독 필수 표기 4종: 가격 · 무료 기간 · 자동결제 시점 · 해지 방법.
  // 문구는 서버가 정한 chargeKind로만 정한다(시간차 어림짐작 안 함): none · trial_end · renewal · overdue · immediate.
  function noticeLines(opts) {
    // 1번째 줄은 "이번 청구액"이 아니라 요금제의 월 정액을 보여준다 — chargeKind가 'none'이면 이번 청구(amount)는
    // 없어도(null) 요금제 자체의 월 가격(monthlyAmount)은 있다. monthlyAmount가 없으면 구버전 호출 호환으로 amount를 쓴다.
    var line1Price = formatWon((opts.monthlyAmount !== null && opts.monthlyAmount !== undefined) ? opts.monthlyAmount : opts.amount);
    // 방식 요약(앱 설치 · 전화 방식 · 부모님 n분)은 서버 planDetails가 있을 때만 — 옛 서버면 빼고 그대로 보인다.
    var line1 = opts.planName + ' 요금제 · ' + (opts.modeSummary ? opts.modeSummary + ' · ' : '') + '월 ' + line1Price + ' (부가세 포함)';
    var kind = opts.chargeKind;

    // chargeKind가 'none'이거나(구버전 호출 호환) chargeAt이 없으면 해지 예약 중에 결제수단만 바꾸는 경우다.
    if (kind === 'none' || (!kind && (opts.chargeAt === null || opts.chargeAt === undefined))) {
      return [
        line1,
        '결제수단만 바뀌고, 해지 예약은 그대로예요. 추가로 결제되지 않아요.',
        '해지를 취소하면 다음 결제일부터 이 결제수단으로 자동결제돼요.',
        CANCEL_ANYTIME + NO_REFUND,
      ];
    }

    if (!CHARGE_KINDS[kind]) {
      // 서버가 결제 성격을 못 정했거나 모르는 값을 보냈다 — 잘못된 안내를 하느니 새로고침을 권한다.
      // 등록 버튼 자체를 막는 건 pay-app 쪽(updateSubmit)의 몫이다.
      return [line1, '결제 예정 정보를 확인하지 못했어요. 새로고침 후 다시 확인해 주세요.'];
    }

    var price = formatWon(opts.amount);
    var date = formatKstDate(opts.chargeAt);
    var nextDate = opts.nextChargeAt ? formatKstDate(opts.nextChargeAt) : null;
    var nextPrice = formatWon(opts.nextAmount);
    // 결제일은 가족마다 다르다(첫 결제일 기준). 기준일은 서버 billingDay, 없으면 결제 예정일에서 읽는다.
    var day = billingDayOf(opts.billingDay, (kind === 'overdue' || kind === 'immediate') ? opts.nextChargeAt : opts.chargeAt);
    var monthEnd = monthEndClause(day);

    var line2, line3;
    // 4번째 줄 가운데 — 결제 전에 해지하면 어떻게 되는지.
    var beforeChargeClause = '다음 결제일 전에 해지하면 다음 결제는 되지 않아요. ';

    if (kind === 'pause_end') {
      // 쉬어가기 중(또는 예정)에 결제수단만 바꾸는 경우 — 쉬어가기가 끝나는 날 결제가 다시 시작된다.
      line2 = '쉬어가기가 ' + date + '에 끝나요. 오늘은 결제되지 않아요.';
      line3 = date + '에 ' + price + '이 결제되고, ' + EVERY_MONTH + monthEnd;
    } else if (kind === 'renewal') {
      // 이미 결제된 이용 기간 안에서 결제수단만 바꾸는 경우 — 오늘은 결제되지 않는다.
      line2 = '이미 결제한 이용 기간이 ' + date + '까지예요. 오늘은 결제되지 않아요.';
      line3 = date + '에 ' + price + '이 결제되고, ' + EVERY_MONTH + monthEnd;
    } else if (kind === 'overdue') {
      // 밀린 결제가 있다 — 등록하는 순간 밀린 금액부터 처리하고, 이후 정기 결제로 돌아간다.
      // 다음 결제일이 첫 결제일 기준인지 알 수 없으니 "(첫 결제일로부터 한 달 뒤)"는 붙이지 않는다.
      line2 = '결제되지 않은 ' + price + '이 등록 후 바로 결제돼요.';
      line3 = '다음 결제는 ' + nextDate + '에 ' + nextPrice + '이고, ' + EVERY_MONTH + monthEnd;
    } else if (kind === 'immediate') {
      // 체험이 이미 끝난 뒤의 신규(또는 재)등록 — 등록하는 순간 바로 첫 결제가 일어난다.
      line2 = '등록하면 바로 첫 결제(' + price + ')가 진행돼요.';
      line3 = '다음 결제는 ' + nextDate + '(첫 결제일로부터 한 달 뒤)에 ' + nextPrice + '이고, ' + EVERY_MONTH + monthEnd;
    } else {
      // 'trial_end' — 체험 중 최초 등록. 결제는 체험이 끝나는 날부터 시작된다.
      line2 = '오늘은 결제되지 않아요. ' + date + '까지 무료로 이용하실 수 있어요.';
      line3 = date + '에 ' + price + '이 처음 결제되고, ' + EVERY_MONTH + monthEnd;
      beforeChargeClause = '첫 결제 전에 해지하면 청구되지 않아요. ';
    }

    var line4 = CANCEL_ANYTIME + beforeChargeClause + NO_REFUND;
    return [line1, line2, line3, line4];
  }

  // ── 요금제 카드(대표 9/18 2차) — 그 가족의 실제 구성(서버 planDetails)으로 부모님별 방식·포함 내용·금액을 보여 준다.
  // 방식(앱 설치·전화)은 부모님별로 앱에서 정해진다 — 웹에서 고르지 않는다. 금액·포함 내용은 서버 값만 쓴다.
  // 호칭(title)은 보호자가 등록한 사용자 입력이다 — 가공하지 않고, 화면에는 textContent로만 넣는다.
  var PLAN_KEYS = ['lite', 'standard', 'plus'];
  var MODE_SHORT = { app: '앱', phone: '전화' };
  var MODE_FAMILY = { app: '앱 설치', phone: '전화(무설치)' };
  var MODE_SINGLE = { app: '앱 설치', phone: '전화 방식' };
  var LINE_KIND = { base: '기본', extra: '한 분 더' };

  function modeOf(line) { return line && line.mode === 'phone' ? 'phone' : 'app'; }
  function titleOf(line) { return (line && line.title) ? String(line.title) : '부모님'; }
  function wonOrPending(n) { return (n === null || n === undefined) ? '준비 중' : formatWon(n); }

  // 포함 내용(서버 feature, 예 '주 5회 · 하루 3분')을 칸별 조각으로 — [{ text, strong }].
  // phrase: 풀어 쓴 문구(1칸 '… 안부', 2칸 '하루 n분 통화'). strong: 같은 요금제의 앱 방식(서버 priceTable.app[plan].feature)과
  // 다른 칸 — 전화 방식의 차이를 굵게 보인다. 비교 기준이 없으면 굵게 하지 않는다(요금표를 웹에 두지 않는다).
  var FEATURE_SEP = ' · ';
  function featureSegments(feature, appFeature, phrase) {
    if (!feature) return [];
    var parts = String(feature).split(FEATURE_SEP);
    var appParts = appFeature ? String(appFeature).split(FEATURE_SEP) : null;
    var out = [];
    parts.forEach(function (part, i) {
      if (i > 0) out.push({ text: FEATURE_SEP, strong: false });
      var text = part;
      if (phrase && i === 0) text = part + ' 안부';
      else if (phrase && i === 1 && /분$/.test(part)) text = part + ' 통화';
      out.push({ text: text, strong: !!appParts && appParts[i] !== undefined && appParts[i] !== part });
    });
    return out;
  }

  // 카드의 부모님별 줄(여러 분일 때): {호칭} ({앱|전화}) {포함 내용} · {기본|한 분 더} {금액|준비 중}
  function planLineSegments(line, appFeature) {
    var feat = featureSegments(line.feature, appFeature, false);
    return [{ text: titleOf(line) + ' (' + MODE_SHORT[modeOf(line)] + ')' + (feat.length ? ' ' : ''), strong: false }]
      .concat(feat)
      .concat([{ text: ' · ' + (LINE_KIND[line.kind] || LINE_KIND.base) + ' ' + wonOrPending(line.amount), strong: false }]);
  }
  function planLineText(line) {
    return planLineSegments(line, null).map(function (s) { return s.text; }).join('');
  }

  // 필수 고지 1번째 줄의 방식 요약 — 한 분이면 앱 설치/전화 방식, 여러 분이면 부모님 n분.
  function modeSummary(lines) {
    if (!lines || !lines.length) return null;
    if (lines.length === 1) return MODE_SINGLE[modeOf(lines[0])];
    return '부모님 ' + lines.length + '분';
  }

  // 우리 가족 이용 방식 — 부모님별 칩. mode로 색을 나눈다.
  var MODE_CHIP = { app: '앱으로 받아요', phone: '전화로 받아요' };
  function familyModeChips(lines) {
    return (lines || []).map(function (l) { return { text: titleOf(l) + ' · ' + MODE_CHIP[modeOf(l)], mode: modeOf(l) }; });
  }

  // 부모님 구성은 요금제와 무관하다 — 줄이 있는 첫 요금제의 줄을 쓴다. planDetails가 없으면(옛 서버) null.
  function familyLines(planDetails) {
    if (!planDetails) return null;
    for (var i = 0; i < PLAN_KEYS.length; i++) {
      var d = planDetails[PLAN_KEYS[i]];
      if (d && d.lines && d.lines.length) return d.lines;
    }
    return null;
  }

  // 카드 안내와 오류 안내(phone_extra_price_undecided)가 같은 문구를 쓴다.
  var PHONE_EXTRA_PENDING = '전화 방식 부모님 한 분 더 요금은 아직 준비 중이에요. 고객센터(' + CS_PHONE + ')로 문의해 주세요.';
  // appFeature — 서버 priceTable.app[plan].feature(방식별 차이 굵게의 기준). 없으면 굵게 없음.
  // 부모님 한 분이면 summary(풀어 쓴 한 줄, 금액은 카드 머리에만)·lines 빈 배열, 두 분 이상이면 summary null·부모님별 줄.
  function planCardModel(plan, detail, appFeature) {
    detail = detail || {};
    var hasAmount = detail.amount !== null && detail.amount !== undefined;
    var list = detail.lines || [];
    var single = list.length === 1;
    return {
      plan: plan,
      name: PLAN_NAMES[plan] || plan,
      priceText: hasAmount ? '월 ' + formatWon(detail.amount) : '준비 중',
      summary: single ? featureSegments(list[0].feature, appFeature, true) : null,
      lines: single ? [] : list.map(function (l) { return planLineSegments(l, appFeature); }),
      note: !hasAmount && detail.error === 'phone_extra_price_undecided' ? PHONE_EXTRA_PENDING : null,
      selectable: hasAmount,
    };
  }

  // 요금을 정할 수 없어(전화 방식 부모님 한 분 더 준비 중) 등록 대신 안내 화면을 보이는 가족에게도 구성은 보여 준다 —
  // 그 가족의 부모님 줄(없으면 null). 카드는 읽기 전용(선택 없음)으로 그린다.
  function readOnlyCompositionLines(s) {
    if (!s || s.amountError !== 'phone_extra_price_undecided') return null;
    return familyLines(s.planDetails);
  }

  // 참고용 전체 요금표(고를 수 없다) — 서버 priceTable을 방식별로 편다.
  function priceTableSections(table) {
    if (!table) return [];
    return ['app', 'phone'].filter(function (m) { return table[m]; }).map(function (m) {
      return {
        title: MODE_FAMILY[m],
        rows: PLAN_KEYS.filter(function (p) { return table[m][p]; }).map(function (p) {
          var r = table[m][p];
          return { name: PLAN_NAMES[p], feature: r.feature || '', price: '기본 ' + wonOrPending(r.base) + ' · 한 분 더 ' + wonOrPending(r.extra) };
        }),
      };
    });
  }

  // A-1 등록 버튼 문구 — 누르면 무엇이 일어나는지(얼마가 언제) 버튼에 적는다. 금액은 서버 값만 쓴다.
  function submitLabel(o) {
    o = o || {};
    var kind = o.chargeKind;
    if (kind === 'trial_end') {
      var monthly = (o.monthlyAmount !== null && o.monthlyAmount !== undefined) ? o.monthlyAmount : o.amount;
      return '무료 체험 후 월 ' + formatWon(monthly) + ' 자동결제 등록';
    }
    if (kind === 'overdue') return formatWon(o.amount) + ' 결제하고 다시 이용하기';
    if (kind === 'immediate') return formatWon(o.amount) + ' 결제하고 시작하기';
    if (kind === 'renewal' || kind === 'none' || kind === 'pause_end') return '결제수단 변경';
    return '결제수단 등록';
  }

  // 해지 화면의 한 달 쉬어가기 안내. kind: 'offer'(카드와 버튼) · 'limit'(한 줄 안내) · 'none'(숨김).
  function pauseOffer(p) {
    if (p && p.eligible && p.from && p.until) {
      return {
        kind: 'offer',
        text: '다음 결제일(' + formatKstDate(p.from) + ')부터 한 달 동안 결제와 안부전화를 쉬어요. ' +
          formatKstDate(p.until) + '에 자동으로 다시 시작되고, 3일 전과 1일 전에 알려 드려요. 1년에 2번까지 쓸 수 있어요.',
      };
    }
    if (p && !p.eligible && p.reason === 'pause_limit') return { kind: 'limit', text: '쉬어가기는 1년에 2번까지 쓸 수 있어요.' };
    return { kind: 'none', text: '' };
  }

  // 구독 관리의 쉬어가기 표시 — 예정이면 웹에서 취소할 수 있고, 쉬는 중이면 취소할 수 없다(고객센터 안내).
  function pauseManageText(pause, amount) {
    if (!pause || !pause.from || !pause.until) return null;
    if (pause.state === 'active') {
      var hasAmount = amount !== null && amount !== undefined && !isNaN(Number(amount));
      return {
        text: '쉬어가는 중이에요. ' + formatKstDate(pause.until) +
          (hasAmount ? '에 다시 시작하고 ' + formatWon(amount) + '이 결제돼요.' : '에 다시 시작해요.'),
        canCancel: false,
      };
    }
    return { text: '쉬어가기 예정: ' + formatKstDate(pause.from) + ' ~ ' + formatKstDate(pause.until) + ' · 그동안 결제와 안부전화가 쉬어요', canCancel: true };
  }

  // 해지 화면 ② — 해지해도 언제까지 쓰는지. 결제가 밀린 상태(past_due)는 바로 끝난다(기존 문구).
  function cancelKeepText(sub, now) {
    sub = sub || {};
    var b = sub.billing || {};
    var reports = ' 지금까지 받은 리포트는 해지 후에도 보호자 앱에서 볼 수 있어요.';
    if (sub.status === 'past_due') return '지금 바로 해지되고 안부전화가 중단돼요. 결제되지 않은 금액은 청구되지 않아요.';
    var pause = sub.pause || b.pause;
    // 쉬는 중 해지 — 결제한 기간은 이미 끝났으므로 바로 종료된다.
    if (pause && pause.state === 'active') return '해지하면 바로 종료돼요.' + reports;
    // 쉬어가기 예정 중 해지 — 서버가 예정을 함께 지운다(쓰지 않은 쉬어가기는 횟수에서 빠진다).
    var pauseNote = pause && pause.state === 'scheduled' ? ' 쉬어가기 예정도 함께 취소돼요.' : '';
    var until = sub.status === 'trial' ? sub.trialEndsAt : b.currentPeriodEnd;
    var nowMs = (now ? new Date(now) : new Date()).getTime();
    if (until && new Date(until).getTime() > nowMs) return '해지해도 ' + formatKstDate(until) + '까지 이용하실 수 있어요.' + pauseNote + reports;
    return '해지하면 더 이상 결제되지 않아요.' + pauseNote + reports;
  }

  // 해지 화면의 환불 안내 한 줄 — 결제된 요금은 환불하지 않는다(대표 9/18, 고객 요청 환불 없음).
  // 결제된 이번 달 요금이 없는 상태(체험 중 · 밀린 결제 · 쉬는 중)나 예전에 보낸 환불 요청이 처리 중이면 빈 문자열(숨김).
  function cancelRefundText(sub, payments) {
    sub = sub || {};
    var list = payments || [];
    if (list.some(function (p) { return p && p.refundRequest === 'open'; })) return '';
    var pause = sub.pause || (sub.billing && sub.billing.pause);
    if (sub.status !== 'active' || (pause && pause.state === 'active')) return '';
    return '이미 ' + NO_REFUND;
  }

  // 결제 내역 행의 환불 요청 상태 표시 — 셀프 환불 요청은 없앴지만(대표 9/18) 예전에 보낸 요청의 결과는 계속 보여 준다.
  function refundRequestLabel(p) {
    if (!p || !p.refundRequest) return null;
    if (p.refundRequest === 'open') return '환불 요청됨';
    if (p.refundResolution === 'refunded') return '환불 처리됨';
    if (p.refundResolution === 'rejected') return '환불 요청 반려 · 고객센터(' + CS_PHONE + ') 문의';
    return '환불 요청 처리됨';
  }

  // 결제 흐름 측정 요청 — 화이트리스트에 없는 이름은 보내지 않는다(null).
  function payEventRequest(apiBase, name) {
    if (PAY_EVENTS.indexOf(name) < 0) return null;
    // text/plain — CORS 사전 확인(OPTIONS) 없이 보낸다. 본문은 JSON 문자열 그대로다(서버가 text/plain을 받는다).
    return { url: apiBase + '/web/pay-events', body: JSON.stringify({ events: [{ name: name }] }), contentType: 'text/plain;charset=UTF-8' };
  }

  // 로그인(카카오·네이버) 또는 모바일 결제창에서 돌아와 페이지가 다시 열린 경우.
  function isReturnLoad(search) {
    return !!(parseOAuthReturn(search) || parsePortoneReturn(search));
  }

  function decideView(s) {
    var sub = (s && s.subscription) || {};
    var billing = sub.billing || {};
    if (!s.isOwner) return 'not_owner';
    if (sub.status === 'free') return 'free';
    if (billing.registered && sub.status !== 'expired') return 'manage';
    if (!s.billingEnabled) return 'billing_off';
    if (s.amount === null || s.amount === undefined) return 'amount_error';
    return 'register';
  }

  function decideErrorView(code) {
    return code === 'no_family' ? 'no_family' : null;
  }

  var PAUSE_UNAVAILABLE = '지금은 쉬어가기를 신청할 수 없어요.';
  var ERROR_MESSAGES = {
    consent_required: '자동결제 동의에 체크해 주세요.',
    payer_name: '결제하시는 분 이름을 적어 주세요.',
    payer_phone: '휴대폰 번호를 확인해 주세요(예: 010-1234-5678).',
    payer_email: '이메일 주소를 확인해 주세요.',
    owner_only: '결제는 대표 보호자만 할 수 있어요.',
    no_family: '방글이 앱에서 먼저 가입해 주세요.',
    billing_disabled: '결제 기능을 준비하고 있어요. 조금만 기다려 주세요.',
    portone_not_configured: '결제 기능을 준비하고 있어요. 조금만 기다려 주세요.',
    portone_error: '결제사 연결이 잠시 원활하지 않아요. 잠시 후 다시 시도해 주세요.',
    method_unavailable: '선택하신 결제수단은 지금 쓸 수 없어요. 다른 결제수단을 골라 주세요.',
    invalid_billing_key: '결제수단 등록을 확인하지 못했어요. 다시 시도해 주세요.',
    free_family: '무료로 이용 중인 가족이라 결제할 것이 없어요.',
    no_elder: '등록된 부모님이 없어요. 방글이 앱에서 부모님을 먼저 등록해 주세요.',
    phone_extra_price_undecided: PHONE_EXTRA_PENDING,
    nothing_to_cancel: '해지할 예정 결제가 없어요.',
    not_canceled: '해지 예약 상태가 아니에요.',
    period_ended: '이용 기간이 이미 끝나 해지를 취소할 수 없어요. 결제수단을 다시 등록해 주세요.',
    same_plan: '지금과 같은 요금제예요.',
    invalid_plan: '요금제를 다시 골라 주세요.',
    invalid_login: '이메일 또는 비밀번호가 맞지 않아요.',
    locked: '로그인 시도가 많았어요. 잠시 후 다시 시도해 주세요.',
    invalid_social_token: '로그인에 실패했어요. 다시 시도해 주세요.',
    account_link_required: '이 이메일은 다른 방법으로 가입돼 있어요. 가입하신 방법(이메일 등)으로 로그인해 주세요.',
    web_login_not_configured: '이 로그인 방법을 준비하고 있어요. 다른 방법으로 로그인해 주세요.',
    session_expired: '다시 로그인해 주세요.',
    unauthorized: '다시 로그인해 주세요.',
    oauth_state_mismatch: '로그인 확인에 실패했어요. 다시 시도해 주세요.',
    payment_window_failed: '결제수단 등록이 완료되지 않았어요. 다시 시도해 주세요.',
    not_active: PAUSE_UNAVAILABLE,
    canceled: PAUSE_UNAVAILABLE,
    no_billing: PAUSE_UNAVAILABLE,
    already_paused: PAUSE_UNAVAILABLE,
    not_scheduled: PAUSE_UNAVAILABLE,
    pause_limit: '쉬어가기는 1년에 2번까지 쓸 수 있어요.',
    pause_started: '이미 쉬어가는 중이라 취소할 수 없어요. 고객센터(' + CS_PHONE + ')로 연락해 주세요.',
    not_paused: '쉬어가기 예정이 없어요.',
    not_refundable: '환불 요청할 수 없는 결제예요. 서비스 장애 등은 고객센터(' + CS_PHONE + ')로 문의해 주세요.',
    invalid_reason: '해지 이유를 다시 확인해 주세요.',
    invalid_selection: '부모님 선택을 다시 확인해 주세요.',
    phone_mode_unavailable: '전화 방식은 아직 준비 중이에요. 앱으로 받기를 골라 주세요.',
    same_selection: '지금과 같은 방식·인원이에요.',
    plan_limit: '선택하신 요금제로는 부모님 통화 일정이 맞지 않아요. 더 넉넉한 요금제를 고르거나 앱에서 통화 일정을 바꿔 주세요.',
  };
  // period_ended는 해지 취소(resume)에서도 쓰는 코드라, 쉬어가기 요청에서 받은 경우에만 쉬어가기 문구로 바꾼다.
  var CONTEXT_MESSAGES = {
    pause: { period_ended: PAUSE_UNAVAILABLE },
  };

  function errorMessage(code, context) {
    var byContext = CONTEXT_MESSAGES[context];
    if (byContext && byContext[code]) return byContext[code];
    return ERROR_MESSAGES[code] || '잠시 후 다시 시도해 주세요. 계속 안 되면 고객센터(' + CS_PHONE + ')로 연락해 주세요.';
  }

  function paymentStatusLabel(status) {
    var labels = {
      scheduled: '결제 예정', paid: '결제 완료', failed: '결제 실패',
      cancelled: '환불 완료', partial_cancelled: '부분 환불', revoked: '예약 취소',
    };
    return labels[status] || status;
  }

  function makeOAuthState(provider, randomHex) {
    return provider + '.' + randomHex;
  }

  function parseOAuthReturn(search) {
    var q = new URLSearchParams(search || '');
    var state = q.get('state');
    if (!state || (!q.get('code') && !q.get('error'))) return null;
    var provider = state.split('.')[0];
    if (!OAUTH_PROVIDERS[provider]) return null;
    return { provider: provider, code: q.get('code'), state: state, error: q.get('error') };
  }

  function authorizeUrl(base, clientId, redirectUri, state) {
    var q = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: redirectUri, state: state });
    return base + '?' + q.toString();
  }

  function kakaoAuthorizeUrl(o) {
    return authorizeUrl('https://kauth.kakao.com/oauth/authorize', o.restKey, o.redirectUri, o.state);
  }

  function naverAuthorizeUrl(o) {
    return authorizeUrl('https://nid.naver.com/oauth2.0/authorize', o.clientId, o.redirectUri, o.state);
  }

  // 모바일에서는 포트원 결제창이 redirectUrl로 돌아온다. 우리 표식 pgReturn=1이 붙은 복귀만 처리한다.
  function parsePortoneReturn(search) {
    var q = new URLSearchParams(search || '');
    if (q.get('pgReturn') !== '1') return null;
    return { billingKey: q.get('billingKey'), code: q.get('code'), message: q.get('message') };
  }

  // 결제자 정보 — KG이니시스가 빌링키 발급에 이름·휴대폰·이메일을 필수로 요구한다(9/18 실연동에서 INVALID_REQUEST).
  // 입력값을 다듬어 포트원 SDK customer 형식으로 돌려준다. 틀리면 { ok:false, error: 오류 코드 }.
  function normalizePayer(input) {
    var i = input || {};
    var name = String(i.name || '').trim();
    var phone = String(i.phone || '').replace(/[\s-]/g, '');
    var email = String(i.email || '').trim();
    if (!name || name.length > 30) return { ok: false, error: 'payer_name' };
    if (!/^01[016789]\d{7,8}$/.test(phone)) return { ok: false, error: 'payer_phone' };
    if (email.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'payer_email' };
    return { ok: true, value: { fullName: name, phoneNumber: phone, email: email } };
  }

  // ── 단계 선택형 결제(대표 확정 v0.26, API 계약 9/19) — ① 이용 방식 → ② 몇 분·누구 → ③ 요금제.
  // selection = 구독할 부모님만 [{ elderId, mode: 'app'|'phone' }]. 화면의 요금제 금액은 /status의 priceTable로 계산한
  // "표시용"이고, 버튼·필수 고지·동의는 /checkout 응답 금액만 쓴다.
  // 단계 상태 st = { sharedMode, perParent, modes: { elderId: mode }, count, chosen: [elderId…] } — 불변으로 다룬다.
  var COUNT_WORDS = ['한', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉', '열'];
  var MODE_CHOICE = { app: '앱으로 받기', phone: '전화로 받기' };
  var PHONE_MODE_PENDING = '전화 방식 준비 중이에요';
  var UNPAIRED_NOTE = '부모님 휴대폰에 방글이 앱 설치가 필요해요 — 전화로 받기를 권해요';
  // 전화 방식을 쓸 수 없는 가족에게는 고를 수 없는 전화를 권하지 않는다.
  var UNPAIRED_NOTE_NO_PHONE = '부모님 휴대폰에 방글이 앱 설치가 필요해요';
  var EXCLUDED_NOTE = '선택하지 않은 부모님은 안부전화가 멈춰요. 기록은 그대로 남고, 언제든 다시 추가할 수 있어요.';
  var SAME_PRICE_HINT = '할머니·할아버지도 같은 요금이에요';
  var STEP_TEXT = {
    modeLegend: '이용 방식',
    perParentOpen: '부모님마다 다르게 할게요',
    perParentClose: '모두 같은 방식으로 할게요',
    countLegend: '몇 분께 전화 드릴까요?',
    planLegend: '요금제',
    vatNote: '금액은 모두 부가세 포함이에요.',
  };

  function countWord(n) { return COUNT_WORDS[n - 1] ? COUNT_WORDS[n - 1] + ' 분' : n + '분'; }
  function normMode(m) { return m === 'phone' ? 'phone' : 'app'; }
  function idOf(e) { return String(e && e.elderId); }

  // 부모님 이름표 — 호칭만("어머니"). 실명은 결제 화면에 쓰지 않는다(대표 9/19: 특정 이름 노출 금지).
  // 같은 호칭이 둘 이상이면 등록 순서로 번호를 붙인다("할머니 1"·"할머니 2"), 호칭이 없으면 "부모님 {순번}".
  // 사용자 입력 그대로다(가공하지 않는다) — 화면에는 textContent로만 넣는다.
  function elderLabel(e, index, list) {
    var t = e && e.title ? String(e.title).trim() : '';
    if (!t) return '부모님 ' + ((index || 0) + 1);
    var same = (list || []).filter(function (x) { return x && x.title && String(x.title).trim() === t; });
    if (same.length < 2) return t;
    return t + ' ' + (same.indexOf(e) + 1);
  }
  function labelById(elders, id) {
    var list = elders || [];
    for (var i = 0; i < list.length; i++) if (idOf(list[i]) === String(id)) return elderLabel(list[i], i, list);
    return '부모님';
  }

  // 새 서버(/status에 elders·priceTable)면 단계 화면, 아니면 옛 요금제 카드로 되돌아간다(화면이 깨지지 않게).
  function hasSteps(s) {
    return !!(s && Array.isArray(s.elders) && s.elders.length > 0 && s.priceTable && typeof s.priceTable === 'object');
  }

  // 기본값 — 서버의 청구 기준 selection(없으면 구독 안 함 표시가 없는 부모님, 그것도 없으면 전원)과 각자의 현재 방식.
  // 고른 분들의 방식이 모두 같으면 ①에 그 방식, 다르면 "부모님마다 다르게"를 펼친 상태.
  // 전화 방식을 쓸 수 없는 가족(phoneModeAvailable === false)은 고를 수 없는 값에 갇히지 않게 앱으로 둔다.
  function defaultStepState(elders, selection, phoneModeAvailable) {
    elders = elders || [];
    var ids = elders.map(idOf);
    var sel = (Array.isArray(selection) ? selection : []).filter(function (x) { return x && ids.indexOf(String(x.elderId)) >= 0; });
    var selMode = {};
    sel.forEach(function (x) { selMode[String(x.elderId)] = normMode(x.mode); });
    var modes = {};
    elders.forEach(function (e) {
      var id = idOf(e);
      var m = selMode[id] || normMode(e.mode);
      modes[id] = phoneModeAvailable === false ? 'app' : m;
    });
    var chosen;
    if (sel.length) chosen = ids.filter(function (id) { return selMode[id]; });
    else {
      chosen = elders.filter(function (e) { return !e.billingExcluded; }).map(idOf);
      if (!chosen.length) chosen = ids.slice();
    }
    var first = modes[chosen[0]] || 'app';
    var same = chosen.every(function (id) { return modes[id] === first; });
    return { sharedMode: first, perParent: !same, modes: modes, count: chosen.length, chosen: chosen };
  }

  function copyState(st) {
    var modes = {};
    Object.keys(st.modes || {}).forEach(function (k) { modes[k] = st.modes[k]; });
    return { sharedMode: st.sharedMode, perParent: !!st.perParent, modes: modes, count: st.count, chosen: (st.chosen || []).slice() };
  }
  function effectiveMode(st, id) { return st.perParent ? normMode(st.modes[String(id)]) : normMode(st.sharedMode); }

  // ① 방식 — 모두 같은 방식으로(부모님별 선택은 접는다).
  function stepsSetShared(st, mode) {
    var n = copyState(st);
    n.sharedMode = normMode(mode);
    n.perParent = false;
    Object.keys(n.modes).forEach(function (k) { n.modes[k] = n.sharedMode; });
    return n;
  }
  // "부모님마다 다르게" 펼치기/접기. 펼칠 때는 지금 보이는 방식 그대로 시작한다.
  // 접을 때는 고른 분 가운데 첫 분의 방식으로 모두 맞춘다.
  function stepsSetPerParent(st, open, elders) {
    var n = copyState(st);
    if (open) {
      if (!n.perParent) Object.keys(n.modes).forEach(function (k) { n.modes[k] = normMode(n.sharedMode); });
      n.perParent = true;
      return n;
    }
    var ids = n.chosen.length ? n.chosen : (elders || []).map(idOf);
    if (n.perParent && ids.length) n.sharedMode = normMode(n.modes[ids[0]]);
    return stepsSetShared(n, n.sharedMode);
  }
  function stepsSetElderMode(st, id, mode) {
    var n = copyState(st);
    n.modes[String(id)] = normMode(mode);
    return n;
  }
  // ② 몇 분 — 전원이면 모두 고른다. 줄이면 "누구"를 다시 고르게 비운다(이미 고른 분이 그 수 이하면 남긴다).
  function stepsSetCount(st, count, elders) {
    var n = copyState(st);
    var ids = (elders || []).map(idOf);
    var c = Math.max(1, Math.min(ids.length, Math.floor(Number(count)) || 1));
    n.count = c;
    if (c >= ids.length) n.chosen = ids.slice();
    else if (!(n.chosen.length <= c && n.chosen.length < ids.length)) n.chosen = [];
    return n;
  }
  // "누구" — 한 분이면 그 분만(라디오), 여러 분이면 켜고 끈다(체크박스). 순서는 등록 순서로 맞춘다.
  function stepsSetChosen(st, id, on, elders) {
    var n = copyState(st);
    var key = String(id);
    var set = n.count === 1 ? (on ? [key] : []) : n.chosen.filter(function (x) { return x !== key; }).concat(on ? [key] : []);
    n.chosen = (elders || []).map(idOf).filter(function (x) { return set.indexOf(x) >= 0; });
    return n;
  }

  // 단계 상태 → selection(등록 순서). 부모님 한 분뿐이면 ②가 없으므로 그 분이다.
  function stepSelection(st, elders) {
    var ids = (elders || []).map(idOf);
    var chosen = st.count >= ids.length ? ids : ids.filter(function (id) { return st.chosen.indexOf(id) >= 0; });
    return chosen.map(function (id) { return { elderId: id, mode: effectiveMode(st, id) }; });
  }

  // 등록 순서로 줄 세운 selection — 첫 분이 기본 요금, 나머지가 한 분 더(서버와 같은 규칙).
  function orderSelection(selection, elders) {
    var ids = (elders || []).map(idOf);
    return (selection || []).slice().sort(function (a, b) {
      var ia = ids.indexOf(String(a.elderId)), ib = ids.indexOf(String(b.elderId));
      return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib);
    });
  }

  // 표시용 월 합계 — priceTable[mode][plan]의 base(첫 분)·extra(나머지). 값이 하나라도 없으면 null(준비 중).
  function displayTotal(plan, selection, elders, table) {
    if (!table || !selection || !selection.length) return null;
    var list = orderSelection(selection, elders);
    var total = 0;
    for (var i = 0; i < list.length; i++) {
      var byMode = table[normMode(list[i].mode)];
      var row = byMode && byMode[plan];
      var v = row ? (i === 0 ? row.base : row.extra) : null;
      if (v === null || v === undefined || v === '' || isNaN(Number(v))) return null;
      total += Number(v);
    }
    return total;
  }
  function displayTotals(selection, elders, table) {
    var out = {};
    PLAN_KEYS.forEach(function (p) { out[p] = displayTotal(p, selection, elders, table); });
    return out;
  }

  // 부모님별 최소 요금제(서버 elders[i].requiredPlan[mode] — 앱에서 정한 통화 일정이 들어가는 가장 싼 요금제).
  // 그 요금제보다 낮은 요금제는 고를 수 없다. requiredPlan이 없으면(옛 서버)·null이면(일정 없음) 제한 없음.
  var PLAN_RANK = { lite: 0, standard: 1, plus: 2 };
  function planBlockers(plan, selection, elders) {
    var list = elders || [];
    var out = [];
    orderSelection(selection, list).forEach(function (x) {
      var i = -1;
      for (var k = 0; k < list.length; k++) if (idOf(list[k]) === String(x.elderId)) { i = k; break; }
      var e = list[i];
      var req = e && e.requiredPlan && e.requiredPlan[normMode(x.mode)];
      if (req && PLAN_RANK[req] !== undefined && PLAN_RANK[plan] !== undefined && PLAN_RANK[req] > PLAN_RANK[plan]) {
        out.push({ elderId: String(x.elderId), label: elderLabel(e, i, list), requiredPlan: req, mode: normMode(x.mode) });
      }
    });
    return out;
  }
  function planLimitNote(b) {
    return b.label + '의 통화 일정(앱에서 설정)에는 ' + (PLAN_NAMES[b.requiredPlan] || b.requiredPlan) + ' 이상이 필요해요';
  }
  function planValid(plan, selection, elders, table) {
    return PLAN_KEYS.indexOf(plan) >= 0 && displayTotal(plan, selection, elders, table) !== null && !planBlockers(plan, selection, elders).length;
  }
  // 조합이 바뀌어 지금 요금제를 고를 수 없게 되면 고를 수 있는 가장 싼 요금제로 조용히 옮긴다(없으면 그대로).
  function ensureValidPlan(plan, selection, elders, table) {
    if (planValid(plan, selection, elders, table)) return plan;
    for (var i = 0; i < PLAN_KEYS.length; i++) if (planValid(PLAN_KEYS[i], selection, elders, table)) return PLAN_KEYS[i];
    return plan;
  }

  // ③ 요금제 카드 — 지금 고른 조합의 월 합계 하나 + 방식별 포함 내용(전화는 같은 요금제의 앱과 다른 칸 굵게).
  // 두 방식이 섞였으면 "앱: …" "전화: …" 두 줄.
  function stepPlanCardModel(plan, selection, elders, table) {
    var total = displayTotal(plan, selection, elders, table);
    var used = ['app', 'phone'].filter(function (m) { return (selection || []).some(function (x) { return normMode(x.mode) === m; }); });
    var appFeature = table && table.app && table.app[plan] ? table.app[plan].feature : null;
    var features = used.map(function (m) {
      var row = table && table[m] && table[m][plan];
      var segs = featureSegments(row && row.feature, m === 'phone' ? appFeature : null, true);
      if (segs.length && used.length > 1) segs = [{ text: MODE_SHORT[m] + ': ', strong: false }].concat(segs);
      return segs;
    }).filter(function (segs) { return segs.length; });
    var hasPhone = used.indexOf('phone') >= 0;
    var blockers = planBlockers(plan, selection, elders);
    var note = null;
    if (total === null) note = hasPhone && (selection || []).length > 1 ? PHONE_EXTRA_PENDING : null;
    else if (blockers.length) note = blockers.map(planLimitNote).join(' ');
    return {
      plan: plan,
      name: PLAN_NAMES[plan] || plan,
      total: total,
      priceText: total === null ? '준비 중' : '월 ' + formatWon(total),
      features: features,
      note: note,
      selectable: total !== null && !blockers.length,
    };
  }

  // 필수 고지 1번째 줄·확인 문구의 조합 요약 — "전화 · 한 분", 섞이면 "앱 1분 · 전화 1분".
  function selectionSummary(selection) {
    var list = selection || [];
    if (!list.length) return null;
    var n = { app: 0, phone: 0 };
    list.forEach(function (x) { n[normMode(x.mode)]++; });
    if (n.app && n.phone) return '앱 ' + n.app + '분 · 전화 ' + n.phone + '분';
    return MODE_SHORT[n.phone ? 'phone' : 'app'] + ' · ' + countWord(list.length);
  }

  // 구독 관리의 "지금"·"다음 결제부터" 표시 — "할머니 (전화) · 할아버지 (앱)"(등록 순서).
  function selectionDescribe(selection, elders) {
    if (!selection || !selection.length) return '';
    return orderSelection(selection, elders).map(function (x) {
      return labelById(elders, x.elderId) + ' (' + MODE_SHORT[normMode(x.mode)] + ')';
    }).join(' · ');
  }

  function sameSelection(a, b) {
    a = a || []; b = b || [];
    if (a.length !== b.length) return false;
    var m = {};
    a.forEach(function (x) { m[String(x.elderId)] = normMode(x.mode); });
    return b.every(function (x) { return m[String(x.elderId)] === normMode(x.mode); });
  }

  // 앱 방식인데 부모님 앱이 연결 안 된(paired === false) 고른 부모님 — 막지 않고 옆에 권유만 붙인다.
  // phoneModeAvailable === false면 전화 권유는 빼고 설치 안내만.
  function unpairedNotes(st, elders, phoneModeAvailable) {
    var note = phoneModeAvailable === false ? UNPAIRED_NOTE_NO_PHONE : UNPAIRED_NOTE;
    var sel = stepSelection(st, elders);
    var out = [];
    (elders || []).forEach(function (e, i) {
      var x = sel.filter(function (s) { return s.elderId === idOf(e); })[0];
      if (x && x.mode === 'app' && e.paired === false) out.push({ elderId: idOf(e), label: elderLabel(e, i, elders), text: note });
    });
    return out;
  }

  // 검증 — 부모님 1분 이상, "누구"는 고른 수만큼, 전화를 못 쓰는 가족에 전화 없음, (등록이면) 고를 수 있는 요금제.
  // opts: { phoneModeAvailable, plan, priceTable, requirePlan }. 성공이면 selection을 함께 돌려준다.
  // plan이 주어지면(등록·구독 관리 모두) 부모님 통화 일정의 최소 요금제(requiredPlan)도 확인한다 → plan_limit.
  function validateSteps(st, elders, opts) {
    opts = opts || {};
    var ids = (elders || []).map(idOf);
    if (!ids.length) return { ok: false, error: 'no_elder', message: errorMessage('no_elder') };
    if (!st || st.count < 1) return { ok: false, error: 'who_required', message: '몇 분께 전화 드릴지 골라 주세요.' };
    if (st.count < ids.length && st.chosen.length !== st.count) {
      return { ok: false, error: 'who_required', message: st.count === 1 ? '어느 부모님께 전화 드릴지 골라 주세요.' : '부모님 ' + countWord(st.count) + '을 골라 주세요.' };
    }
    var selection = stepSelection(st, elders);
    if (!selection.length) return { ok: false, error: 'invalid_selection', message: errorMessage('invalid_selection') };
    if (opts.phoneModeAvailable === false && selection.some(function (x) { return x.mode === 'phone'; })) {
      return { ok: false, error: 'phone_mode_unavailable', message: errorMessage('phone_mode_unavailable') };
    }
    if (opts.requirePlan) {
      if (!opts.plan || PLAN_KEYS.indexOf(opts.plan) < 0 || displayTotal(opts.plan, selection, elders, opts.priceTable) === null) {
        return { ok: false, error: 'invalid_plan', message: errorMessage('invalid_plan') };
      }
    }
    if (opts.plan && planBlockers(opts.plan, selection, elders).length) {
      return { ok: false, error: 'plan_limit', message: errorMessage('plan_limit') };
    }
    return { ok: true, selection: selection };
  }

  function copySelection(selection) {
    return (selection || []).map(function (x) { return { elderId: String(x.elderId), mode: normMode(x.mode) }; });
  }
  // 요청 본문 — 단계 화면이 아니면(옛 서버·결제수단만 변경) plan·selection을 싣지 않는다(서버가 현재 값을 쓴다).
  function checkoutBody(method, plan, selection) {
    var body = { method: method };
    if (plan) body.plan = plan;
    if (selection && selection.length) body.selection = copySelection(selection);
    return body;
  }
  function billingKeyBody(billingKey, pending) {
    pending = pending || {};
    var body = { billingKey: billingKey, method: pending.method, consent: { autoPay: true, version: pending.consentVersion } };
    if (pending.plan) body.plan = pending.plan;
    if (pending.selection && pending.selection.length) body.selection = copySelection(pending.selection);
    return body;
  }
  function selectionBody(selection) { return { selection: copySelection(selection) }; }

  // /checkout 응답의 월 금액 — 부모님별 줄(lines) 합계, 줄이 없으면(옛 서버) 이번 청구액(amount).
  function checkoutMonthly(co) {
    if (!co) return null;
    var lines = co.lines;
    if (Array.isArray(lines) && lines.length && lines.every(function (l) { return l && l.amount !== null && l.amount !== undefined && !isNaN(Number(l.amount)); })) {
      return lines.reduce(function (a, l) { return a + Number(l.amount); }, 0);
    }
    return co.amount === undefined ? null : co.amount;
  }

  // 구독 관리에서 방식·인원을 바꾼 결과 안내.
  function selectionAppliedText(resp, fallbackNextIso) {
    if (resp && resp.appliesAt === 'now') return '바로 적용됐어요.';
    var next = (resp && resp.nextChargeAt) || fallbackNextIso;
    return next ? '다음 결제일(' + formatKstDate(next) + ')부터 적용돼요.' : '다음 결제일부터 적용돼요.';
  }
  // 바꾸기 전 확인 — 빠지는 부모님이 있으면 안부전화가 멈춘다는 안내를 붙인다.
  function selectionConfirmText(selection, elders) {
    var excluded = (elders || []).length > (selection || []).length;
    return selectionSummary(selection) + '으로 바꿀까요?' + (excluded ? ' ' + EXCLUDED_NOTE : '');
  }
  // 구독 관리의 예상 금액 한 줄(표시용).
  function selectionPriceHint(plan, total) {
    if (total === null || total === undefined) return '';
    return '바꾸면 ' + (PLAN_NAMES[plan] || plan) + ' 요금제 월 ' + formatWon(total) + '이에요(부가세 포함).';
  }

  return {
    COUNT_WORDS: COUNT_WORDS, MODE_CHOICE: MODE_CHOICE, MODE_SHORT: MODE_SHORT, PHONE_MODE_PENDING: PHONE_MODE_PENDING, UNPAIRED_NOTE: UNPAIRED_NOTE,
    UNPAIRED_NOTE_NO_PHONE: UNPAIRED_NOTE_NO_PHONE,
    EXCLUDED_NOTE: EXCLUDED_NOTE, SAME_PRICE_HINT: SAME_PRICE_HINT, STEP_TEXT: STEP_TEXT, PLAN_KEYS: PLAN_KEYS,
    countWord: countWord, elderLabel: elderLabel, hasSteps: hasSteps, defaultStepState: defaultStepState, effectiveMode: effectiveMode,
    stepsSetShared: stepsSetShared, stepsSetPerParent: stepsSetPerParent, stepsSetElderMode: stepsSetElderMode,
    stepsSetCount: stepsSetCount, stepsSetChosen: stepsSetChosen, stepSelection: stepSelection,
    displayTotal: displayTotal, displayTotals: displayTotals, stepPlanCardModel: stepPlanCardModel,
    selectionSummary: selectionSummary, selectionDescribe: selectionDescribe, sameSelection: sameSelection, unpairedNotes: unpairedNotes,
    validateSteps: validateSteps, checkoutBody: checkoutBody, billingKeyBody: billingKeyBody, selectionBody: selectionBody,
    checkoutMonthly: checkoutMonthly, selectionAppliedText: selectionAppliedText, selectionConfirmText: selectionConfirmText,
    selectionPriceHint: selectionPriceHint, planBlockers: planBlockers, planLimitNote: planLimitNote, ensureValidPlan: ensureValidPlan,
    normalizePayer: normalizePayer,
    BILLING_CONSENT_VERSION: BILLING_CONSENT_VERSION, PLAN_NAMES: PLAN_NAMES, METHOD_LABELS: METHOD_LABELS, CHARGE_KINDS: CHARGE_KINDS,
    formatWon: formatWon, formatKstDate: formatKstDate, kstDayOfMonth: kstDayOfMonth, doneChargeLine: doneChargeLine,
    noticeLines: noticeLines, decideView: decideView, decideErrorView: decideErrorView,
    errorMessage: errorMessage, paymentStatusLabel: paymentStatusLabel,
    makeOAuthState: makeOAuthState, parseOAuthReturn: parseOAuthReturn,
    kakaoAuthorizeUrl: kakaoAuthorizeUrl, naverAuthorizeUrl: naverAuthorizeUrl,
    parsePortoneReturn: parsePortoneReturn,
    CANCEL_REASONS: CANCEL_REASONS, PAY_EVENTS: PAY_EVENTS, ONCE_PER_TAB_EVENTS: ONCE_PER_TAB_EVENTS, CS_PHONE: CS_PHONE,
    isReturnLoad: isReturnLoad, refundRequestLabel: refundRequestLabel,
    submitLabel: submitLabel, pauseOffer: pauseOffer, pauseManageText: pauseManageText,
    planLineText: planLineText, featureSegments: featureSegments, modeSummary: modeSummary, familyModeChips: familyModeChips, familyLines: familyLines,
    planCardModel: planCardModel, priceTableSections: priceTableSections, readOnlyCompositionLines: readOnlyCompositionLines,
    cancelKeepText: cancelKeepText, cancelRefundText: cancelRefundText, payEventRequest: payEventRequest,
  };
});
