/**
 * "Cómo se juega": a short tutorial of five cards that stack, slide and animate, shown the first time someone
 * enters (while the 3D room loads) and available again from a button. Every number in the text comes from the
 * game's own rules (quiz.ts), so the tutorial can never disagree with the game.
 */
import {QUESTIONS,SECTIONS,SECTION_SIZE,READ_TIME,QUESTION_TIME,MAX_POINTS,questionsOf,scoreAnswer} from './quiz';
import {assetUrl} from './data';
import {crown} from './podium';

export interface Rules{
  readSeconds:number;answerSeconds:number;maxPoints:number;multipliers:number[];
  sectionSize:number;questionsPerSection:number;sections:number;
}
export const currentRules=():Rules=>({
  readSeconds:READ_TIME/1000,answerSeconds:QUESTION_TIME/1000,maxPoints:MAX_POINTS,multipliers:SECTIONS.map(s=>s.multiplier),
  sectionSize:SECTION_SIZE,questionsPerSection:questionsOf(0).length,sections:SECTIONS.length,
});

export type Scene='museum'|'photos'|'unlock'|'answer'|'podium';
export type Tone='anil'|'caracol'|'achiote'|'sol'|'selva';
export interface Card{id:string;scene:Scene;tone:Tone;step:string;title:string;text:string}

/** Thousands with a plain space, the same on every device. */
const grouped=(value:number)=>String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g,' ');
const times=(multiplier:number)=>`×${String(multiplier).replace('.',',')}`;

export function tutorialCards(rules:Rules=currentRules()):Card[]{
  const photos=rules.sections*rules.sectionSize,second=rules.multipliers[1]??1,third=rules.multipliers[2]??second;
  const base:Omit<Card,'step'>[]=[
    {id:'recorre',scene:'museum',tone:'anil',title:'Recorre el museo',
      text:`Camina con W A S D o las flechas y arrastra el ratón para mirar. Hay ${photos} fotografías de la fiesta esperándote.`},
    {id:'abre',scene:'photos',tone:'caracol',title:'Abre las fotos',
      text:`Haz clic en una fotografía para leer su historia. El museo tiene ${rules.sections} secciones de ${rules.sectionSize} fotos.`},
    {id:'desbloquea',scene:'unlock',tone:'achiote',title:'Desbloquea las preguntas',
      text:`Al ver las ${rules.sectionSize} fotos de una sección se abren ${rules.questionsPerSection} preguntas. Las encuentras en el botón El reto.`},
    {id:'responde',scene:'answer',tone:'sol',title:'Responde rápido',
      text:`Lees la pregunta ${rules.readSeconds} segundos y luego tienes ${rules.answerSeconds} para elegir. Acertar rápido da hasta ${grouped(rules.maxPoints)} puntos; las secciones difíciles valen ${times(second)} y ${times(third)}.`},
    {id:'gana',scene:'podium',tone:'selva',title:'Llega al podio',
      text:'Gana quien sume más puntos. Cuando el anfitrión termina la partida, todos ven el podio con los tres mejores.'},
  ];
  return base.map((card,index)=>({...card,step:`Paso ${index+1} de ${base.length}`}));
}

export type CardState='past'|'current'|'next'|'far';
/** Where a card sits in the stack: behind the current one it peeks out two steps, farther cards stay hidden. */
export function cardState(index:number,current:number):{state:CardState;depth:number}{
  const depth=index-current;
  return {state:depth<0?'past':depth===0?'current':depth<=2?'next':'far',depth:Math.max(0,depth)};
}

const COLORS=['#e5502f','#f7b731','#ffd166','#6f84ff','#2fa36b','#c75bd6'];
const DYES=['anil','caracol','achiote','monte'];
const ICONS={
  spark:'<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M9 1.5 11 7l5.5 2-5.5 2L9 16.5 7 11 1.5 9 7 7z"/></svg>',
  grid:'<svg viewBox="0 0 18 18" aria-hidden="true"><rect x="2.5" y="2.5" width="5" height="5"/><rect x="10.5" y="2.5" width="5" height="5"/><rect x="2.5" y="10.5" width="5" height="5"/><rect x="10.5" y="10.5" width="5" height="5"/></svg>',
  book:'<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M2 3h5a2 2 0 0 1 2 2v10a2 2 0 0 0-2-2H2zM16 3h-5a2 2 0 0 0-2 2v10a2 2 0 0 1 2-2h5z"/></svg>',
  closed:'<svg class="lock-closed" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="3"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  open:'<svg class="lock-open" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="3"/><path d="M8 11V8a4 4 0 0 1 7.6-1.7"/></svg>',
};

