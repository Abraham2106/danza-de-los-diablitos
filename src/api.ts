/**
 * Client for the online class activity (see worker/index.ts). The museum still runs fully on each person's
 * computer; this only talks to the server about who the host is and what results to keep.
 * When the page is served without that server (a static host, or no connection) every call reports `offline`
 * and the activity falls back to the local, single-computer mode.
 */
import type {Row} from '../worker/game';

export interface GameStatus{open:boolean;gameId?:string;players:number;max:number}
export interface HostResults{game:{id:string;status:'open'|'closed';startedAt:number;endedAt?:number}|null;max:number;players:Row[];retentionMs:number}
export interface Joined{playerId:string;token:string;name:string;gameId:string}
export interface ScoreReply{points:number;answered:number;rank:number;total:number}
export interface RawAnswer{question:number;choice:number;ms:number}

export type ApiResult<T>={ok:true;data:T}|{ok:false;offline:boolean;status:number;error:string;message:string;retryAfterMs?:number;attemptsLeft?:number};

const BASE:string=(import.meta.env?.VITE_API_BASE as string|undefined)??'';

async function call<T>(method:'GET'|'POST',path:string,body?:unknown,token?:string):Promise<ApiResult<T>>{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
  try{
    const response=await fetch(`${BASE}${path}`,{
      method,signal:controller.signal,cache:'no-store',
      headers:{...(body!==undefined?{'content-type':'application/json'}:{}),...(token?{authorization:`Bearer ${token}`}:{})},
      body:body!==undefined?JSON.stringify(body):undefined,
    });
    if(!(response.headers.get('content-type')??'').includes('application/json'))
      return {ok:false,offline:true,status:response.status,error:'sin_servidor',message:'No hay conexión con el servidor del juego.'};
    const json=await response.json() as Record<string,unknown>;
    if(response.ok&&json.ok===true){const {ok:_ok,...data}=json;return {ok:true,data:data as T};}
    return {ok:false,offline:false,status:response.status,error:String(json.error??'error'),message:String(json.message??'Algo salió mal.'),
      retryAfterMs:typeof json.retryAfterMs==='number'?json.retryAfterMs:undefined,attemptsLeft:typeof json.attemptsLeft==='number'?json.attemptsLeft:undefined};
  }catch{
    return {ok:false,offline:true,status:0,error:'sin_servidor',message:'No hay conexión con el servidor del juego.'};
  }finally{clearTimeout(timer);}
}

export const api={
  status:()=>call<GameStatus>('GET','/api/game'),
  hostLogin:(code:string)=>call<{token:string;expiresAt:number}>('POST','/api/host/login',{code}),
  hostStart:(token:string)=>call<{game:NonNullable<HostResults['game']>}>('POST','/api/host/start',{},token),
  hostEnd:(token:string)=>call<{game:NonNullable<HostResults['game']>}>('POST','/api/host/end',{},token),
  hostResults:(token:string)=>call<HostResults>('GET','/api/host/results',undefined,token),
  join:(name:string,token?:string)=>call<Joined>('POST','/api/join',{name,token}),
  score:(token:string,answers:RawAnswer[])=>call<ScoreReply>('POST','/api/score',{answers},token),
};
