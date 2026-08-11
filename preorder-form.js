/**
 * AI방글이 사전예약(얼리버드 대기명단) 폼 제출 — 개발팀 소유 파일
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  디자인팀에게: 이 파일은 건드리지 않으셔도 됩니다.
 *  랜딩 페이지 HTML을 아무리 바꾸셔도, 아래 "약속" 네 가지만 지켜지면
 *  신청 접수는 계속 동작합니다.
 *
 *  1. 폼에 class="cta-form preorder" 를 준다 (여러 개 있어도 됩니다)
 *  2. 그 폼 안에 이메일 <input> 과 제출 <button> 이 하나씩 있다
 *  3. 폼의 부모 요소 안에 class="cta-done" 인 빈 박스가 있다 (완료 문구가 들어갑니다)
 *  4. 이 파일을 </body> 앞에서 <script src="preorder-form.js"></script> 로 부른다
 *
 *  선택 사항 — 얼리버드 순번 화면을 쓰실 때만:
 *    window.EB_QUEUE_ENABLED = true 로 두고 window.renderQueue(box) 를 정의하면
 *    완료 시 그 함수를 부릅니다. 없으면 그냥 문구만 표시합니다.
 *    class="cta-sub" 요소가 있으면 순번 화면에서 자동으로 숨깁니다.
 *
 *  오류 안내 박스는 이 파일이 직접 만들고 스타일까지 넣습니다.
 *  CSS에 의존하지 않으므로 스타일시트를 갈아엎으셔도 깨지지 않습니다.
 * ─────────────────────────────────────────────────────────────────────────
 *
 *  왜 파일을 나눴나: 랜딩 페이지 HTML은 디자인팀이 자주 갈아엎는다. 그때마다
 *  이 로직이 이전 버전 기준으로 되살아나 사라지는 일이 하루에 두 번 있었다.
 *  파일이 다르면 그 충돌이 구조적으로 생기지 않는다.
 */
