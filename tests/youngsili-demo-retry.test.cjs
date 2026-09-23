const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../ai-youngsili-landing.html'),'utf8');
const script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes("getElementById('heroCallForm')"));
function setup(){
 const element=(extra={})=>Object.assign({hidden:false,handlers:{},addEventListener(type,fn){this.handlers[type]=fn;},focus(){this.focused=true;}},extra);
 const scenario=element({value:'care'}),button=element({textContent:'3분 체험 전화 받기'});
 const form=element({querySelector:q=>q.includes('scenario')?scenario:button});
 const elements={heroCallForm:form,heroCallName:element({value:'테스트'}),heroCallPhone:element({value:'010-0000-0000'}),heroCallConsent:element({checked:true}),heroCallError:element({hidden:true}),heroCallSuccess:element({hidden:true}),heroCallSuccessMessage:element(),heroCallRetry:element({hidden:true})};
 const requests=[];
 vm.runInNewContext(script,{document:{getElementById:id=>elements[id]},fetch(url,options){return new Promise(resolve=>requests.push({payload:JSON.parse(options.body),resolve}));}});
 return {elements,form,scenario,button,requests,submit:()=>form.handlers.submit({preventDefault(){}}),retry:()=>elements.heroCallRetry.handlers.click()};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function respond(r,body,ok=true){r.requests.at(-1).resolve({ok,json:()=>Promise.resolve(body)});await flush();}
test('일상 안부 성공 후 날씨 안전과 건강 확인을 순서대로 재신청한다',async()=>{
 const r=setup();
 for(const scenario of ['care','weather','risk']){
  r.scenario.value=scenario;r.elements.heroCallConsent.checked=true;r.submit();
  assert.equal(r.requests.at(-1).payload.scenario,scenario);
  await respond(r,{accepted:true,called:true});
  assert.equal(r.form.hidden,true);assert.equal(r.elements.heroCallSuccess.hidden,false);
  assert.equal(r.elements.heroCallRetry.hidden,false);assert.equal(r.button.disabled,false);
  assert.match(r.elements.heroCallSuccessMessage.textContent,/010-0000-0000/);
  const count=r.requests.length;r.submit();assert.equal(r.requests.length,count);
  r.retry();assert.equal(r.requests.length,count);
  assert.equal(r.form.hidden,false);assert.equal(r.elements.heroCallSuccess.hidden,true);
  assert.equal(r.elements.heroCallRetry.hidden,true);assert.equal(r.scenario.focused,true);
  assert.equal(r.elements.heroCallName.value,'테스트');assert.equal(r.elements.heroCallPhone.value,'010-0000-0000');
  assert.equal(r.elements.heroCallConsent.checked,false);
  r.submit();assert.equal(r.requests.length,count);assert.equal(r.elements.heroCallError.hidden,false);
 }
 assert.equal(r.requests.length,3);
});
test('요청 중 중복 제출과 재시작을 차단한다',()=>{
 const r=setup();r.submit();r.submit();r.retry();
 assert.equal(r.requests.length,1);assert.equal(r.button.disabled,true);assert.equal(r.form.hidden,false);
});
test('재신청 실패 또는 미발신 응답은 오류를 표시하고 다시 제출할 수 있다',async()=>{
 for(const [body,ok] of [[{message:'잠시 후 다시 시도해 주세요.'},false],[{accepted:true,called:false},true]]){
  const r=setup();r.submit();await respond(r,{called:true});r.retry();
  r.elements.heroCallConsent.checked=true;r.scenario.value='weather';r.submit();await respond(r,body,ok);
  assert.equal(r.form.hidden,false);assert.equal(r.elements.heroCallError.hidden,false);
  assert.equal(r.button.disabled,false);assert.equal(r.button.textContent,'3분 체험 전화 받기');
  r.submit();assert.equal(r.requests.length,3);
 }
});
