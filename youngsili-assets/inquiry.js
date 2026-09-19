/* Existing Web3Forms key configured for the site's kraft@krafte.net inbox.
   Web3Forms binds the destination to this public form key, not a client-side `to` field. */
(function () {
  'use strict';
  var ACCESS_KEY = 'c5c9d5f4-bee8-483c-bf2a-6aa5a456805d';
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function bind(form, detailed) {
    if (!form) return;
    var busy = false;
    var button = form.querySelector('button[type="submit"]') || form.querySelector('button');
    var originalLabel = button.textContent;
    var status = document.createElement('p');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.style.cssText = 'margin:12px 0;color:#ffb9bd;font-size:14px;line-height:1.6';
    form.insertAdjacentElement('afterend', status);
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      if (busy) return;
      if (!form.reportValidity()) return;
      var value = function (name) { var el = form.elements[name]; return el ? el.value.trim() : ''; };
      var email = detailed ? value('email') : form.querySelector('input[type="email"]').value.trim();
      if (!EMAIL_RE.test(email)) { status.textContent = '이메일 주소를 확인해 주세요.'; return; }
      var data = { access_key: ACCESS_KEY, botcheck: false, email: email, replyto: email, from_name: 'AI 영실이 홈페이지' };
      if (detailed) {
        var d = { type: value('type'), name: value('name'), org: value('org'), phone: value('phone'), message: value('message') };
        if (!d.type || !d.name || !d.org || !d.phone || !d.message) { status.textContent = '필수 항목을 입력해 주세요.'; return; }
        data.subject = '[AI 영실이 도입 문의] ' + d.org + ' / ' + d.name;
        data.name = d.name;
        data.organization = d.org;
        data.phone = d.phone;
        data.inquiry_type = d.type;
        data.message = '문의 유형: ' + d.type + '\n이름: ' + d.name + '\n소속·기관: ' + d.org + '\n연락처: ' + d.phone + '\n이메일: ' + email + '\n\n[문의 내용]\n' + d.message;
      } else {
        data.subject = '[AI 영실이] 도입 상담 신청';
        data.message = '홈페이지에서 도입 상담을 신청했습니다.\n신청자 이메일: ' + email;
      }
      busy = true;
      button.disabled = true;
      button.textContent = '전송 중…';
      status.textContent = '';
      form.setAttribute('aria-busy', 'true');
      var controller = new AbortController();
      var timer = setTimeout(function () { controller.abort(); }, 20000);
      try {
        var response = await fetch('https://api.web3forms.com/submit', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(data), signal: controller.signal
        });
        var result = await response.json();
        if (!response.ok || result.success !== true) throw new Error('Submission failed');
        if (detailed) {
          form.style.display = 'none';
          var success = document.getElementById('okBox');
          success.classList.add('show');
          success.setAttribute('tabindex', '-1');
          success.focus();
        } else {
          form.innerHTML = '<div class="hero-form-ok" role="status">✓ 상담 신청이 접수되었습니다. 곧 연락드릴게요!</div>';
        }
      } catch (error) {
        status.textContent = '문의가 전송되지 않았습니다. 입력 내용은 유지됩니다. 잠시 후 다시 시도하거나 kraft@krafte.net으로 직접 메일을 보내 주세요.';
      } finally {
        clearTimeout(timer);
        busy = false;
        button.disabled = false;
        button.textContent = originalLabel;
        form.removeAttribute('aria-busy');
      }
    });
  }
  bind(document.getElementById('heroForm'), false);
  bind(document.getElementById('inquiryForm'), true);
})();