function el<K extends keyof HTMLElementTagNameMap>(tag:K,className='',text=''):HTMLElementTagNameMap[K]{
  const node=document.createElement(tag);if(className)node.className=className;if(text)node.textContent=text;return node;
}

/** The pictures inside each card. They reuse the game's own classes so they always look like the real thing. */
const SCENES:Record<Scene,()=>string>={
  museum:()=>`<div class="ts-museum">
    <img src="${assetUrl('tutorial/sala.webp')}" alt="Una sala luminosa del museo, con fotografías de la fiesta en las paredes" width="960" height="600" decoding="async">
    <div class="ts-drag"><span>Arrastra para mirar</span><i aria-hidden="true">↔</i></div>
    <div class="ts-keys" aria-hidden="true"><span class="ts-key k-w">W</span><span class="ts-key k-a">A</span><span class="ts-key k-s">S</span><span class="ts-key k-d">D</span></div>
  </div>`,
  photos:()=>`<div class="ts-photos">
    <div class="ts-sec"><b>1</b><span>${SECTIONS[0].name}</span></div>
    <div class="ts-grid">${[1,2,3,4].map(n=>`<div class="ts-photo" style="--i:${n-1}"><img src="${assetUrl(`artworks/art-00${n}.jpg`)}" alt="" width="96" height="96" loading="lazy" decoding="async"><span class="ts-check" aria-hidden="true">✓</span></div>`).join('')}</div>
    <div class="ts-unlock-row"><span class="ts-lock">${ICONS.closed}${ICONS.open}</span><span class="ts-done">¡Sección completa!</span></div>
  </div>`,
  unlock:()=>`<div class="ts-unlock">
    <div class="toolbar ts-toolbar" aria-hidden="true">
      <span class="tool tool-reto ready">${ICONS.spark}<span>El reto</span><b class="badge">${questionsOf(0).length}</b></span>
      <span class="tool">${ICONS.grid}</span><span class="tool">${ICONS.book}</span>
    </div>
    <p class="ts-toast">Sección 1 completa: se desbloquearon ${questionsOf(0).length} preguntas.</p>
  </div>`,
  answer:()=>{
    const q=QUESTIONS[0],fast=scoreAnswer(true,1000,1),slow=scoreAnswer(true,QUESTION_TIME*.8,1);
    return `<div class="ts-answer" aria-hidden="true">
      <p class="ts-q">${q.prompt}</p>
      <div class="quiz-timer"><i></i></div>
      <div class="quiz-options ts-options">${q.options.map((option,i)=>`<span class="quiz-option dye-${DYES[i]}${i===q.answer?' ok':''}"><span class="quiz-key">${i+1}</span><span class="quiz-text">${option}</span></span>`).join('')}</div>
      <div class="ts-points"><span class="ts-chip fast">Rápido <b>+${grouped(fast)}</b></span><span class="ts-chip slow">Lento <b>+${grouped(slow)}</b></span></div>
    </div>`;
  },
  podium:()=>`<div class="ts-podium" aria-hidden="true">
    <div class="tp tp-2"><div class="tp-card">Segundo</div><div class="tp-block"><span>2</span></div></div>
    <div class="tp tp-1"><div class="tp-card">Primero</div><div class="tp-block"><span>1</span></div></div>
    <div class="tp tp-3"><div class="tp-card">Tercero</div><div class="tp-block"><span>3</span></div></div>
    <div class="ts-confetti">${Array.from({length:18},(_,i)=>`<i style="--x:${(i*53)%100}%;--t:${(2.3+(i%6)*.28).toFixed(2)}s;--c:${COLORS[i%COLORS.length]}"></i>`).join('')}</div>
  </div>`,
};

