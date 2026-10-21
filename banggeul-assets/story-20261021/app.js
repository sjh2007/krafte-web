const lines=[
['방글이','어머니 안녕하세요. 저 방글이에요. 오늘 점심은 드셨어요?','ff1fa27863815127'],
['어머니','그럼 친구들 만나서 국수 사 먹었지. 오랜만에 만나니 좋더라.','92759bdeb6f61bee'],
['방글이','오랜만에 친구분들을 만나셨군요. 국수는 맛있게 드셨어요?','566d3b5fa04b3216'],
['어머니','따뜻하니 맛있었어. 친구들이랑 이야기도 한참 했지.','3d3b7b940bfcdb69'],
['방글이','즐거운 시간 보내셨네요. 저녁에는 어떤 걸 드실 생각이세요?','0e1f7cbae6d37985'],
['어머니','집에 있는 밥하고 된장국 데워 먹으려고. 반찬도 좀 있고.','237a3743c05af4a1'],
['방글이','친구분들과 즐겁게 식사하셨군요. 저녁도 잘 챙겨 드시고 편안한 하루 보내세요.','2a3964660b775365'],
['어머니','그래 전화해 줘서 고마워.','3e2a63dba8108713']];
const audio=new Audio();let line=0;
const play=document.querySelector('#play'), status=document.querySelector('#audio-status');
function showLine(){document.querySelector('#transcript').textContent=lines[line][1];status.textContent=lines[line][0]+' · '+(line+1)+' / '+lines.length;}
async function resume(){try{await audio.play();play.textContent='Ⅱ 일시정지'}catch{status.textContent='음성을 불러오지 못했어요. 다시 눌러 주세요.';play.textContent='▶ 대화 듣기'}}
function start(){showLine();audio.src='banggeul-assets/story-20261021/assets/audio/spoken-'+lines[line][2]+'.wav';resume()}
play.addEventListener('click',()=>{if(!audio.paused){audio.pause();play.textContent='▶ 이어 듣기'}else if(audio.getAttribute('src')){resume()}else start()});
audio.addEventListener('ended',()=>{if(line<lines.length-1){line++;start()}else{line=0;audio.removeAttribute('src');play.textContent='▶ 다시 듣기';status.textContent='대화가 끝났어요.'}});
document.querySelector('#reset').addEventListener('click',()=>{audio.pause();audio.removeAttribute('src');line=0;showLine();play.textContent='▶ 대화 듣기'});
const carousel=document.querySelector('.app-carousel');
const slides=[...carousel.querySelectorAll('.app-slide')];
const dots=[...carousel.querySelectorAll('[data-slide]')];
const carouselToggle=carousel.querySelector('.carousel-toggle');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const captions=['돌봄 리포트','통화 기록','안부 부탁'];
let activeSlide=0, carouselPaused=reduced.matches, carouselTimer=null;
function showSlide(next){
 activeSlide=next;
 slides.forEach((s,i)=>{s.classList.toggle('is-active',i===next);s.setAttribute('aria-hidden',String(i!==next))});
 dots.forEach((d,i)=>d.setAttribute('aria-pressed',String(i===next)));
 carousel.querySelector('.carousel-caption').textContent=captions[next]+' · '+(next+1)+' / 3';
}
function syncCarousel(){
 clearInterval(carouselTimer);carouselTimer=null;
 carouselToggle.textContent=carouselPaused?'자동 재생':'일시정지';
 carouselToggle.setAttribute('aria-pressed',String(carouselPaused));
 if(!carouselPaused&&!document.hidden)carouselTimer=setInterval(()=>showSlide((activeSlide+1)%slides.length),5000);
}
carouselToggle.addEventListener('click',()=>{carouselPaused=!carouselPaused;syncCarousel()});
dots.forEach((d,i)=>d.addEventListener('click',()=>{showSlide(i);carouselPaused=true;syncCarousel()}));
document.addEventListener('visibilitychange',syncCarousel);
reduced.addEventListener('change',e=>{carouselPaused=e.matches;syncCarousel()});
syncCarousel();
const demoFrames=[...document.querySelectorAll('.demo-frame')];
if(demoFrames.length){
 const labels=['01 · 안부 부탁 문구를 확인해요','02 · 부탁 저장 완료 · 다음 통화에서 전달해요','03 · 이전 통화 기록을 확인해요 (별도 시연)'];
 const caption=document.getElementById('app-demo-caption'), toggle=document.querySelector('.demo-motion-toggle'), motion=matchMedia('(prefers-reduced-motion: reduce)');
 let index=0,paused=motion.matches,timer=null;
 const show=()=>{demoFrames.forEach((el,i)=>{el.classList.toggle('is-active',i===index);el.setAttribute('aria-hidden',String(i!==index));});document.querySelectorAll('.app-demo-steps li').forEach((el,i)=>el.classList.toggle('is-active',i===index));caption.textContent=labels[index];};
 const sync=()=>{clearInterval(timer);toggle.textContent=paused?'움직임 켜기':'움직임 멈추기';toggle.setAttribute('aria-pressed',String(paused));if(!paused&&!document.hidden)timer=setInterval(()=>{index=(index+1)%demoFrames.length;show();},5000);};
 toggle.addEventListener('click',()=>{paused=!paused;sync();});motion.addEventListener('change',e=>{paused=e.matches;sync();});document.addEventListener('visibilitychange',sync);show();sync();
}

const trialDialog=document.getElementById('start-trial');
document.querySelectorAll('a[href="#start-trial"]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();trialDialog.showModal();}));
document.querySelector('.trial-close').addEventListener('click',()=>trialDialog.close());
