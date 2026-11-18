/**
 * The host's side of the class activity: unlock with the secret code (checked by the server, never here),
 * start and end the game, and watch the ranking fill in live. Only one person is meant to use this.
 */
import {api,type HostResults} from './api';
import {SECTIONS,QUESTIONS} from './quiz';
import type {Row} from '../worker/game';

const KEY='diablitos.host';
const sessionGet=()=>{try{return sessionStorage.getItem(KEY)??undefined;}catch{return undefined;}};
const sessionSet=(value?:string)=>{try{if(value)sessionStorage.setItem(KEY,value);else sessionStorage.removeItem(KEY);}catch{/* private mode */}};
const fmt=(value:number)=>Math.round(value).toLocaleString('es-CR');
const OFFLINE='No hay conexión con el servidor del juego. El modo anfitrión solo funciona cuando la plataforma está en línea.';

function el<K extends keyof HTMLElementTagNameMap>(tag:K,className='',text=''):HTMLElementTagNameMap[K]{
  const node=document.createElement(tag);if(className)node.className=className;if(text)node.textContent=text;return node;
}

export function resultsCsv(results:HostResults):string{
  const head=['Puesto','Nombre','Puntos','Respondidas','Correctas','Rapidez media (%)',
    ...SECTIONS.flatMap(s=>[`${s.levelName} correctas`,`${s.levelName} respondidas`])];
  const quote=(value:string|number)=>`"${String(value).replace(/"/g,'""')}"`;
  const rows=results.players.map(row=>[row.rank,row.name,row.points,row.answered,row.correct,Math.round(row.avgSpeed*100),
    ...SECTIONS.flatMap(s=>[row.byLevel[s.level].correct,row.byLevel[s.level].answered])]);
  // Semicolons and a byte-order mark so Excel in Spanish opens the accents correctly.
  return String.fromCharCode(0xfeff)+[head,...rows].map(line=>line.map(quote).join(';')).join('\r\n');
}
function download(name:string,content:string):void{
  const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'}));
  const link=el('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export interface HostPanel{show():void;stop():void}

export function mountHost(body:HTMLElement):HostPanel{
  let token=sessionGet(),timer=0,latest:HostResults|undefined;
  const stop=()=>{clearInterval(timer);timer=0;};

  function login(message='',tone:'error'|'info'='error'):void{
    stop();body.replaceChildren();
    const lede=el('p','host-lede','Solo el anfitrión puede iniciar una partida. Escribe tu código de 4 dígitos.');
    const input=el('input','host-code');input.type='password';input.inputMode='numeric';input.maxLength=4;input.autocomplete='off';
    input.setAttribute('aria-label','Código del anfitrión');input.placeholder='••••';
    const note=el('p',`host-note ${tone==='error'?'is-error':''}`,message);note.setAttribute('role','alert');note.hidden=!message;
    let busy=false;
    const submit=async()=>{
      if(busy||input.value.length!==4)return;busy=true;input.disabled=true;note.hidden=true;
      const result=await api.hostLogin(input.value);
      busy=false;input.disabled=false;
      if(result.ok){token=result.data.token;sessionSet(token);show();return;}
      input.value='';
      note.hidden=false;note.className='host-note is-error';
      if(result.offline)note.textContent=OFFLINE;
      else if(result.status===429)note.textContent=`Demasiados intentos. Espera ${Math.max(1,Math.ceil((result.retryAfterMs??0)/60000))} min antes de volver a probar.`;
      else if(result.status===401)note.textContent=`Código incorrecto.${result.attemptsLeft!==undefined?` Te quedan ${result.attemptsLeft} ${result.attemptsLeft===1?'intento':'intentos'}.`:''}`;
      else note.textContent=result.message;
      input.focus();
    };
    input.addEventListener('input',()=>{input.value=input.value.replace(/\D/g,'').slice(0,4);if(input.value.length===4)void submit();});
    body.append(lede,input,note);input.focus();
  }

  async function panel():Promise<void>{
    stop();body.replaceChildren();
    const top=el('div','host-top');const state=el('p','host-state');state.setAttribute('role','status');
    const actions=el('div','host-actions');
    const main=el('button','button primary host-main');main.type='button';
    const csv=el('button','button');csv.type='button';csv.textContent='Descargar resultados';
    const leave=el('button','text-button');leave.type='button';leave.textContent='Cerrar sesión de host';
    actions.append(main,csv,leave);top.append(state,actions);
    const note=el('p','host-note');
    const list=el('ol','rank-list');list.setAttribute('aria-label','Ranking en vivo');
    const empty=el('p','host-empty','Todavía no hay jugadores. Cuando inicies la partida, los estudiantes aparecerán aquí en vivo.');
    body.append(top,note,list,empty);

    let confirming:'start'|'end'|undefined,confirmTimer=0,pending=false;
    const arm=(what:'start'|'end')=>{confirming=what;render();clearTimeout(confirmTimer);confirmTimer=window.setTimeout(()=>{confirming=undefined;render();},5000);};

    function render():void{
      const results=latest;if(!results)return;
      const open=results.game?.status==='open',count=results.players.length;
      state.className=`host-state ${open?'is-open':results.game?'is-closed':''}`;
      state.textContent=open?`Partida abierta · ${count} de ${results.max} jugadores`:results.game?`Partida terminada · ${count} ${count===1?'jugador':'jugadores'}`:'Sin partida';
      main.disabled=pending;
      main.className=`button host-main ${open?(confirming==='end'?'danger':''):'primary'}`;
      main.textContent=open?(confirming==='end'?'Confirmar: terminar la partida':'Terminar partida'):(confirming==='start'?'Confirmar: borrar los resultados anteriores':'Iniciar partida');
      note.className='host-note';
      note.textContent=open?'Los estudiantes ya pueden entrar con su nombre. Al terminar, dejan de sumar puntos y los resultados se conservan.'
        :count?'Los resultados de la última partida se conservan 2 días. Si inicias otra, se reemplazan: descárgalos antes.':'Al iniciar, los estudiantes podrán entrar con su nombre desde su computadora.';
      csv.hidden=!count;empty.hidden=count>0;
      list.replaceChildren(...results.players.map(rowItem));
    }
    async function refresh():Promise<void>{
      if(!token)return;
      const result=await api.hostResults(token);
      if(result.ok){latest=result.data;render();return;}
      if(result.offline){state.textContent='Sin conexión con el servidor. Reintentando…';return;}
      if(result.status===401){token=undefined;sessionSet();login('Tu sesión de anfitrión terminó. Vuelve a escribir el código.','info');}
    }
    main.addEventListener('click',async()=>{
      if(!token||!latest||pending)return;
      const open=latest.game?.status==='open',needsConfirm=open||latest.players.length>0;
      const what:'start'|'end'=open?'end':'start';
      if(needsConfirm&&confirming!==what){arm(what);return;}
      clearTimeout(confirmTimer);confirming=undefined;pending=true;render();
      const result=open?await api.hostEnd(token):await api.hostStart(token);
      pending=false;
      if(!result.ok){note.className='host-note is-error';note.textContent=result.offline?OFFLINE:result.message;if(result.status===401){token=undefined;sessionSet();login('Tu sesión de anfitrión terminó. Vuelve a escribir el código.','info');}return;}
      await refresh();
    });
    csv.addEventListener('click',()=>{if(latest)download(`resultados-diablitos-${new Date().toISOString().slice(0,10)}.csv`,resultsCsv(latest));});
    leave.addEventListener('click',()=>{token=undefined;sessionSet();login();});
    state.textContent='Conectando…';
    await refresh();
    if(token)timer=window.setInterval(()=>void refresh(),3000);
  }

  function rowItem(row:Row):HTMLElement{
    const item=el('li',`rank-row${row.rank<=3?` top-${row.rank}`:''}`);
    const levels=el('span','rank-levels');
    for(const section of SECTIONS){
      const stat=row.byLevel[section.level];
      const chip=el('i',`lv lv${section.level}${stat.answered?'':' is-empty'}`,`${section.levelName} ${stat.correct}/${stat.answered}`);
      chip.title=`${section.levelName}: ${stat.correct} correctas de ${stat.answered} respondidas`;levels.append(chip);
    }
    const name=el('span','rank-name',row.name),meta=el('span','rank-meta',`${row.answered} de ${QUESTIONS.length} respondidas · ${row.answered?`rapidez ${Math.round(row.avgSpeed*100)} %`:'sin respuestas'}`);
    const who=el('span','rank-who');who.append(name,meta);
    item.append(el('span','rank-n',String(row.rank)),who,levels,el('span','rank-points',fmt(row.points)));
    return item;
  }

  function show():void{if(token)void panel();else login();}
  return {show,stop};
}