(function () {
  'use strict';

  var WEB3FORMS_KEY = 'c5c9d5f4-bee8-483c-bf2a-6aa5a456805d';   // 사이트 공통 키 (cctv-ai.html과 동일)
  var PREORDER_ENDPOINT = 'https://script.google.com/macros/s/AKfycbwQWRzHSKbU6bct2VyqDizr8-euR3kwKQlTIU8XkOHShNzd7AIyre_8RoKc7vUwVPCl/exec';
  var CONTACT = 'kraft@krafte.net';

  var MSG_NEW   = '신청 완료! 출시 소식을 가장 먼저 보내드릴게요 😊';
  var MSG_DEDUP = '이미 신청하셨어요. 출시되면 가장 먼저 알려드릴게요 😊';

  function keyReady() {
    return typeof WEB3FORMS_KEY === 'string' && WEB3FORMS_KEY.length > 10;
  }

  /**
   * Apps Script: 명단 저장 + 신청자 환영 메일. 신청의 기록처는 여기다.
   *
   * 예전에는 mode:'no-cors'로 보냈다. 그러면 응답이 opaque가 되어 성공·중복·실패를
   * 하나도 구분할 수 없는데, 화면은 결과와 무관하게 "신청 완료!"를 띄웠다. 그래서
   * 메일이 오지 않아도 아무도 원인을 알 수 없었다. text/plain 본문은 프리플라이트
   * 없이 통과하므로 no-cors가 애초에 필요 없었다 — 일반 요청으로 보내면
   * {"ok":true} 또는 {"ok":true,"dedup":true}를 그대로 읽는다.
   */
  function savePreorder(email) {
    return fetch(PREORDER_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ email: email, source: 'landing' })
    }).then(function (r) { return r.json(); });
  }

  /** web3forms: 회사 실시간 알림. 명단은 Apps Script가 갖고 있으므로 이쪽 실패만으로
   *  신청을 실패로 보지는 않는다. */
  function notifyCompany(email, subject) {
    if (!keyReady()) return Promise.reject(new Error('no key'));
    return fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        access_key: WEB3FORMS_KEY, botcheck: '', subject: subject, email: email,
        message: 'AI방글이 얼리버드 대기명단 신청 / 이메일: ' + email
      })
    })
      .then(function (r) { return r.json(); })
      .then(function (res) { if (!res || !res.success) throw new Error('web3forms rejected'); return res; });
  }

  /** 오류 박스를 직접 만든다. 스타일시트에 기대지 않아 디자인 개편에 영향받지 않는다. */
  function makeErrorBox(after) {
    var el = document.createElement('div');
    el.setAttribute('role', 'alert');
    el.style.cssText = 'display:none;margin-top:10px;background:#fef2f2;color:#b91c1c;' +
      'font-size:.9rem;line-height:1.5;border-radius:12px;padding:12px 14px;text-align:center';
    after.parentNode.insertBefore(el, after.nextSibling);
    return el;
  }

  function wire(form) {
    var box = form.parentElement;
    var doneEl = box.querySelector('.cta-done');
    if (!doneEl) return;                       // 약속 3이 없으면 조용히 넘어간다
    var errEl = makeErrorBox(doneEl);

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var input = form.querySelector('input');
      var email = input ? input.value.trim() : '';
      if (!email) return;

      var subject = '[AI방글이 얼리버드] ' + email;
      var btn = form.querySelector('button');
      var orig = btn ? btn.textContent : '';

      // 얼리버드 순번 화면이 켜져 있으면 순번 카드를 그린다. 이미 신청한 주소여도
      // 자기 순번은 궁금한 정보이므로 같은 화면을 낸다.
      function reveal(msg) {
        form.style.display = 'none';
        errEl.style.display = 'none';
        if (window.EB_QUEUE_ENABLED && typeof window.renderQueue === 'function') {
          var sub = box.querySelector('.cta-sub');
          if (sub) sub.style.display = 'none';
          window.renderQueue(doneEl);
        } else {
          doneEl.textContent = msg;
          doneEl.style.display = 'block';
        }
      }

      // 실패했으면 완료로 표시하지 않는다. 예전 코드는 mailto로 페이지를 떠나보내면서
      // 완료 표시까지 했는데, 메일 앱이 없는 폰에서는 아무 일도 일어나지 않은 채
      // "신청 완료"만 남았다. 메일 링크는 사용자가 고르게 두고 자동 이동은 하지 않는다.
      function fail() {
        if (btn) { btn.disabled = false; btn.textContent = orig; }
        errEl.innerHTML = '지금 신청 접수가 되지 않고 있어요. 잠시 후 다시 시도해 주시거나 ' +
          '<a href="mailto:' + CONTACT + '?subject=' + encodeURIComponent(subject) +
          '" style="color:#b91c1c;font-weight:700">메일로 알려주세요</a>.';
        errEl.style.display = 'block';
      }

      if (btn) { btn.disabled = true; btn.textContent = '신청 중…'; }
      errEl.style.display = 'none';

      var company = notifyCompany(email, subject).then(function () { return true; }, function () { return false; });

      savePreorder(email).then(function (res) {
        if (!res || res.ok !== true) throw new Error('rejected');
        // 이미 명단에 있는 주소에는 환영 메일이 다시 나가지 않는다. 이것도 "완료"로만
        // 표시하면 "왜 메일이 안 오지"가 되풀이되므로 상태를 그대로 알린다.
        reveal(res.dedup ? MSG_DEDUP : MSG_NEW);
      }).catch(function () {
        // 명단 저장이 실패해도 회사 알림이 갔다면 신청은 접수된 것이다.
        company.then(function (ok) { if (ok) reveal(MSG_NEW); else fail(); });
      });
    });
  }

  function init() {
    var forms = document.querySelectorAll('form.cta-form.preorder');
    for (var i = 0; i < forms.length; i++) wire(forms[i]);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
