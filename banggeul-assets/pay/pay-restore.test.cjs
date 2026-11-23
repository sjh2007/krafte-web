const {JSDOM}=require('jsdom');
const fs=require('fs'),assert=require('assert/strict');
const root=(process.env.PAY_TEST_ROOT || require('path').resolve(__dirname,'../..'))+'/';
const tick=()=>new Promise(r=>setTimeout(r,10));
async function setup(){
 const w=new JSDOM(fs.readFileSync(root+'banggeul-pay.html','utf8'),{url:'https://qa.example/banggeul-pay.html?appHandoff=fixture',runScripts:'outside-only'}).window;
 w.scrollTo=()=>{};w.routes=[];w.__navigate=u=>w.routes.push(u);
 const timer=w.setTimeout.bind(w);w.setTimeout=(fn,ms)=>ms===20000?(w.timeout=fn,999):timer(fn,ms);
 w.s={billingChannel:'play_kr',isOwner:true,billingEnabled:true,subscription:{status:'trial',billing:{}},amount:8900,plan:'standard',amounts:{lite:5900,standard:8900,plus:14900},methods:['CARD']};
 w.fetch=async url=>({ok:true,status:200,json:async()=>url.includes('/redeem')?{customToken:'fixture'}:url.includes('signInWithCustomToken')?{idToken:'guardian',refreshToken:'r',expiresIn:3600}:url.includes('/status')?w.s:url.includes('/eligibility')?(w.eligibility||{}):{}});
 w.PAY_CONFIG={publicCheckoutEnabled:false,apiBase:'https://api.test',firebaseApiKey:'fixture'};
 for(const f of ['pay-core','pay-auth','pay-toss','pay-app'])w.eval(fs.readFileSync(root+'banggeul-assets/pay/'+f+'.js','utf8').replaceAll('location.assign(','window.__navigate('));
 await tick();return w;
}
function result(w,status,id){w.dispatchEvent(new w.CustomEvent('banggeul-billing-restore-result',{detail:{status,requestId:id||new URL(w.routes.at(-1),'https://qa.example').searchParams.get('requestId')}}));}
const title=w=>w.document.getElementById('msg-title').textContent;
(async()=>{
 let n=0;
 for(const status of ['empty','pending','verification_failed','unknown']){
  const w=await setup();assert.match(w.routes[0],/reason=entry/);assert.equal(w.document.getElementById('reg-submit').disabled,true);
  result(w,status,'stale');await tick();assert.match(title(w),/확인하고/);
  result(w,status);await tick();assert.equal(w.document.getElementById('reg-submit').disabled,true);assert.ok(w.document.getElementById('play-support'));
  w.document.getElementById('msg-action').click();assert.match(w.routes.at(-1),/reason=manual/);const count=w.routes.length;
  w.document.getElementById('msg-action').click();assert.equal(w.routes.length,count);
  w.close();n++;
 }
 const a=await setup();result(a,'restored');await tick();assert.doesNotMatch(title(a),/^이용권을 확인했어요/);a.close();n++;
 const b=await setup();b.s.subscription={status:'active',billing:{registered:true}};result(b,'restored');await tick();assert.match(title(b),/기존 구독/);b.close();n++;
 for (const billing of [{},{registered:false}]) {
   const w=await setup();w.s.subscription={status:'active',provider:'google_play',billing};
   w.s.currentPlan='lite';w.s.amount=5900;w.s.payments=[{status:'paid',amount:5900,paidAt:'2026-11-19T09:57:05Z'}];
   result(w,'restored');await tick();
   assert.match(title(w),/기존 구독/);
   assert.equal(w.document.getElementById('view-register').hidden,true);
   assert.equal(w.document.getElementById('reg-submit').disabled,true);
   assert.match(w.document.getElementById('msg-plans').textContent,/5,900/);
   w.document.getElementById('msg-action').click();result(w,'restored');await tick();
   assert.match(title(w),/기존 구독/);assert.equal(w.document.getElementById('view-register').hidden,true);
   w.close();n++;
 }
 const c=await setup();c.timeout();assert.match(title(c),/결제 결과/);result(c,'restored');await tick();assert.match(title(c),/결제 결과/);c.close();n++;
 const d=await setup();d.sessionStorage.clear();result(d,'restored');await tick();assert.match(title(d),/확인하고/);d.close();n++;

 for (const change of [
   {}, {allowed:false}, {evidence:{owner:false,activeSubscription:false,pendingPayment:false,unresolvedPurchase:false}},
   {evidence:{owner:true,activeSubscription:true,pendingPayment:false,unresolvedPurchase:false}},
   {evidence:{owner:true,activeSubscription:false,pendingPayment:true,unresolvedPurchase:false}},
   {evidence:{owner:true,activeSubscription:false,pendingPayment:false,unresolvedPurchase:true}},
   {evidence:{}}, {checkedAt:'2000-01-01T00:00:00Z'}, {allowed:'true'}
 ]) {
   const w=await setup();
   w.eligibility={allowed:true,reason:'eligible',checkedAt:new Date().toISOString(),evidence:{owner:true,activeSubscription:false,pendingPayment:false,unresolvedPurchase:false},...change};
   result(w,'empty');await tick();await tick();
   assert.equal(w.document.getElementById('view-register').hidden,true);
   w.close();n++;
 }
 for (const mismatch of [false,true]) {
   const w=await setup();
   w.s.currentPlan='standard';w.s.subscription={status:mismatch?'trial':'active',billing:{registered:true,nextPaymentAt:'2026-12-13T00:00:00Z'}};
   w.s.payments=[{status:'paid',paidAt:'2026-11-13T00:00:00Z',amount:8900}];
   w.eligibility={allowed:false,reason:'active_subscription',checkedAt:new Date().toISOString(),evidence:{owner:true,activeSubscription:true,pendingPayment:true,unresolvedPurchase:false}};
   result(w,'empty');await tick();await tick();
   assert.equal(w.document.getElementById('reg-submit').disabled,true);
   assert.equal(w.document.getElementById('view-register').hidden,true);
   if (!mismatch) {
     assert.match(title(w),/기존 구독/);
     assert.match(w.document.getElementById('msg-plans').textContent,/스탠다드/);
     assert.match(w.document.getElementById('msg-plans').textContent,/8,900/);
     assert.equal(w.document.getElementById('msg-plans').querySelectorAll('button,input').length,0);
     w.document.getElementById('msg-action').click();
     assert.equal(w.document.getElementById('msg-plans').hidden,true);
   } else assert.doesNotMatch(title(w),/기존 구독/);
   w.close();n++;
 }
 for(const mismatch of [false,true]) {
  const w=await setup();w.s.subscription={status:mismatch?'active':'expired',billing:{}};
  w.s.payments=[{status:'paid',amount:5900,paidAt:'2026-11-19T09:36:57Z'}];
  w.eligibility={allowed:false,reason:'expired_purchase_history',checkedAt:new Date().toISOString(),evidence:{owner:true,activeSubscription:false,pendingPayment:false,unresolvedPurchase:false}};
  result(w,'empty');await tick();await tick();
  assert.equal(w.document.getElementById('reg-submit').disabled,true);assert.equal(w.document.getElementById('view-register').hidden,true);
  if(!mismatch){assert.match(title(w),/이용 기간이 끝난/);assert.match(w.document.getElementById('msg-plans').textContent,/5,900/);}
  else assert.doesNotMatch(title(w),/이용 기간이 끝난/);
  w.close();n++;
 }
 console.log('PASS '+n+' restore/eligibility state cases; no payment calls');
})().catch(e=>{console.error(e);process.exitCode=1});
