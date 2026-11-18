/**
 * The final screen, shown to everyone when the host ends the game: third place first, then second, then a
 * drumroll for first (feather crown, rays and confetti), and finally fourth and fifth in grey. The player's own
 * place is shown below, so people outside the top five still see how they did.
 */
import type {Podium,Finalist} from './api';

export type BeatKind='call'|'reveal'|'runners'|'final';
export interface Beat{at:number;kind:BeatKind;place?:number;text?:string}

/** When each thing appears, in milliseconds. Fewer than three players simply skip the missing places. */
export function buildTimeline(count:number,hasRunners:boolean):Beat[]{
  const beats:Beat[]=[];const shown=Math.min(count,3);
  let t=900,firstAt=0;
  for(let place=shown;place>=1;place--){
    const last=place===1;
    beats.push({at:t,kind:'call',place,text:count===1?'¡El primer lugar es…!':place===3?'Tercer lugar…':place===2?'Segundo lugar…':'¡Y el primer lugar es…!'});
    t+=last?2400:1200;
    beats.push({at:t,kind:'reveal',place});
    if(last)firstAt=t;
    t+=last?0:1900;
  }
  if(shown>=1){
    if(hasRunners)beats.push({at:firstAt+2800,kind:'runners'});
    beats.push({at:firstAt+(hasRunners?3800:2600),kind:'final'});
  }else beats.push({at:300,kind:'final'});
  return beats.sort((a,b)=>a.at-b.at);
}

const COLORS=['#e5502f','#f7b731','#ffd166','#6f84ff','#2fa36b','#c75bd6','#fff9ef'];
const reducedMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const fmt=(value:number)=>Math.round(value).toLocaleString('es-CR');

function el<K extends keyof HTMLElementTagNameMap>(tag:K,className='',text=''):HTMLElementTagNameMap[K]{
  const node=document.createElement(tag);if(className)node.className=className;if(text)node.textContent=text;return node;
}

/** A light confetti cannon on a canvas. It stops by itself when nothing is left to draw. */
class Confetti{
  private parts:{x:number;y:number;vx:number;vy:number;rot:number;vr:number;w:number;h:number;color:string;round:boolean;life:number}[]=[];
  private raf=0;private ctx:CanvasRenderingContext2D;
  constructor(private canvas:HTMLCanvasElement){this.ctx=canvas.getContext('2d')!;this.resize();}
  resize():void{
    const dpr=Math.min(devicePixelRatio||1,2);
    this.canvas.width=this.canvas.clientWidth*dpr;this.canvas.height=this.canvas.clientHeight*dpr;this.ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  burst(x:number,y:number,count:number,power=1):void{
    for(let i=0;i<count;i++){
      const angle=-Math.PI/2+(Math.random()-.5)*Math.PI*1.1,speed=(6+Math.random()*9)*power;
      this.parts.push({x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,rot:Math.random()*6,vr:(Math.random()-.5)*.4,
        w:6+Math.random()*7,h:4+Math.random()*6,color:COLORS[Math.floor(Math.random()*COLORS.length)],round:Math.random()<.25,life:0});
    }
    if(!this.raf)this.raf=requestAnimationFrame(()=>this.tick());
  }
  /** Confetti falling from the top across the whole screen. */
  rain(count:number):void{
    const width=this.canvas.clientWidth;
    for(let i=0;i<count;i++)this.parts.push({x:Math.random()*width,y:-20-Math.random()*200,vx:(Math.random()-.5)*2,vy:2+Math.random()*3,rot:Math.random()*6,
      vr:(Math.random()-.5)*.3,w:6+Math.random()*7,h:4+Math.random()*6,color:COLORS[Math.floor(Math.random()*COLORS.length)],round:Math.random()<.25,life:0});
    if(!this.raf)this.raf=requestAnimationFrame(()=>this.tick());
  }
  private tick():void{
    const {ctx,canvas}=this,width=canvas.clientWidth,height=canvas.clientHeight;
    ctx.clearRect(0,0,width,height);
    this.parts=this.parts.filter(p=>p.y<height+30&&p.life<420);
    for(const p of this.parts){
      p.life++;p.vy+=.22;p.vx*=.992;p.x+=p.vx;p.y+=p.vy;p.rot+=p.vr;
      ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.rot);ctx.fillStyle=p.color;ctx.globalAlpha=Math.min(1,(420-p.life)/60);
      if(p.round){ctx.beginPath();ctx.arc(0,0,p.w/2.4,0,Math.PI*2);ctx.fill();}else ctx.fillRect(-p.w/2,-p.h/2,p.w,p.h);
      ctx.restore();
    }
    this.raf=this.parts.length?requestAnimationFrame(()=>this.tick()):0;
    if(!this.parts.length)ctx.clearRect(0,0,width,height);
  }
  stop():void{cancelAnimationFrame(this.raf);this.raf=0;this.parts=[];this.ctx.clearRect(0,0,this.canvas.clientWidth,this.canvas.clientHeight);}
}