function buildCard(card:Card):HTMLElement{
  const root=el('article',`tcard c-${card.tone}`);
  const scene=el('div','tcard-scene');scene.innerHTML=SCENES[card.scene]();
  if(card.scene==='podium')scene.querySelector('.tp-1 .tp-card')!.append(crown());
  const body=el('div','tcard-body');
  body.append(el('span','t-step',card.step),el('h3','t-title',card.title),el('p','t-text',card.text));
  root.append(scene,body);return root;
}

export interface TutorialOptions{onDone?:()=>void}

export function showTutorial(options:TutorialOptions={}):void{
  const dialog=document.querySelector<HTMLDialogElement>('#tutorial-dialog');
  if(!dialog)return;
  const cards=tutorialCards(),total=cards.length;
  let index=0,done=false;
  dialog.replaceChildren();dialog.className='tutorial-dialog';
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)dialog.classList.add('reduced');

  const top=el('div','t-top');
  const skip=el('button','text-button t-skip','Saltar');skip.type='button';
  top.append(el('span','t-tag','Cómo se juega'),skip);

  const stack=el('div','tstack');stack.setAttribute('role','group');stack.setAttribute('aria-roledescription','carrusel');
  stack.setAttribute('aria-label',`Cómo se juega, ${total} pasos`);
  const nodes=cards.map(card=>{const node=buildCard(card);stack.append(node);return node;});

  const nav=el('div','t-nav');
  const back=el('button','text-button t-back','Atrás');back.type='button';
  const dots=el('div','t-dots');
  const dotButtons=cards.map((card,i)=>{
    const dot=el('button','t-dot');dot.type='button';dot.setAttribute('aria-label',`Ir al paso ${i+1}: ${card.title}`);
    dot.addEventListener('click',()=>go(i));dots.append(dot);return dot;
  });
  const next=el('button','button primary t-next');next.type='button';
  nav.append(back,dots,next);
  const load=el('p','t-load');
  dialog.append(top,stack,nav,load);

  function go(target:number):void{
    index=Math.max(0,Math.min(total-1,target));
    nodes.forEach((node,i)=>{
      const {state,depth}=cardState(i,index);
      node.classList.remove('is-past','is-current','is-next','is-far');node.classList.add(`is-${state}`);
      node.style.setProperty('--d',String(depth));
      node.toggleAttribute('inert',state!=='current');node.setAttribute('aria-hidden',String(state!=='current'));
    });
    dotButtons.forEach((dot,i)=>{dot.classList.toggle('is-on',i===index);if(i===index)dot.setAttribute('aria-current','step');else dot.removeAttribute('aria-current');});
    back.style.visibility=index===0?'hidden':'visible';
    next.textContent=index===total-1?'¡A jugar!':'Siguiente';
  }
  const forward=()=>{if(index===total-1)dialog.close();else go(index+1);};
  next.addEventListener('click',forward);
  back.addEventListener('click',()=>go(index-1));
  skip.addEventListener('click',()=>dialog.close());

  const onKey=(event:KeyboardEvent)=>{
    if(event.key==='ArrowRight'){event.preventDefault();forward();}
    else if(event.key==='ArrowLeft'){event.preventDefault();go(index-1);}
  };
  // Swipe on touch screens.
  let startX=0,startY=0,swiping=false;
  stack.addEventListener('pointerdown',event=>{startX=event.clientX;startY=event.clientY;swiping=true;});
  stack.addEventListener('pointerup',event=>{
    if(!swiping)return;swiping=false;
    const dx=event.clientX-startX,dy=event.clientY-startY;
    if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.5)dx<0?forward():go(index-1);
  });
  stack.addEventListener('pointercancel',()=>{swiping=false;});
  dialog.addEventListener('keydown',onKey);

  // While the 3D room loads in the background, show how far it is.
  const source=document.querySelector('#progress-text');
  const sync=()=>{load.textContent=source?.textContent??'';};
  sync();
  const observer=source?new MutationObserver(sync):undefined;observer?.observe(source!,{childList:true,characterData:true,subtree:true});

  const closed=()=>{
    dialog.removeEventListener('close',closed);dialog.removeEventListener('keydown',onKey);observer?.disconnect();
    if(!done){done=true;options.onDone?.();}
  };
  dialog.addEventListener('close',closed);

  go(0);
  if(!dialog.open)dialog.showModal();
  next.focus();
}
