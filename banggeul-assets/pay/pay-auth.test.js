const test = require('node:test');
const assert = require('node:assert/strict');
const { createAuth, PayAuthError } = require('./pay-auth.js');

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
function reply(status, body) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}
const CONFIG = { apiBase: 'https://api.test', firebaseApiKey: 'fb-key', origin: 'https://www.krafte.net' };

function setup(responses, nowMs = 1_000_000) {
  const calls = [];
  const fetch = async (url, opts) => { calls.push({ url, opts }); return responses.shift(); };
  const storage = memoryStorage();
  let t = nowMs;
  const auth = createAuth({ fetch, storage, config: CONFIG, now: () => t });
  return { auth, calls, storage, advance: (ms) => { t += ms; } };
}

test('이메일 로그인 — Firebase REST, 세션 저장(만료 시각 계산)', async () => {
  const { auth, calls } = setup([reply(200, { idToken: 'id1', refreshToken: 'r1', expiresIn: '3600' })]);
  await auth.signInWithEmail('a@b.com', 'pw123456');
  assert.equal(calls[0].url, 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fb-key');
  assert.deepEqual(JSON.parse(calls[0].opts.body), { email: 'a@b.com', password: 'pw123456', returnSecureToken: true });
  assert.deepEqual(auth.getSession(), { idToken: 'id1', refreshToken: 'r1', expiresAt: 1_000_000 + 3600_000 });
});

test('이메일 로그인 실패 코드 → invalid_login / locked', async () => {
  const { auth } = setup([reply(400, { error: { message: 'INVALID_LOGIN_CREDENTIALS' } }), reply(400, { error: { message: 'TOO_MANY_ATTEMPTS_TRY_LATER : x' } })]);
  await assert.rejects(auth.signInWithEmail('a@b.com', 'x'), (e) => e instanceof PayAuthError && e.code === 'invalid_login');
  await assert.rejects(auth.signInWithEmail('a@b.com', 'x'), (e) => e.code === 'locked');
});

test('Google — ID 토큰을 signInWithIdp로(앱과 같은 방식)', async () => {
  const { auth, calls } = setup([reply(200, { idToken: 'id2', refreshToken: 'r2', expiresIn: '3600' })]);
  await auth.signInWithGoogleIdToken('google-jwt');
  assert.equal(calls[0].url, 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=fb-key');
  assert.deepEqual(JSON.parse(calls[0].opts.body), {
    postBody: 'id_token=google-jwt&providerId=google.com', requestUri: 'https://www.krafte.net', returnSecureToken: true, returnIdpCredential: true,
  });
  assert.equal(auth.getSession().idToken, 'id2');
});

test('카카오·네이버 — 서버 코드 교환 → 커스텀 토큰 로그인', async () => {
  const { auth, calls } = setup([
    reply(200, { customToken: 'ct', provider: 'kakao', emailLinked: true }),
    reply(200, { idToken: 'id3', refreshToken: 'r3', expiresIn: '3600' }),
  ]);
  await auth.signInWithWebCode({ provider: 'kakao', code: 'c1', state: 'kakao.s', redirectUri: 'https://www.krafte.net/banggeul-pay.html' });
  assert.equal(calls[0].url, 'https://api.test/auth/social/web-code');
  assert.deepEqual(JSON.parse(calls[0].opts.body), { provider: 'kakao', code: 'c1', state: 'kakao.s', redirectUri: 'https://www.krafte.net/banggeul-pay.html' });
  assert.equal(calls[1].url, 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fb-key');
  assert.deepEqual(JSON.parse(calls[1].opts.body), { token: 'ct', returnSecureToken: true });
  assert.equal(auth.getSession().idToken, 'id3');
});

test('서버 코드 교환 오류 코드를 그대로 PayAuthError로', async () => {
  const { auth } = setup([reply(503, { error: 'web_login_not_configured' })]);
  await assert.rejects(auth.signInWithWebCode({ provider: 'naver', code: 'c', state: 'naver.s', redirectUri: 'u' }), (e) => e.code === 'web_login_not_configured');
});

test('getIdToken — 만료 60초 전이면 갱신해 세션을 바꾼다', async () => {
  const { auth, calls, advance } = setup([
    reply(200, { idToken: 'id1', refreshToken: 'r1', expiresIn: '3600' }),
    reply(200, { id_token: 'id1b', refresh_token: 'r1b', expires_in: '3600' }),
  ]);
  await auth.signInWithEmail('a@b.com', 'pw');
  assert.equal(await auth.getIdToken(), 'id1');
  advance(3600_000 - 30_000);
  assert.equal(await auth.getIdToken(), 'id1b');
  assert.equal(calls[1].url, 'https://securetoken.googleapis.com/v1/token?key=fb-key');
  assert.equal(calls[1].opts.body, 'grant_type=refresh_token&refresh_token=r1');
  assert.equal(auth.getSession().refreshToken, 'r1b');
});

test('갱신 실패·세션 없음 → session_expired, 세션 삭제', async () => {
  const { auth, advance } = setup([reply(200, { idToken: 'id1', refreshToken: 'r1', expiresIn: '3600' }), reply(400, { error: { message: 'TOKEN_EXPIRED' } })]);
  await assert.rejects(auth.getIdToken(), (e) => e.code === 'session_expired');
  await auth.signInWithEmail('a@b.com', 'pw');
  advance(3600_000);
  await assert.rejects(auth.getIdToken(), (e) => e.code === 'session_expired');
  assert.equal(auth.getSession(), null);
});

test('api — Bearer 토큰·JSON, 상태와 본문을 돌려준다(오류여도 던지지 않음)', async () => {
  const { auth, calls } = setup([reply(200, { idToken: 'id1', refreshToken: 'r1', expiresIn: '3600' }), reply(403, { error: 'owner_only' })]);
  await auth.signInWithEmail('a@b.com', 'pw');
  const r = await auth.api('/family/billing/checkout', { method: 'POST', body: { method: 'CARD' } });
  assert.deepEqual(r, { status: 403, data: { error: 'owner_only' } });
  assert.equal(calls[1].url, 'https://api.test/family/billing/checkout');
  assert.equal(calls[1].opts.headers.Authorization, 'Bearer id1');
  assert.equal(calls[1].opts.headers['Content-Type'], 'application/json');
});

test('signOut — 세션 삭제', async () => {
  const { auth } = setup([reply(200, { idToken: 'id1', refreshToken: 'r1', expiresIn: '3600' })]);
  await auth.signInWithEmail('a@b.com', 'pw');
  auth.signOut();
  assert.equal(auth.getSession(), null);
});
