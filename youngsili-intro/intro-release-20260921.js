(() => {
const data=window.INTRO_DATA,viewer=document.getElementById('viewer'),pages=document.getElementById('pages'),nav=document.getElementById('thumbnails'),dialog=document.getElementById('video-dialog'),player=document.getElementById('demo-player');
let active=0,returnFocus=null;const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const pad=n=>String(n).padStart(2,'0');
function openVideo(src,title,trigger){returnFocus=trigger;document.querySelectorAll('.media-slot video').forEach(v=>v.pause());document.getElementById('video-title').textContent=title;player.src=src;dialog.showModal();player.play().catch(()=>{});}
data.forEach((d,i)=>{
 const b=document.createElement('button');b.className='thumb';b.type='button';b.setAttribute('aria-label',`${i+1}페이지 ${d.title}`);b.innerHTML=`<img src="${d.thumbnail || `assets/thumbs/${pad(d.sourcePage)}.webp`}" alt="" loading="lazy"><span>${pad(i+1)} ${d.title}</span>`;b.onclick=()=>go(i);nav.append(b);
 const section=document.createElement('section');section.className='page';section.id=`page-${i+1}`;section.setAttribute('aria-label',`${i+1}페이지 ${d.title}`);
 section.innerHTML=`<div class="slide"><img src="${d.image || `assets/pages/${pad(d.sourcePage)}.webp`}" alt="${d.title} 발표자료" loading="${i===0?'eager':'lazy'}" width="1600" height="900"></div><div class="page-info"><div><h2>${d.title}</h2><p>${d.summary}</p></div><span class="page-num">${pad(i+1)} / ${data.length}</span></div>`;
 const stage=section.querySelector('.slide');
 (d.media||[]).forEach((m,j)=>{
  const slot=document.createElement('button');slot.className='media-slot';slot.type='button';slot.style.cssText=`left:${m.x}%;top:${m.y}%;width:${m.w}%;height:${m.h}%`;slot.setAttribute('aria-label',`${d.title} 영상 ${j+1} 재생`);
  const poster=m.src.replace('.mp4','.jpg');
  slot.innerHTML=`<img src="${poster}" alt="" loading="lazy"><span class="play">▶ 영상 보기</span>`;
  slot.onclick=()=>openVideo(m.src,d.title,slot);stage.append(slot);
 });
 if(d.note){const n=document.createElement('p');n.className='page-note';n.textContent=d.note;section.append(n);}
 if(d.extras){const ex=document.createElement('div');ex.className='extras';d.extras.forEach(m=>{const b=document.createElement('button');b.textContent='▶ '+m.title;b.onclick=()=>openVideo(m.src,m.title,b);ex.append(b)});section.append(ex);}
 pages.append(section);
});
function setActive(i){active=i;const count=`${pad(i+1)} / ${data.length}`;document.getElementById('counter').textContent=count;document.getElementById('current').textContent=count;[...nav.children].forEach((b,j)=>{if(j===i)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});document.getElementById('prev').disabled=i===0;document.getElementById('next').disabled=i===data.length-1;history.replaceState(null,'',`#page-${i+1}`);const b=nav.children[i];if(innerWidth>680){nav.scrollTo({top:b.offsetTop-nav.offsetTop-nav.clientHeight/2+b.clientHeight/2,behavior:reduced.matches?'instant':'smooth'})}else{nav.scrollTo({left:b.offsetLeft-nav.clientWidth/2+b.clientWidth/2,behavior:reduced.matches?'instant':'smooth'})}}
function go(i){i=Math.max(0,Math.min(data.length-1,i));pages.children[i].scrollIntoView({behavior:reduced.matches?'instant':'smooth',block:'start'});setActive(i)}
let frame;viewer.addEventListener('scroll',()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{const top=viewer.getBoundingClientRect().top+Math.min(viewer.clientHeight*.3,170);let best=0,dist=Infinity;[...pages.children].forEach((p,i)=>{const r=p.getBoundingClientRect();const d=r.top<=top&&r.bottom>=top?0:Math.abs(r.top-top);if(d<dist){dist=d;best=i}});if(best!==active)setActive(best)})},{passive:true});
const observer=new IntersectionObserver(entries=>entries.forEach(e=>{e.target.querySelectorAll('.media-slot video').forEach(v=>{if(e.isIntersecting&&!reduced.matches&&!document.hidden&&!dialog.open){if(!v.src)v.src=v.dataset.src;v.play().catch(()=>{})}else v.pause()})}),{root:viewer,threshold:.4});[...pages.children].forEach(p=>observer.observe(p));
document.getElementById('prev').onclick=()=>go(active-1);document.getElementById('next').onclick=()=>go(active+1);
document.addEventListener('keydown',e=>{if(dialog.open||/INPUT|TEXTAREA/.test(e.target.tagName)||e.altKey||e.ctrlKey||e.metaKey)return;if(['ArrowRight','PageDown'].includes(e.key)){e.preventDefault();go(active+1)}if(['ArrowLeft','PageUp'].includes(e.key)){e.preventDefault();go(active-1)}if(e.key==='Home'){e.preventDefault();go(0)}if(e.key==='End'){e.preventDefault();go(data.length-1)}});
document.getElementById('close-video').onclick=()=>dialog.close();dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});dialog.addEventListener('close',()=>{player.pause();player.removeAttribute('src');player.load();returnFocus?.focus()});
document.addEventListener('visibilitychange',()=>{if(document.hidden){player.pause();document.querySelectorAll('.media-slot video').forEach(v=>v.pause())}});reduced.addEventListener('change',()=>{if(reduced.matches)document.querySelectorAll('.media-slot video').forEach(v=>v.pause())});
const full=document.getElementById('fullscreen');full.onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()}catch{full.textContent='전체화면 미지원'}};document.addEventListener('fullscreenchange',()=>{full.textContent=document.fullscreenElement?'전체화면 종료':'전체화면'});
const start=/^#page-(\d+)$/.exec(location.hash);setActive(start?Math.min(data.length-1,Math.max(0,Number(start[1])-1)):0);if(start)requestAnimationFrame(()=>go(active));
})();
