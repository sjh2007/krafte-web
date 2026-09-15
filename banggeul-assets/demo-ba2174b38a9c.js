(()=>{
const examples=[
  {
    "title": "오늘의 식사 안부",
    "quote": "“어머니, 점심은 드셨어요?”",
    "messages": [
      [
        "방글이",
        "어머니 안녕하세요. 저 방글이에요. 오늘 점심은 드셨어요?"
      ],
      [
        "어머니",
        "그럼 친구들 만나서 국수 사 먹었지 오랜만에 만나니 좋더라."
      ],
      [
        "방글이",
        "오랜만에 친구분들을 만나셨군요. 국수는 맛있게 드셨어요?"
      ],
      [
        "어머니",
        "음 따뜻하니 맛있었어. 친구들이랑 이야기도 한참 했지. 이야기도 한참 했지."
      ],
      [
        "방글이",
        "즐거운 시간 보내셨네요. 저녁에는 어떤 걸 드실 생각이세요?"
      ],
      [
        "어머니",
        "집에 있는 밥하고 된장국 데워 먹으려고. 반찬도 좀 있고."
      ],
      [
        "방글이",
        "친구분들과 즐겁게 식사하셨군요. 저녁도 잘 챙겨 드시고 편안한 하루 보내세요."
      ],
      [
        "어머니",
        "그래 전화해 줘서 고마워"
      ]
    ],
    "notes": [
      "친구분들과 점심 식사를 하셨어요.",
      "점심은 친구들과 국수, 저녁은 밥과 된장국을 드실 예정이에요.",
      "저녁도 잘 챙겨 드시도록 안부를 전했어요.",
      "오늘 만나신 친구 이야기를 여쭤보세요."
    ],
    "audio": [
      "banggeul-assets/audio/spoken-ff1fa27863815127.wav",
      "banggeul-assets/audio/spoken-92759bdeb6f61bee.wav",
      "banggeul-assets/audio/spoken-566d3b5fa04b3216.wav",
      "banggeul-assets/audio/spoken-3d3b7b940bfcdb69.wav",
      "banggeul-assets/audio/spoken-0e1f7cbae6d37985.wav",
      "banggeul-assets/audio/spoken-237a3743c05af4a1.wav",
      "banggeul-assets/audio/spoken-2a3964660b775365.wav",
      "banggeul-assets/audio/spoken-3e2a63dba8108713.wav"
    ]
  },
  {
    "title": "오늘의 컨디션 확인",
    "quote": "“오늘은 몸이 좀 어떠세요?”",
    "messages": [
      [
        "방글이",
        "어머니, 오늘은 몸이 좀 어떠세요?"
      ],
      [
        "어머니",
        "밥은 잘 먹었는디, 오늘 무릎이 조금 쑤시네."
      ],
      [
        "방글이",
        "무릎이 쑤셔서 신경 쓰이시겠어요. 언제부터 불편하셨어요?"
      ],
      [
        "어머니",
        "오늘 아침부터 좀 그러네. 지금은 의자에 앉아서 쉬고 있어."
      ],
      [
        "방글이",
        "지금 쉬고 계시는군요. 따님께서 오늘 연락드리면 좋으시겠어요."
      ],
      [
        "어머니",
        "응. 저녁에 시간 나면 전화 한 통 해 달라고 해줘."
      ],
      [
        "방글이",
        "무릎이 불편하시군요. 가족분께도 말씀드려 함께 살펴보실 수 있도록 할게요."
      ],
      [
        "어머니",
        "그래. 우리 딸한테 전해줘."
      ]
    ],
    "notes": [
      "무릎이 불편하다는 말씀을 하셨어요.",
      "아침부터 무릎이 쑤셔서 앉아 쉬고 계시며, 저녁에 따님의 전화를 원하세요.",
      "가족과 함께 살펴보실 수 있도록 이야기를 전했어요.",
      "부모님께 직접 연락해 상태를 확인해 주세요."
    ],
    "audio": [
      "banggeul-assets/audio/spoken-60a533e0fe50888d.wav",
      "banggeul-assets/audio/spoken-b20607ad87c25255.wav",
      "banggeul-assets/audio/spoken-5c4f3ba549cd5b01.wav",
      "banggeul-assets/audio/spoken-055768a2afaa5ca5.wav",
      "banggeul-assets/audio/spoken-565578b0d87525b4.wav",
      "banggeul-assets/audio/spoken-6434f10abd5f0b83.wav",
      "banggeul-assets/audio/spoken-a3bec925737dc65a.wav",
      "banggeul-assets/audio/spoken-90f3c5a71d443474.wav"
    ]
  },
  {
    "title": "오늘의 날씨 안부",
    "quote": "“어머니, 시원하게 지내고 계세요?”",
    "messages": [
      [
        "방글이",
        "어머니! 오늘 날씨가 많이 덥네요. 시원하게 지내고 계세요?"
      ],
      [
        "어머니",
        "오늘은 집에서 쉬고 있어. 선풍기 켜놓았지."
      ],
      [
        "방글이",
        "집에서 쉬고 계시는군요. 오늘 물은 좀 드셨어요?"
      ],
      [
        "어머니",
        "아침에 한 잔 마셨지. 이야기하니까 또 한 잔 마셔야겠네."
      ],
      [
        "방글이",
        "좋아요. 곁에 물을 두시면 챙겨 드시기 편하실 거예요. 오늘 나가실 일은 있으세요?"
      ],
      [
        "어머니",
        "급한 일은 없어. 장 보는 건 해가 좀 지면 가려고."
      ],
      [
        "방글이",
        "물도 자주 드시고 더운 한낮에는 외출을 피하세요."
      ],
      [
        "어머니",
        "알았어. 물도 잘 마실게."
      ]
    ],
    "notes": [
      "더운 날씨에 집에서 쉬고 계세요.",
      "아침에 물 한 잔을 드셨고, 장보기는 해가 진 뒤로 생각하고 계세요.",
      "수분 섭취와 한낮 외출 주의를 안내했어요.",
      "실내가 너무 덥지 않은지 한 번 여쭤보세요."
    ],
    "audio": [
      "banggeul-assets/audio/spoken-6676b8e3181f2773.wav",
      "banggeul-assets/audio/spoken-69932cc720daafaf.wav",
      "banggeul-assets/audio/spoken-02b756d34eb8886f.wav",
      "banggeul-assets/audio/spoken-378a028b6920aa8f.wav",
      "banggeul-assets/audio/spoken-3ff75b352844749b.wav",
      "banggeul-assets/audio/spoken-bf6b98226b6b8f1b.wav",
      "banggeul-assets/audio/spoken-868dcd777d00443b.wav",
      "banggeul-assets/audio/spoken-0d8384f971c2ef0c.wav"
    ]
  }
];
let selected=0,step=0,running=false,runId=0;
const get=id=>document.getElementById(id),label=get('play-label');
const total=()=>examples[selected].messages.length;
get('demo-progress').max=total();
const audio=document.createElement('audio');audio.id='demo-audio';audio.preload='auto';document.querySelector('.conversation-controls').append(audio);
const caption=document.querySelector('.conversation-controls>p');caption.setAttribute('aria-live','polite');
const voiceCaption='';
caption.textContent=voiceCaption;label.textContent='안부 대화 듣기';
const mute=document.createElement('button');mute.className='icon-button';mute.id='demo-mute';mute.setAttribute('aria-label','음소거');mute.setAttribute('aria-pressed','false');mute.textContent='♪';get('demo-reset').after(mute);
mute.addEventListener('click',()=>{audio.muted=!audio.muted;mute.setAttribute('aria-pressed',String(audio.muted));mute.setAttribute('aria-label',audio.muted?'소리 켜기':'음소거');mute.textContent=audio.muted?'×♪':'♪'});
function removeHighlight(){document.querySelectorAll('.demo-message.speaking').forEach(e=>e.classList.remove('speaking'))}
function stop(){runId++;audio.pause();running=false;removeHighlight();label.textContent=step===total()?'다시 듣기':get('demo-messages').children.length?'이어서 듣기':'안부 대화 듣기';if(step<total()&&get('demo-messages').children.length)get('demo-state').textContent='일시정지';}
function reset(){stop();step=0;audio.removeAttribute('src');audio.load();get('demo-intro').hidden=false;get('demo-messages').hidden=true;get('demo-messages').replaceChildren();document.querySelector('.conversation-body').scrollTop=0;get('demo-state').textContent='통화 준비';get('demo-progress').value=0;label.textContent='안부 대화 듣기';caption.textContent=voiceCaption;caption.classList.remove('audio-error');examples[selected].notes.forEach((_,i)=>{get('note-'+i).textContent='대화를 확인하면 이곳에 정리돼요.';get('note-'+i).classList.remove('filled')});document.querySelectorAll('.demo-steps li').forEach(e=>e.classList.remove('active'));}
function showMessage(index){get('demo-intro').hidden=true;get('demo-messages').hidden=false;if(get('demo-messages').children[index])return get('demo-messages').children[index];const [who,text]=examples[selected].messages[index],message=document.createElement('div');message.className='demo-message'+(who==='어머니'?' parent':'');const name=document.createElement('strong');name.textContent=who;message.append(name,document.createTextNode(text));get('demo-messages').append(message);const body=document.querySelector('.conversation-body');body.scrollTop=body.scrollHeight;return message;}
function fillNotes(index){const indices=index===1?[0]:index===5?[1]:index===6?[2]:index===7?[3]:[];indices.forEach(i=>{get('note-'+i).textContent=examples[selected].notes[i];get('note-'+i).classList.add('filled')});}
async function playLine(){if(step>=total())return;const current=++runId;running=true;label.textContent='일시정지';caption.textContent=voiceCaption;caption.classList.remove('audio-error');removeHighlight();showMessage(step).classList.add('speaking');document.querySelectorAll('.demo-steps li')[Math.floor(step/2)].classList.add('active');get('demo-state').textContent=examples[selected].messages[step][0]+' 이야기 중';const src=examples[selected].audio[step];if(audio.getAttribute('src')!==src)audio.src=src;try{await audio.play();if(current!==runId&&!running)audio.pause();}catch{if(current!==runId)return;stop();caption.textContent='음성을 재생하지 못했어요. 재생 버튼을 다시 눌러 주세요.';caption.classList.add('audio-error');}}
audio.addEventListener('ended',()=>{if(!running)return;fillNotes(step);step++;get('demo-progress').value=step;if(step===total()){stop();get('demo-state').textContent='통화 완료';return;}playLine();});
audio.addEventListener('timeupdate',()=>{if(running&&Number.isFinite(audio.duration)&&audio.duration>0)get('demo-progress').value=step+audio.currentTime/audio.duration;});
get('demo-play').addEventListener('click',()=>{if(running){stop();return}if(step===total())reset();playLine();});
get('demo-reset').addEventListener('click',reset);
get('demo-all').addEventListener('click',()=>{stop();audio.removeAttribute('src');audio.load();for(let i=0;i<total();i++){showMessage(i);fillNotes(i);document.querySelectorAll('.demo-steps li')[Math.floor(i/2)].classList.add('active')}step=total();get('demo-progress').value=total();get('demo-state').textContent='전체 대화';label.textContent='처음부터 듣기';});
document.querySelectorAll('[data-scenario]').forEach(b=>b.addEventListener('click',()=>{selected=Number(b.dataset.scenario);reset();get('intro-quote').textContent=examples[selected].quote;get('summary-title').textContent=examples[selected].title;document.querySelectorAll('[data-scenario]').forEach(e=>e.setAttribute('aria-pressed',String(e===b)));}));
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop()});
})();
