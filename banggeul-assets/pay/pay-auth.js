// 방글이 웹 결제 화면 로그인 — 앱과 같은 Firebase 계정(uid)으로 들어온다.
// 이메일·Google은 Firebase REST, 카카오·네이버는 서버가 인가 코드를 교환해 준 커스텀 토큰.
// 세션은 sessionStorage에만 둔다(탭을 닫으면 로그아웃 — 결제 화면이라 오래 남기지 않는다).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PayAuth = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SESSION_KEY = 'banggeulPaySession';
  var IDENTITY = 'https://identitytoolkit.googleapis.com/v1/accounts:';
  var SECURE_TOKEN = 'https://securetoken.googleapis.com/v1/token';
  var REFRESH_MARGIN_MS = 60 * 1000;

  function PayAuthError(code) {
    var e = new Error(code);
    e.name = 'PayAuthError';
    e.code = code;
    Object.setPrototypeOf(e, PayAuthError.prototype);
    return e;
  }
  PayAuthError.prototype = Object.create(Error.prototype);
  PayAuthError.prototype.constructor = PayAuthError;

  function firebaseErrorCode(body) {
    var msg = (body && body.error && body.error.message) || '';
    if (/TOO_MANY_ATTEMPTS/.test(msg)) return 'locked';
    if (/INVALID_LOGIN_CREDENTIALS|INVALID_PASSWORD|EMAIL_NOT_FOUND|USER_DISABLED|INVALID_EMAIL/.test(msg)) return 'invalid_login';
    return 'invalid_social_token';
  }

  function createAuth(deps) {
    var fetchFn = deps.fetch;
    var storage = deps.storage;
    var config = deps.config;
    var now = deps.now || function () { return Date.now(); };

    function readSession() {
      try { return JSON.parse(storage.getItem(SESSION_KEY) || 'null'); } catch (e) { return null; }
    }
    function writeSession(idToken, refreshToken, expiresInSec) {
      var s = { idToken: idToken, refreshToken: refreshToken, expiresAt: now() + Number(expiresInSec) * 1000 };
      storage.setItem(SESSION_KEY, JSON.stringify(s));
      return s;
    }
    function signOut() { storage.removeItem(SESSION_KEY); }

    function postJson(url, body) {
      return fetchFn(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then(function (res) { return res.json().catch(function () { return {}; }).then(function (data) { return { res: res, data: data }; }); });
    }

    function firebaseSignIn(method, body) {
      return postJson(IDENTITY + method + '?key=' + config.firebaseApiKey, body).then(function (r) {
        if (!r.res.ok) throw PayAuthError(firebaseErrorCode(r.data));
        // 200이어도 idToken이 없을 수 있다(예: needConfirmation — 이 이메일이 이미 다른 방법으로 가입돼 있음).
        if (!r.data.idToken) throw PayAuthError('account_link_required');
        writeSession(r.data.idToken, r.data.refreshToken, r.data.expiresIn);
      });
    }

    function signInWithEmail(email, password) {
      return firebaseSignIn('signInWithPassword', { email: email, password: password, returnSecureToken: true });
    }

    function signInWithGoogleIdToken(idToken) {
      return firebaseSignIn('signInWithIdp', {
        postBody: 'id_token=' + idToken + '&providerId=google.com',
        requestUri: config.origin, returnSecureToken: true, returnIdpCredential: true,
      });
    }

    // 우리 버튼(네이버·카카오와 같은 크기)에서 받은 Google 액세스 토큰으로 로그인한다(대표 9/21).
    // 구글이 그려 주는 버튼은 폭 400px·높이 40px로 고정이라 다른 간편 로그인과 크기를 맞출 수 없다.
    function signInWithGoogleAccessToken(accessToken) {
      return firebaseSignIn('signInWithIdp', {
        postBody: 'access_token=' + accessToken + '&providerId=google.com',
        requestUri: config.origin, returnSecureToken: true, returnIdpCredential: true,
      });
    }

    function signInWithWebCode(p) {
      return postJson(config.apiBase + '/auth/social/web-code', {
        provider: p.provider, code: p.code, state: p.state, redirectUri: p.redirectUri,
      }).then(function (r) {
        if (!r.res.ok || !r.data.customToken) throw PayAuthError((r.data && r.data.error) || 'invalid_social_token');
        return firebaseSignIn('signInWithCustomToken', { token: r.data.customToken, returnSecureToken: true });
      });
    }

    function getIdToken() {
      var s = readSession();
      if (!s) return Promise.reject(PayAuthError('session_expired'));
      if (s.expiresAt - now() > REFRESH_MARGIN_MS) return Promise.resolve(s.idToken);
      return fetchFn(SECURE_TOKEN + '?key=' + config.firebaseApiKey, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(s.refreshToken),
      }).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok || !data.id_token) { signOut(); throw PayAuthError('session_expired'); }
          return writeSession(data.id_token, data.refresh_token, data.expires_in).idToken;
        });
      });
    }

    function api(path, opts) {
      opts = opts || {};
      return getIdToken().then(function (token) {
        var headers = { Authorization: 'Bearer ' + token };
        if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
        return fetchFn(config.apiBase + path, {
          method: opts.method || 'GET', headers: headers,
          body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        });
      }).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) { return { status: res.status, data: data }; });
      });
    }

    return {
      getSession: readSession, signOut: signOut,
      signInWithEmail: signInWithEmail, signInWithGoogleIdToken: signInWithGoogleIdToken, signInWithGoogleAccessToken: signInWithGoogleAccessToken, signInWithWebCode: signInWithWebCode,
      getIdToken: getIdToken, api: api,
    };
  }

  return { createAuth: createAuth, PayAuthError: PayAuthError };
});
