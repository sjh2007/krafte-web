/* Two-set Korean keystrokes, including composed syllables and shift keys. */
(function(scope){
const initials=[...'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'];
const vowels=[...'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'];
const finals=['',...'ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ'];
const compound={'ㅘ':'ㅗㅏ','ㅙ':'ㅗㅐ','ㅚ':'ㅗㅣ','ㅝ':'ㅜㅓ','ㅞ':'ㅜㅔ','ㅟ':'ㅜㅣ','ㅢ':'ㅡㅣ','ㄳ':'ㄱㅅ','ㄵ':'ㄴㅈ','ㄶ':'ㄴㅎ','ㄺ':'ㄹㄱ','ㄻ':'ㄹㅁ','ㄼ':'ㄹㅂ','ㄽ':'ㄹㅅ','ㄾ':'ㄹㅌ','ㄿ':'ㄹㅍ','ㅀ':'ㄹㅎ','ㅄ':'ㅂㅅ'};
const shifted={'ㄲ':'ㄱ','ㄸ':'ㄷ','ㅃ':'ㅂ','ㅆ':'ㅅ','ㅉ':'ㅈ','ㅒ':'ㅐ','ㅖ':'ㅔ'};
function typingEvents(text){let committed='',events=[];const push=(jamo,display)=>events.push({key:shifted[jamo]||jamo,shift:!!shifted[jamo],display});
 for(const ch of text){const code=ch.charCodeAt(0)-0xac00;
  if(code<0||code>=11172){committed+=ch;push(ch===' '?'space':ch,committed);continue;}
  const l=Math.floor(code/588),v=Math.floor(code%588/28),f=code%28;
  const compose=(vi,fi=0)=>String.fromCharCode(0xac00+l*588+vi*28+fi);
  push(initials[l],committed+initials[l]);
  const vs=[...(compound[vowels[v]]||vowels[v])];vs.forEach((key,i)=>push(key,committed+compose(i===vs.length-1?v:vowels.indexOf(key))));
  if(f){const fs=[...(compound[finals[f]]||finals[f])];fs.forEach((key,i)=>push(key,committed+compose(v,i===fs.length-1?f:finals.indexOf(key))));}
  committed+=ch;
 }
 return events;
}
if(typeof module!=='undefined')module.exports={typingEvents};else scope.banggeulTypingEvents=typingEvents;
})(typeof window!=='undefined'?window:this);
