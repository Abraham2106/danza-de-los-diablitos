/**
 * Game rules for the online class activity: one room, one game at a time, results kept for two days.
 * Everything here is plain TypeScript (no Cloudflare APIs) so it can be unit-tested. The Durable Object
 * in `index.ts` only provides storage. The client plays the museum and quiz locally; the server decides
 * who is the host, who can join, and recomputes every score from the raw answers, so points cannot be invented.
 */
import {QUESTIONS,QUESTION_TIME,makeAnswer,summarize,type Answers,type Summary} from '../src/quiz';

export const MAX_PLAYERS=40;
export const NAME_MAX=24;
/** How many places the final screen shows: three on the podium and two more below it. */
export const PODIUM_SIZE=5;
export const HOST_TOKEN_TTL=12*3600_000;
/** Results disappear this long after the last activity. */
export const RETENTION_MS=48*3600_000;
export const LOGIN_WINDOW=10*60_000;
/** A 4-digit code has only 10 000 combinations, so guesses are limited per IP and overall. */
export const IP_FAILS=5;
export const GLOBAL_FAILS=30;

export interface Player{id:string;token:string;name:string;joinedAt:number;updatedAt:number;answers:Answers}
export interface GameInfo{id:string;status:'open'|'closed';startedAt:number;endedAt?:number}
export interface State{
  game?:GameInfo;
  players:Record<string,Player>;
  /** Host session tokens and when they expire. */
  hosts:Record<string,number>;
  fails:{windowStart:number;global:number;byIp:Record<string,number>};
  lastActivity:number;
}
export const emptyState=():State=>({players:{},hosts:{},fails:{windowStart:0,global:0,byIp:{}},lastActivity:0});

export interface Reply{status:number;body:Record<string,unknown>}
const reply=(status:number,body:Record<string,unknown>):Reply=>({status,body});
const fail=(status:number,error:string,message:string,extra:Record<string,unknown>={}):Reply=>reply(status,{ok:false,error,message,...extra});

export interface Store{
  load():Promise<State>;
  save(state:State):Promise<void>;
  wipe():Promise<void>;
}

export interface Row{
  rank:number;id:string;name:string;points:number;answered:number;correct:number;avgSpeed:number;
  byLevel:Summary['byLevel'];joinedAt:number;updatedAt:number;
}

/** Remove control characters and extra spaces; names are shown to the whole class. */
export function sanitizeName(raw:unknown):string{
  if(typeof raw!=='string')return '';
  return raw.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}<>]/gu,'').replace(/\s+/g,' ').trim().slice(0,NAME_MAX).trim();
}
const nameKey=(name:string)=>name.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();

/** Compare without stopping at the first different character. */
export function safeEqual(a:string,b:string):boolean{
  const length=Math.max(a.length,b.length);let diff=a.length^b.length;
  for(let i=0;i<length;i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);
  return diff===0;
}

export function leaderboard(state:State):Row[]{
  const rows=Object.values(state.players).map(player=>{
    const summary=summarize(player.answers);
    return {id:player.id,name:player.name,points:summary.points,answered:summary.answered,correct:summary.correct,
      avgSpeed:summary.avgSpeed,byLevel:summary.byLevel,joinedAt:player.joinedAt,updatedAt:player.updatedAt};
  });
  rows.sort((x,y)=>y.points-x.points||y.answered-x.answered||y.avgSpeed-x.avgSpeed||x.joinedAt-y.joinedAt);
  return rows.map((row,index)=>({...row,rank:index+1}));
}

export class GameService{
  constructor(
    private store:Store,
    /** The host code lives only in a Cloudflare secret; there is deliberately no default. */
    private secret:()=>string|undefined,
    private clock:()=>number=Date.now,
    private random:()=>string=()=>Array.from(crypto.getRandomValues(new Uint8Array(24)),b=>b.toString(16).padStart(2,'0')).join(''),
  ){}

  private async commit(state:State):Promise<void>{state.lastActivity=this.clock();await this.store.save(state);}
  private hostOk(state:State,token:string|undefined):boolean{
    const expires=token?state.hosts[token]:undefined;return !!expires&&expires>this.clock();
  }
  private status_(state:State){
    const game=state.game;
    return {open:game?.status==='open',gameId:game?.id,players:Object.keys(state.players).length,max:MAX_PLAYERS};
  }

  async status():Promise<Reply>{
    const state=await this.store.load();return reply(200,{ok:true,...this.status_(state)});
  }

  async hostLogin(ip:string,code:unknown):Promise<Reply>{
    const secret=this.secret();
    if(!secret||!/^\d{4,8}$/.test(secret))return fail(503,'host_no_configurado','El modo anfitrión no está configurado en el servidor.');
    const state=await this.store.load(),now=this.clock();
    if(now-state.fails.windowStart>LOGIN_WINDOW)state.fails={windowStart:now,global:0,byIp:{}};
    const retryAfter=Math.max(0,state.fails.windowStart+LOGIN_WINDOW-now);
    if((state.fails.byIp[ip]??0)>=IP_FAILS||state.fails.global>=GLOBAL_FAILS)
      return fail(429,'bloqueado','Demasiados intentos. Espera unos minutos antes de volver a probar.',{retryAfterMs:retryAfter});
    if(typeof code!=='string'||!/^\d{4,8}$/.test(code)||!safeEqual(code,secret)){
      state.fails.byIp[ip]=(state.fails.byIp[ip]??0)+1;state.fails.global++;
      if(!state.fails.windowStart)state.fails.windowStart=now;
      await this.store.save(state);
      return fail(401,'codigo_incorrecto','Código incorrecto.',{attemptsLeft:Math.max(0,IP_FAILS-state.fails.byIp[ip])});
    }
    delete state.fails.byIp[ip];
    for(const [token,expires] of Object.entries(state.hosts))if(expires<=now)delete state.hosts[token];
    const token=this.random();state.hosts[token]=now+HOST_TOKEN_TTL;
    await this.commit(state);
    return reply(200,{ok:true,token,expiresAt:state.hosts[token]});
  }

