/**
 * Online layer for the class activity. The page keeps running on each person's computer; this Worker only
 * decides who the host is and stores results. One Durable Object ("sala") holds the single room, so all
 * reads and writes are serialised and 30–40 people can never race each other.
 */
import {DurableObject} from 'cloudflare:workers';
import {GameService,emptyState,RETENTION_MS,type Reply,type State,type Store} from './game';

export interface Env{
  GAME:DurableObjectNamespace<GameRoom>;
  /** Secret. Set with `npx wrangler secret put HOST_CODE`, or in .dev.vars locally. Never committed. */
  HOST_CODE?:string;
}

class DurableStore implements Store{
  constructor(private ctx:DurableObjectState){}
  async load():Promise<State>{return (await this.ctx.storage.get<State>('state'))??emptyState();}
  async save(state:State):Promise<void>{
    await this.ctx.storage.put('state',state);
    // The alarm wipes everything once nobody has touched the room for the retention window.
    await this.ctx.storage.setAlarm(Date.now()+RETENTION_MS);
  }
  async wipe():Promise<void>{await this.ctx.storage.deleteAll();await this.ctx.storage.deleteAlarm();}
}

export class GameRoom extends DurableObject<Env>{
  private service:GameService;
  constructor(ctx:DurableObjectState,env:Env){
    super(ctx,env);
    this.service=new GameService(new DurableStore(ctx),()=>env.HOST_CODE);
  }
  status():Promise<Reply>{return this.service.status();}
  hostLogin(ip:string,code:unknown):Promise<Reply>{return this.service.hostLogin(ip,code);}
  hostStart(token:string|undefined):Promise<Reply>{return this.service.hostStart(token);}
  hostEnd(token:string|undefined):Promise<Reply>{return this.service.hostEnd(token);}
  hostResults(token:string|undefined):Promise<Reply>{return this.service.hostResults(token);}
  podium(token:string|undefined):Promise<Reply>{return this.service.podium(token);}
  join(name:unknown,token:string|undefined):Promise<Reply>{return this.service.join(name,token);}
  score(token:string|undefined,answers:unknown):Promise<Reply>{return this.service.score(token,answers);}
  async alarm():Promise<void>{await this.service.sweep();}
}

const MAX_BODY=4096;
const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
const send=(reply:Reply)=>new Response(JSON.stringify(reply.body),{status:reply.status,headers});
const problem=(status:number,error:string,message:string)=>send({status,body:{ok:false,error,message}});

async function readJson(request:Request):Promise<Record<string,unknown>|undefined>{
  const text=await request.text();
  if(text.length>MAX_BODY)return undefined;
  if(!text)return {};
  try{const value=JSON.parse(text);return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:undefined;}
  catch{return undefined;}
}
const bearer=(request:Request)=>{
  const header=request.headers.get('authorization')??'';
  return header.startsWith('Bearer ')?header.slice(7).trim()||undefined:undefined;
};

export default {
  async fetch(request:Request,env:Env):Promise<Response>{
    const url=new URL(request.url);
    if(!url.pathname.startsWith('/api/'))return new Response('No encontrado',{status:404});
    const room=env.GAME.getByName('sala');
    const route=`${request.method} ${url.pathname.replace(/\/+$/,'')}`;
    try{
      if(route==='GET /api/game')return send(await room.status());
      const known=['POST /api/host/login','POST /api/host/start','POST /api/host/end','GET /api/host/results','GET /api/podium','POST /api/join','POST /api/score'];
      if(!known.includes(route))return problem(known.some(r=>r.endsWith(url.pathname))?405:404,'no_encontrado','Ruta no encontrada.');
      const body=request.method==='POST'?await readJson(request):{};
      if(!body)return problem(400,'datos_invalidos','El cuerpo de la petición no es válido.');
      switch(route){
        case 'POST /api/host/login':return send(await room.hostLogin(request.headers.get('cf-connecting-ip')??'local',body.code));
        case 'POST /api/host/start':return send(await room.hostStart(bearer(request)));
        case 'POST /api/host/end':return send(await room.hostEnd(bearer(request)));
        case 'GET /api/host/results':return send(await room.hostResults(bearer(request)));
        case 'GET /api/podium':return send(await room.podium(bearer(request)));
        case 'POST /api/join':return send(await room.join(body.name,typeof body.token==='string'?body.token:undefined));
        case 'POST /api/score':return send(await room.score(bearer(request),body.answers));
      }
    }catch(error){
      console.error('api error',error);
      return problem(500,'error_interno','Algo salió mal en el servidor. Intenta de nuevo.');
    }
    return problem(404,'no_encontrado','Ruta no encontrada.');
  },
};
