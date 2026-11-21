const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const C = require('./pay-core');
test('legacy missing lease produces no exclusive promise', () => {
  for (const lease of [null, undefined, '', 12]) assert.equal(C.numberLeaseNotice(lease), '');
});
test('pending and blocked do not claim payment or allocation success or expose internal reason', () => {
  for (const state of ['pending_inventory', 'blocked']) {
    const text = C.numberLeaseNotice({state, number:'private-number', reason:'internal-reason'});
    assert.match(text, /다시 결제하지 마세요/);
    assert.doesNotMatch(text, /결제가 완료|배정되어|private-number|internal-reason/);
  }
});
test('held uses server date and keeps end-of-paid-service 60-day boundary', () => {
  const text = C.numberLeaseNotice({state:'held',holdUntil:'2027-01-30T00:00:00.000Z'});
  assert.match(text,/실제 이용 종료 후 60일/);
  assert.match(text,/발신은 중단/);
  assert.ok(text.includes(C.formatKstDate('2027-01-30T00:00:00.000Z')));
  assert.match(text,/같은 번호를 보장하지/);
  for (const holdUntil of [null, 0, '', 'bad', {}]) {
    assert.match(C.numberLeaseNotice({state:'held',holdUntil}),/종료일은 확인 중/);
  }
});
test('assigned keeps cancellation and pause separate from release; unknown does not promise allocation', () => {
  assert.match(C.numberLeaseNotice({state:'assigned'}),/해지 예약만으로 회수하지/);
  assert.match(C.numberLeaseNotice({state:'assigned'}),/일시정지 중에도/);
  for(const state of ['unassigned','available','quarantine','new-state'])
    assert.match(C.numberLeaseNotice({state}),/완료 여부는 확인 후/);
});
function fixture(api, view = 'done') {
  const parent = {};
  const notice = {parentNode:parent,textContent:'checking',hidden:false};
  let timeout;
  const context = {C,currentView:view,auth:{api},$:()=>parent,text:(el,value)=>{el.textContent=value;},setTimeout:fn=>{timeout=fn;return 1;},clearTimeout:()=>{}};
  vm.createContext(context);
  const source=fs.readFileSync(__dirname+'/pay-app.js','utf8');
  vm.runInContext(source.slice(source.indexOf('  function refreshDoneLease('),source.indexOf('  // ── 구독 관리')),context);
  return {context,notice,timeout:()=>timeout()};
}

test('expired registration shows held notice and clears it for legacy accounts without blocking checkout', () => {
  const elements = {};
  let refreshes = 0;
  const context = {C, state:{status:{isOwner:true,billingEnabled:true,amount:19900,subscription:{status:'expired'},outboundNumberLease:{state:'held',holdUntil:'2027-01-30T00:00:00.000Z'}},steps:{}},
    $:id => elements[id] || (elements[id]={setAttribute(){}}), text:(el,value)=>{el.textContent=value;},
    renderMethods(){},planChoices(){},show(){},track(){},refreshCheckout(){refreshes++;}};
  assert.equal(C.decideView(context.state.status),'register');
  vm.createContext(context);
  const source = fs.readFileSync(__dirname+'/pay-app.js','utf8');
  vm.runInContext(source.slice(source.indexOf('  function renderRegister('),source.indexOf('  function refreshCheckout(')),context);
  context.renderRegister(false);
  assert.match(elements['reg-number-lease'].textContent,/60일/);
  assert.equal(elements['reg-number-lease'].hidden,false);
  context.state.status.outboundNumberLease=null;
  context.renderRegister(false);
  assert.equal(elements['reg-number-lease'].hidden,true);
  assert.equal(elements['reg-number-lease'].textContent,'');
  assert.equal(refreshes,2);
});
test('completion refresh reads only billing status and handles pending/legacy responses',async()=>{
  for(const lease of [{state:'pending_inventory'},null]) {
    const f=fixture(async path=>{assert.equal(path,'/family/billing/status');return {status:200,data:{outboundNumberLease:lease}};});
    await f.context.refreshDoneLease(f.notice);
    assert.equal(f.notice.textContent,C.numberLeaseNotice(lease));
    assert.equal(f.notice.hidden,!lease);
  }
});
test('status failure preserves payment result context without suggesting payment retry',async()=>{
  const f=fixture(async()=>{throw Error('offline');});
  await f.context.refreshDoneLease(f.notice);
  assert.match(f.notice.textContent,/결제 결과는 위 안내/);
  assert.match(f.notice.textContent,/구독 관리에서 다시 확인/);
});
test('timeout rejects stale late results and detached views are not updated',async()=>{
  let resolve;
  const f=fixture(()=>new Promise(r=>{resolve=r;}));
  const pending=f.context.refreshDoneLease(f.notice); f.timeout();
  const timedOut=f.notice.textContent;
  resolve({status:200,data:{outboundNumberLease:{state:'assigned'}}}); await pending;
  assert.equal(f.notice.textContent,timedOut);
  const away=fixture(async()=>({status:200,data:{outboundNumberLease:{state:'blocked'}}}),'manage');
  await away.context.refreshDoneLease(away.notice);
  assert.equal(away.notice.textContent,'checking');
});