  async hostStart(token:string|undefined):Promise<Reply>{
    const state=await this.store.load();
    if(!this.hostOk(state,token))return fail(401,'no_autorizado','Vuelve a entrar como anfitrión.');
    if(state.game?.status==='open')return fail(409,'ya_abierta','Ya hay una partida abierta.');
    // One room at a time: a new game replaces the previous results.
    state.game={id:this.random().slice(0,8),status:'open',startedAt:this.clock()};state.players={};
    await this.commit(state);
    return reply(200,{ok:true,game:state.game});
  }

  async hostEnd(token:string|undefined):Promise<Reply>{
    const state=await this.store.load();
    if(!this.hostOk(state,token))return fail(401,'no_autorizado','Vuelve a entrar como anfitrión.');
    if(state.game?.status!=='open')return fail(409,'sin_partida','No hay una partida abierta.');
    state.game.status='closed';state.game.endedAt=this.clock();
    await this.commit(state);
    return reply(200,{ok:true,game:state.game});
  }

  async hostResults(token:string|undefined):Promise<Reply>{
    const state=await this.store.load();
    if(!this.hostOk(state,token))return fail(401,'no_autorizado','Vuelve a entrar como anfitrión.');
    return reply(200,{ok:true,game:state.game??null,max:MAX_PLAYERS,players:leaderboard(state),retentionMs:RETENTION_MS});
  }

  /**
   * The final podium, visible to every player once the host ends the game: only the first five names and
   * points, plus (for a player who sends their session token) their own place. Never available while playing.
   */
  async podium(token:string|undefined):Promise<Reply>{
    const state=await this.store.load();
    if(state.game?.status!=='closed')return fail(409,'sin_resultados','Los resultados finales aparecen cuando el anfitrión termina la partida.');
    const table=leaderboard(state);
    const player=token?Object.values(state.players).find(p=>p.token===token):undefined;
    const mine=player?table.find(row=>row.id===player.id):undefined;
    return reply(200,{ok:true,gameId:state.game.id,total:table.length,
      finalists:table.slice(0,PODIUM_SIZE).map(row=>({rank:row.rank,name:row.name,points:row.points,answered:row.answered,correct:row.correct})),
      me:mine?{rank:mine.rank,total:table.length,points:mine.points,answered:mine.answered,correct:mine.correct}:null});
  }

  async join(rawName:unknown,token:string|undefined):Promise<Reply>{
    const state=await this.store.load();
    if(state.game?.status!=='open')return fail(409,'sin_partida','Todavía no hay una partida abierta.');
    const returning=token?Object.values(state.players).find(p=>p.token===token):undefined;
    if(returning)return reply(200,{ok:true,playerId:returning.id,token:returning.token,name:returning.name,gameId:state.game.id});
    const name=sanitizeName(rawName);
    if(!name)return fail(400,'nombre_invalido','Escribe un nombre para entrar.');
    if(Object.values(state.players).some(p=>nameKey(p.name)===nameKey(name)))
      return fail(409,'nombre_en_uso','Ya hay alguien con ese nombre. Prueba con otro o agrega tu inicial.');
    if(Object.keys(state.players).length>=MAX_PLAYERS)return fail(409,'sala_llena','La sala está llena.');
    const now=this.clock(),id=this.random().slice(0,10),secret=this.random();
    state.players[id]={id,token:secret,name,joinedAt:now,updatedAt:now,answers:{}};
    await this.commit(state);
    return reply(200,{ok:true,playerId:id,token:secret,name,gameId:state.game.id});
  }

  /** Accepts raw answers, never points: each question counts once and is scored here. */
  async score(token:string|undefined,raw:unknown):Promise<Reply>{
    const state=await this.store.load();
    const player=token?Object.values(state.players).find(p=>p.token===token):undefined;
    if(!player)return fail(401,'sesion_invalida','Tu sesión en la partida ya no existe. Vuelve a entrar.');
    if(state.game?.status!=='open')return fail(409,'partida_terminada','La partida ya terminó.');
    if(!Array.isArray(raw)||raw.length>QUESTIONS.length)return fail(400,'datos_invalidos','Respuestas no válidas.');
    for(const item of raw){
      const a=item as Record<string,unknown>|null;
      if(!a||typeof a!=='object'||!Number.isInteger(a.question)||!Number.isInteger(a.choice)||typeof a.ms!=='number'||!Number.isFinite(a.ms)
        ||(a.question as number)<0||(a.question as number)>=QUESTIONS.length||(a.choice as number)<-1||(a.choice as number)>3||a.ms<0||a.ms>QUESTION_TIME)
        return fail(400,'datos_invalidos','Respuestas no válidas.');
    }
    for(const item of raw as {question:number;choice:number;ms:number}[]){
      if(!player.answers[item.question])player.answers[item.question]=makeAnswer(item.question,item.choice,item.ms);
    }
    player.updatedAt=this.clock();
    await this.commit(state);
    const table=leaderboard(state),me=table.find(row=>row.id===player.id)!;
    return reply(200,{ok:true,points:me.points,answered:me.answered,rank:me.rank,total:table.length});
  }

  /** Called by the storage alarm: forget everything once the retention window has passed. */
  async sweep():Promise<boolean>{
    const state=await this.store.load();
    if(state.lastActivity&&this.clock()-state.lastActivity>=RETENTION_MS){await this.store.wipe();return true;}
    return false;
  }
}
