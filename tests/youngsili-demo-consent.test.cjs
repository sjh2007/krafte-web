const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../ai-youngsili-landing.html'),'utf8');
const script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes("getElementById('heroCallForm')"));
function setup(checked){
 let submit,requests=0,payload;
 const input=value=>({value,addEventListener(){},focus(){this.focused=true;}});
 const consent={...input(''),checked};
 const error={hidden:true};
 const button={textContent:'3분 체험 전화 받기'};
 const form={addEventListener(type,fn){if(type==='submit')submit=fn;},querySelector(q){return q.includes('scenario')?{value:'weather'}:button;}};
 const elements={heroCallForm:form,heroCallName:input('테스트'),heroCallPhone:input('01000000000'),heroCallConsent:consent,heroCallError:error};
 vm.runInNewContext(script,{document:{getElementById:id=>elements[id]},fetch(url,options){requests++;payload=JSON.parse(options.body);return new Promise(()=>{});}});
 submit({preventDefault(){}});
 return {requests,consent,error,button,payload};
}
test('동의 체크박스는 필수이며 기본 미선택',()=>{
 const tag=html.match(/<input[^>]+id="heroCallConsent"[^>]*>/)[0];
 assert.match(tag,/required/);assert.doesNotMatch(tag,/checked/);
});
test('미동의 시 API 요청 차단 및 안내',()=>{const r=setup(false);assert.equal(r.requests,0);assert.equal(r.error.hidden,false);assert.equal(r.consent.focused,true);});
test('동의 후 신청 요청 허용',()=>{const r=setup(true);assert.equal(r.requests,1);assert.equal(r.button.disabled,true);});

test('동의 시 서버에 동의 여부와 고정 문구 버전 전달',()=>{const r=setup(true);assert.equal(r.payload.privacyConsent,true);assert.equal(r.payload.privacyConsentVersion,'2026-09-21-v1');});
