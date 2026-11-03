const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/pay-app.js','utf8');
const functions=source.slice(source.indexOf('  function validPlanAmount('),source.indexOf('  function updatePlanChangeButton('));
const ctx={C:{PLAN_NAMES:{lite:'라이트',standard:'스탠다드',plus:'플러스'}}};vm.createContext(ctx);vm.runInContext(functions,ctx);
const make=()=>({isOwner:true,currentPlan:'lite',amounts:{lite:8900,standard:14900,plus:24900},subscription:{billing:{}}});
test('missing/null/non-finite/negative prices block; valid zero stays valid',()=>{for(const x of [undefined,null,NaN,Infinity,-1,'14900']){const s=make();s.amounts.standard=x;assert.equal(ctx.planChangeView(s,'standard',false).disabled,true);}const s=make();s.amounts.standard=0;assert.equal(ctx.planChangeView(s,'standard',false).disabled,false);});
test('current and pending plan blocked, other selection allowed',()=>{const s=make();assert.equal(ctx.planChangeView(s,'lite',false).disabled,true);s.subscription.billing.pendingPlan='standard';assert.equal(ctx.planChangeView(s,'standard',false).disabled,true);assert.equal(ctx.planChangeView(s,'lite',false).disabled,false);});
test('non-owner and schedule disabled cannot submit',()=>{const s=make();assert.equal(ctx.planChangeView(s,'standard',true).disabled,true);s.isOwner=false;assert.equal(ctx.planChangeView(s,'standard',false).disabled,true);});
test('eligible CTA identifies selected plan',()=>assert.equal(ctx.planChangeView(make(),'standard',false).label,'스탠다드로 변경하기'));