/** A fan of feathers for the winner, the same crown as the entry screen. */
export function crown():SVGSVGElement{
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
  svg.setAttribute('viewBox','0 0 220 100');svg.setAttribute('class','crown');svg.setAttribute('aria-hidden','true');
  const count=15;
  for(let i=0;i<count;i++){
    const angle=-Math.PI*(.08+.84*i/(count-1)),up=Math.sin(Math.PI*i/(count-1));
    const length=30+46*Math.pow(up,1.2),half=.17,cx=110,cy=98;
    const pt=(r:number,a:number)=>`${(cx+r*Math.cos(a)).toFixed(1)},${(cy+r*Math.sin(a)).toFixed(1)}`;
    const g=document.createElementNS(ns,'polygon');
    g.setAttribute('points',`${pt(14,angle-half)} ${pt(14+length,angle)} ${pt(14,angle+half)}`);
    g.setAttribute('fill',COLORS[i%6]);g.setAttribute('class','feather');g.setAttribute('style',`--i:${i}`);
    svg.append(g);
  }
  return svg;
}

let current:{stop:()=>void}|undefined;

export function showPodium(data:Podium):void{
  const dialog=document.querySelector<HTMLDialogElement>('#podium-dialog');
  if(!dialog)return;
  current?.stop();
  const reduced=reducedMotion(),finalists=data.finalists,top=finalists.slice(0,3),runners=finalists.slice(3,5);
  dialog.replaceChildren();dialog.className='podium-dialog';

  const rays=el('div','podium-rays');rays.setAttribute('aria-hidden','true');
  const flash=el('div','podium-flash');flash.setAttribute('aria-hidden','true');
  const canvas=el('canvas','podium-confetti');canvas.setAttribute('aria-hidden','true');
  const skip=el('button','podium-skip text-button','Saltar animación');skip.type='button';
  const head=el('header','podium-head');
  const kicker=el('p','podium-kicker','Resultado final'),call=el('h2','podium-call');call.setAttribute('aria-live','polite');
  head.append(kicker,call);

  const stage=el('div','podium');
  const places=new Map<number,{root:HTMLElement;points:HTMLElement;target:number}>();
  // Visual order of a podium: second on the left, first in the middle, third on the right.
  // The three steps always appear so the podium keeps its shape; a step nobody reached stays empty and grey.
  for(const place of [2,1,3]){
    const who=top[place-1];
    if(!who){
      if(!finalists.length)continue;
      const empty=el('div',`place place-${place} is-empty`);empty.setAttribute('aria-hidden','true');
      const block=el('div','place-block');block.append(el('span','place-n',String(place)));empty.append(block);stage.append(empty);continue;
    }
    const root=el('div',`place place-${place}`);
    const card=el('div','place-card');
    if(place===1)card.append(crown());
    const name=el('span','place-name',who.name),points=el('b','place-points','0');
    card.append(name,points,el('span','place-note',`${who.correct} ${who.correct===1?'acierto':'aciertos'} · ${who.answered} de 6`));
    const block=el('div','place-block');block.append(el('span','place-n',String(place)));
    root.append(card,block);places.set(place,{root,points,target:who.points});stage.append(root);
    if(data.me&&data.me.rank===place)root.classList.add('is-me');
  }

  const list=el('ol','runners');list.setAttribute('aria-label','Cuarto y quinto lugar');
  runners.forEach((who:Finalist)=>{
    const item=el('li',`runner${data.me&&data.me.rank===who.rank?' is-me':''}`);
    item.append(el('span','runner-rank',String(who.rank)),el('span','runner-name',who.name),el('span','runner-points',fmt(who.points)));
    list.append(item);
  });

  const foot=el('footer','podium-foot');
  const me=el('p','podium-me');
  if(data.me){
    me.textContent=data.me.rank<=3?`¡Estás en el podio! Quedaste en el puesto ${data.me.rank} de ${data.total} con ${fmt(data.me.points)} puntos.`
      :`Quedaste en el puesto ${data.me.rank} de ${data.total} con ${fmt(data.me.points)} puntos.`;
  }
  const close=el('button','button primary','Cerrar');close.type='button';close.setAttribute('data-close','');
  foot.append(me,close);

  // Everything above is visual; screen readers get the whole result at once.
  const spoken=el('ol','sr-only');
  for(const who of finalists)spoken.append(el('li','',`Puesto ${who.rank}: ${who.name}, ${fmt(who.points)} puntos`));
  if(!finalists.length)call.textContent='Nadie jugó esta partida.';

  dialog.append(rays,canvas,flash,skip,head,stage,list,foot,spoken);
  if(!dialog.open)dialog.showModal();

  const confetti=reduced?undefined:new Confetti(canvas);
  const timers:number[]=[],frames:number[]=[];
  const onResize=()=>confetti?.resize();addEventListener('resize',onResize);

  const countUp=(place:number)=>{
    const entry=places.get(place);if(!entry)return;
    if(reduced){entry.points.textContent=fmt(entry.target);return;}
    const start=performance.now(),duration=1300;
    const step=(now:number)=>{
      const t=Math.min(1,(now-start)/duration),eased=1-Math.pow(1-t,3);
      entry.points.textContent=fmt(entry.target*eased);
      if(t<1)frames.push(requestAnimationFrame(step));
    };
    frames.push(requestAnimationFrame(step));
    // Background tabs pause animation frames: make sure the final number is shown anyway.
    timers.push(window.setTimeout(()=>{entry.points.textContent=fmt(entry.target);},duration+200));
  };
  const reveal=(place:number)=>{
    const entry=places.get(place);if(!entry)return;
    entry.root.classList.add('is-shown');countUp(place);
    const box=entry.root.querySelector('.place-block')!.getBoundingClientRect();
    if(place===1){
      dialog.classList.add('first-revealed');
      confetti?.burst(box.left+box.width/2,box.top,140,1.25);
      timers.push(window.setTimeout(()=>confetti?.burst(innerWidth*.2,innerHeight*.9,70,1.15),350));
      timers.push(window.setTimeout(()=>confetti?.burst(innerWidth*.8,innerHeight*.9,70,1.15),600));
      timers.push(window.setTimeout(()=>confetti?.rain(90),900));
      call.textContent=`¡Felicidades, ${top[0].name}!`;call.classList.add('is-winner');
    }else confetti?.burst(box.left+box.width/2,box.top,40,.8);
  };
  const apply=(beat:Beat)=>{
    if(beat.kind==='call'){call.classList.remove('is-winner','pulse');void call.offsetWidth;call.textContent=beat.text??'';call.classList.add('pulse');}
    else if(beat.kind==='reveal')reveal(beat.place!);
    else if(beat.kind==='runners')list.classList.add('is-shown');
    else{foot.classList.add('is-shown');skip.hidden=true;if(!finalists.length)call.classList.add('is-winner');}
  };
  const beats=buildTimeline(top.length,runners.length>0);
  let finished=false;
  const finishNow=()=>{
    if(finished)return;finished=true;
    timers.forEach(clearTimeout);frames.forEach(cancelAnimationFrame);
    dialog.classList.add('skipped');
    for(const place of places.keys()){places.get(place)!.root.classList.add('is-shown');places.get(place)!.points.textContent=fmt(places.get(place)!.target);}
    dialog.classList.toggle('first-revealed',top.length>0);
    list.classList.add('is-shown');foot.classList.add('is-shown');skip.hidden=true;
    call.classList.remove('pulse');call.classList.toggle('is-winner',top.length>0);
    call.textContent=top.length?`¡Felicidades, ${top[0].name}!`:'Nadie jugó esta partida.';
    confetti?.stop();
  };
  skip.addEventListener('click',finishNow);

  const cleanup=()=>{
    timers.forEach(clearTimeout);frames.forEach(cancelAnimationFrame);confetti?.stop();removeEventListener('resize',onResize);
    dialog.removeEventListener('close',cleanup);if(current===handle)current=undefined;
  };
  const handle={stop:()=>{cleanup();if(dialog.open)dialog.close();}};current=handle;
  dialog.addEventListener('close',cleanup);
  close.addEventListener('click',()=>dialog.close());

  if(reduced||!finalists.length){finishNow();return;}
  for(const beat of beats)timers.push(window.setTimeout(()=>apply(beat),beat.at));
  skip.focus();
}
