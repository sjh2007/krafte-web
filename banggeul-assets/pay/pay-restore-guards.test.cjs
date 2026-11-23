const {JSDOM}=require('jsdom');
const fs=require('fs'),assert=require('assert/strict');
const root=(process.env.PAY_TEST_ROOT || require('path').resolve(__dirname,'../..'))+'/';
const tick=()=>new Promise(r=>setTimeout(r,10));
async function setup(overrides={}){
 const w=new JSDOM(fs.readFileSync(root+'banggeul-pay.html','utf8'),{url:'https://qa.example/banggeul-pay.html?appHandoff=fixture',runScripts:'outside-only'}).window;
 w.scrollTo=()=>{};w.routes=[];w.__navigate=u=>w.routes.push(u);
 const timer=w.setTimeout.bind(w);w.setTimeout=(fn,ms)=>ms===20000?(w.timeout=fn,999):timer(fn,ms);
 w.s={billingChannel:'play_kr',isOwner:true,billingEnabled:true,subscription:{status:'trial',billing:{}},amount:8900,plan:'standard',amounts:{lite:5900,standard:8900,plus:14900},methods:['CARD']};
 Object.assign(w.s,overrides); w.calls=[];
 w.fetch=async url=>(w.calls.push(url),({ok:true,status:200,json:async()=>url.includes('/redeem')?{customToken:'fixture'}:url.includes('signInWithCustomToken')?{idToken:'guardian',refreshToken:'r',expiresIn:3600}:url.includes('/status')?w.s:url.includes('/eligibility')?(w.eligibility||{}):{}}));
 w.PAY_CONFIG={publicCheckoutEnabled:false,apiBase:'https://api.test',firebaseApiKey:'fixture'};
 for(const f of ['pay-core','pay-auth','pay-toss','pay-app'])w.eval(fs.readFileSync(root+'banggeul-assets/pay/'+f+'.js','utf8').replaceAll('location.assign(','window.__navigate('));
 await tick();return w;
}
function result(w,status,id){w.dispatchEvent(new w.CustomEvent('banggeul-billing-restore-result',{detail:{status,requestId:id||new URL(w.routes.at(-1),'https://qa.example').searchParams.get('requestId')}}));}
const title=w=>w.document.getElementById('msg-title').textContent;

(async()=>{let n=0;
for(const overrides of [{isOwner:false},{billingChannel:'web'}]){
 const w=await setup(overrides); assert.equal(w.routes.length,0);assert.equal(w.document.getElementById('view-register').hidden,true);w.close();n++;
}
const w=await setup();w.eligibility={allowed:false,reason:'billing_disabled',checkedAt:new Date().toISOString(),evidence:{owner:true}};w.s.billingEnabled=false;
const before=w.calls.filter(x=>x.includes('/status')).length;
result(w,'empty');result(w,'empty');await tick();await tick();
assert.equal(w.calls.filter(x=>x.includes('/status')).length-before,1);assert.equal(w.calls.filter(x=>x.includes('/eligibility')).length,1);
assert.ok(w.calls.every(x=>!x.includes('/checkout')&&!x.includes('/billing-key')&&!x.includes('/prepare')));w.close();n++;
const a=await setup();a.s.isOwner=false;result(a,'restored');await tick();assert.match(title(a),/결제 결과/);a.close();n++;
const b=await setup();b.fetch=()=>Promise.reject(Error('offline'));result(b,'empty');await tick();assert.match(title(b),/결제 결과/);b.close();n++;
const c=await setup();c.document.getElementById('logout').click();result(c,'restored');await tick();assert.equal(c.document.getElementById('view-login').hidden,false);c.close();n++;
console.log('PASS '+n+' owner/channel/duplicate/error/logout guard cases');
})().catch(e=>{console.error(e);process.exitCode=1});
