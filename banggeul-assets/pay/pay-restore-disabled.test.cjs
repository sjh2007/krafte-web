const {JSDOM}=require('jsdom');
const fs=require('fs'),assert=require('assert/strict');
const root=(process.env.PAY_TEST_ROOT || require('path').resolve(__dirname,'../..'))+'/';
console.log('TEST_ROOT='+root);
console.log('PAY_APP_SHA256='+require('crypto').createHash('sha256').update(fs.readFileSync(root+'banggeul-assets/pay/pay-app.js')).digest('hex'));
const tick=()=>new Promise(r=>setTimeout(r,10));
async function setup(channel='play_kr'){
 const w=new JSDOM(fs.readFileSync(root+'banggeul-pay.html','utf8'),{url:'https://qa.example/banggeul-pay.html?appHandoff=fixture',runScripts:'outside-only'}).window;
 w.scrollTo=()=>{};w.routes=[];w.__navigate=u=>w.routes.push(u);
 const timer=w.setTimeout.bind(w);w.setTimeout=(fn,ms)=>ms===20000?(w.timeout=fn,999):timer(fn,ms);
 w.s={billingChannel:channel,isOwner:true,billingEnabled:false,subscription:{status:'trial',billing:{}},amount:8900,plan:'standard',amounts:{lite:5900,standard:8900,plus:14900},methods:['CARD']};
 w.fetch=async url=>({ok:true,status:200,json:async()=>url.includes('/redeem')?{customToken:'fixture'}:url.includes('signInWithCustomToken')?{idToken:'guardian',refreshToken:'r',expiresIn:3600}:url.includes('/status')?w.s:url.includes('/eligibility')?(w.eligibility||{}):{}});
 w.PAY_CONFIG={publicCheckoutEnabled:false,apiBase:'https://api.test',firebaseApiKey:'fixture'};
 for(const f of ['pay-core','pay-auth','pay-toss','pay-app'])w.eval(fs.readFileSync(root+'banggeul-assets/pay/'+f+'.js','utf8').replaceAll('location.assign(','window.__navigate('));
 await tick();return w;
}
function result(w,status,id){w.dispatchEvent(new w.CustomEvent('banggeul-billing-restore-result',{detail:{status,requestId:id||new URL(w.routes.at(-1),'https://qa.example').searchParams.get('requestId')}}));}
const title=w=>w.document.getElementById('msg-title').textContent;

(async()=>{let n=0;
for(const phase of ['restored','empty','verification_failed','pending']){
 const w=await setup();assert.match(w.routes[0],/android-billing\/restore/);
 if(phase==='restored')w.s.subscription={status:'active',provider:'google_play',billing:{}};
 w.eligibility={allowed:true,checkedAt:new Date().toISOString(),evidence:{owner:true,activeSubscription:false,pendingPayment:false,unresolvedPurchase:false}};
 result(w,phase);await tick();await tick();
 assert.equal(w.document.getElementById('view-register').hidden,true);
 assert.equal(w.document.getElementById('reg-submit').disabled,true);
 if(phase==='restored')assert.match(title(w),/기존 구독/);
 if(phase==='empty')assert.match(title(w),/복원할 Google Play 구매가 없어요/);
 assert.ok(w.routes.every(u=>u.includes('/android-billing/restore')));
 w.close();n++;
}
for(const valid of [true,false]){
 const w=await setup();w.eligibility={allowed:false,reason:'billing_disabled',checkedAt:valid?new Date().toISOString():'2000-01-01T00:00:00Z',evidence:{owner:true}};
 result(w,'empty');await tick();await tick();
 if(valid)assert.match(title(w),/복원할 Google Play 구매가 없어요/);else assert.match(title(w),/결제 결과/);
 assert.equal(w.document.getElementById('view-register').hidden,true);assert.equal(w.document.getElementById('reg-submit').disabled,true);
 w.close();n++;
}
for(const change of [{evidence:{owner:false}},{reason:'other'}]){
 const w=await setup();w.eligibility={allowed:false,reason:'billing_disabled',checkedAt:new Date().toISOString(),evidence:{owner:true},...change};
 result(w,'empty');await tick();await tick();assert.doesNotMatch(title(w),/복원할 Google Play 구매가 없어요/);w.close();n++;
}
for(const state of ['trial','expired']){
 const w=await setup();w.s.subscription={status:state,trialEndsAt:'2026-12-09T09:45:49.934Z',billing:{}};
 w.eligibility={allowed:false,reason:'billing_disabled',checkedAt:new Date().toISOString(),evidence:{owner:true}};
 result(w,'empty');await tick();await tick();
 assert.equal(w.document.getElementById('msg-body').textContent.includes('무료 체험 종료일: 12월 9일'),state==='trial');
 w.close();n++;
}
const w=await setup('web');assert.equal(w.routes.length,0);assert.match(title(w),/결제 기능을 준비/);w.close();n++;
console.log('PASS '+n+' disabled-new-payment restore cases: native restore retained only for Play channel; empty/eligible cannot register; no purchase route');
})().catch(e=>{console.error(e);process.exitCode=1});
