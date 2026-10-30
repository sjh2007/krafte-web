(function(global){
'use strict';
const stores={android:'https://play.google.com/store/apps/details?id=com.kraft.banggeul',ios:'https://apps.apple.com/kr/app/id6809143827'};
function platform(ua,platformName,touches){if(/Android/i.test(ua))return 'android';if(/iPhone|iPad|iPod/i.test(ua)||(platformName==='MacIntel'&&touches>1))return 'ios';return 'desktop'}
function destination(ua,platformName,touches){return stores[platform(ua,platformName,touches)]||''}
global.BanggeulInstall={platform,destination};
if(typeof document==='undefined')return;
const cta=document.querySelector('#wf-install'),dialog=document.querySelector('#wf-dialog'),kind=platform(navigator.userAgent,navigator.platform,navigator.maxTouchPoints),url=destination(navigator.userAgent,navigator.platform,navigator.maxTouchPoints);
if(url){cta.href=url;cta.removeAttribute('aria-haspopup')}else{cta.addEventListener('click',e=>{e.preventDefault();dialog.showModal()})}

})(typeof window==='undefined'?globalThis:window);