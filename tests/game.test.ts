import {describe,it,expect,beforeEach} from 'vitest';
import {GameService,emptyState,sanitizeName,safeEqual,leaderboard,MAX_PLAYERS,PODIUM_SIZE,RETENTION_MS,HOST_TOKEN_TTL,IP_FAILS,GLOBAL_FAILS,LOGIN_WINDOW,type State,type Store} from '../worker/game';
import {QUESTIONS,SECTIONS,QUESTION_TIME,questionsOf} from '../src/quiz';

class MemoryStore implements Store{
  state:State=emptyState();wiped=0;
  async load(){return structuredClone(this.state);}
  async save(state:State){this.state=structuredClone(state);}
  async wipe(){this.state=emptyState();this.wiped++;}
}
let store:MemoryStore,now:number,counter:number,secret:string|undefined,service:GameService;
const make=()=>new GameService(store,()=>secret,()=>now,()=>`t${String(++counter).padStart(8,'0')}`.padEnd(32,'x'));
const right=(q:number)=>QUESTIONS[q].answer;
async function hostToken():Promise<string>{
  const login=await service.hostLogin('1.1.1.1','2106');return login.body.token as string;
}
async function openGame():Promise<string>{const token=await hostToken();await service.hostStart(token);return token;}

beforeEach(()=>{store=new MemoryStore();now=1_000_000;counter=0;secret='2106';service=make();});

describe('Código del anfitrión',()=>{
  it('lo comprueba en el servidor y entrega una sesión solo con el código correcto',async()=>{
    const ok=await service.hostLogin('1.1.1.1','2106');
    expect(ok.status).toBe(200);expect(typeof ok.body.token).toBe('string');
    // Each guess comes from a different address so the per-address lock does not interfere.
    for(const [i,wrong] of ['0000','2107','',null,undefined,2106,'21060','abcd'].entries()){
      const bad=await service.hostLogin(`2.2.2.${i}`,wrong);
      expect(bad.status).toBe(401);expect(bad.body.token).toBeUndefined();
    }
  });
  it('no funciona si el servidor no tiene un código configurado, y no usa uno por defecto',async()=>{
    for(const missing of [undefined,'','abcd','12']){
      secret=missing;service=make();
      expect((await service.hostLogin('1.1.1.1','2106')).status).toBe(503);
      expect((await service.hostLogin('1.1.1.1','0000')).status).toBe(503);
    }
  });
  it('bloquea a una dirección tras demasiados intentos, incluso con el código correcto',async()=>{
    for(let i=0;i<IP_FAILS;i++)expect((await service.hostLogin('9.9.9.9','0000')).status).toBe(401);
    const locked=await service.hostLogin('9.9.9.9','2106');
    expect(locked.status).toBe(429);expect(locked.body.retryAfterMs).toBeGreaterThan(0);
    expect((await service.hostLogin('8.8.8.8','2106')).status).toBe(200);
  });
  it('bloquea todos los intentos cuando se supera el límite global, y se libera con el tiempo',async()=>{
    for(let i=0;i<GLOBAL_FAILS;i++)await service.hostLogin(`10.0.0.${i}`,'0000');
    expect((await service.hostLogin('3.3.3.3','2106')).status).toBe(429);
    now+=LOGIN_WINDOW+1;
    expect((await service.hostLogin('3.3.3.3','2106')).status).toBe(200);
  });
  it('compara sin detenerse en la primera diferencia',()=>{
    expect(safeEqual('2106','2106')).toBe(true);expect(safeEqual('2106','2107')).toBe(false);expect(safeEqual('210','2106')).toBe(false);
  });
  it('la sesión del anfitrión caduca',async()=>{
    const token=await hostToken();
    expect((await service.hostResults(token)).status).toBe(200);
    now+=HOST_TOKEN_TTL+1;
    expect((await service.hostResults(token)).status).toBe(401);
  });
});

describe('Quién puede iniciar y terminar la partida',()=>{
  it('solo el anfitrión autenticado inicia, termina y ve los resultados',async()=>{
    expect((await service.hostStart(undefined)).status).toBe(401);
    expect((await service.hostStart('inventado')).status).toBe(401);
    expect((await service.hostEnd('inventado')).status).toBe(401);
    expect((await service.hostResults('inventado')).status).toBe(401);
    const token=await hostToken();
    expect((await service.hostStart(token)).status).toBe(200);
    expect((await service.hostStart(token)).status).toBe(409);
    expect((await service.status()).body.open).toBe(true);
    expect((await service.hostEnd(token)).status).toBe(200);
    expect((await service.hostEnd(token)).status).toBe(409);
    expect((await service.status()).body.open).toBe(false);
  });
  it('una partida nueva reemplaza los resultados de la anterior',async()=>{
    const token=await openGame();
    await service.join('Ana',undefined);await service.hostEnd(token);
    expect(leaderboard(store.state)).toHaveLength(1);
    await service.hostStart(token);
    expect(leaderboard(store.state)).toHaveLength(0);
  });
});

describe('Entrar a la partida',()=>{
  it('no deja entrar si no hay una partida abierta',async()=>{
    expect((await service.join('Ana',undefined)).status).toBe(409);
    const token=await openGame();await service.hostEnd(token);
    expect((await service.join('Ana',undefined)).status).toBe(409);
  });
  it('registra al estudiante y devuelve una sesión; volver con ella recupera al mismo jugador',async()=>{
    await openGame();
    const first=await service.join('  Ana   López ',undefined);
    expect(first.status).toBe(200);expect(first.body.name).toBe('Ana López');
    const again=await service.join('otro nombre',first.body.token as string);
    expect(again.body.playerId).toBe(first.body.playerId);expect(again.body.name).toBe('Ana López');
    expect(Object.keys(store.state.players)).toHaveLength(1);
  });
  it('rechaza nombres vacíos, repetidos (sin importar tildes ni mayúsculas) y una sala llena',async()=>{
    await openGame();
    expect((await service.join('   ',undefined)).status).toBe(400);
    expect((await service.join(undefined,undefined)).status).toBe(400);
    await service.join('José',undefined);
    expect((await service.join('jose',undefined)).status).toBe(409);
    for(let i=1;i<MAX_PLAYERS;i++)expect((await service.join(`Persona ${i}`,undefined)).status).toBe(200);
    expect((await service.join('Una más',undefined)).body.error).toBe('sala_llena');
  });
  it('limpia el nombre: sin etiquetas, sin caracteres de control y con límite de largo',()=>{
    expect(sanitizeName('<b>Luis</b>')).toBe('bLuis/b');
    expect(sanitizeName('A\u0000B​C')).toBe('ABC');
    expect(sanitizeName('x'.repeat(100))).toHaveLength(24);
    expect(sanitizeName(42)).toBe('');
  });
});

describe('Puntajes',()=>{
  async function player(name='Ana'){await openGame();const joined=await service.join(name,undefined);return joined.body.token as string;}
  it('recalcula los puntos en el servidor a partir de las respuestas y no acepta puntos enviados',async()=>{
    const token=await player();
    const q=questionsOf(2)[0];
    const sent=await service.score(token,[{question:q,choice:right(q),ms:0,points:999999,correct:true}]);
    expect(sent.status).toBe(200);
    expect(sent.body.points).toBe(SECTIONS[2].multiplier*1000);
    expect(sent.body.answered).toBe(1);
  });
  it('una respuesta lenta vale menos que una rápida y un error no suma',async()=>{
    const token=await player();
    const [a,b]=questionsOf(0);
    await service.score(token,[{question:a,choice:right(a),ms:QUESTION_TIME},{question:b,choice:(right(b)+1)%4,ms:100}]);
    const row=leaderboard(store.state)[0];
    expect(row.points).toBe(500);expect(row.correct).toBe(1);expect(row.answered).toBe(2);
  });
  it('cada pregunta cuenta una sola vez: enviar otra vez no cambia el puntaje',async()=>{
    const token=await player();const q=questionsOf(0)[0];
    await service.score(token,[{question:q,choice:(right(q)+1)%4,ms:500}]);
    const again=await service.score(token,[{question:q,choice:right(q),ms:0}]);
    expect(again.body.points).toBe(0);expect(again.body.answered).toBe(1);
  });
  it('rechaza datos inválidos o una sesión desconocida',async()=>{
    const token=await player();
    for(const bad of [[{question:99,choice:0,ms:0}],[{question:0,choice:7,ms:0}],[{question:0,choice:0,ms:-5}],[{question:0,choice:0,ms:QUESTION_TIME+1}],[{question:0.5,choice:0,ms:0}],[{question:0,choice:0,ms:Number.NaN}],'texto',null,[null],Array.from({length:7},()=>({question:0,choice:0,ms:0}))])
      expect((await service.score(token,bad)).status).toBe(400);
    expect((await service.score('falso',[])).status).toBe(401);
    expect((await service.score(undefined,[])).status).toBe(401);
  });
  it('deja de aceptar puntajes cuando el anfitrión termina la partida, pero conserva los resultados',async()=>{
    const host=await openGame();const joined=await service.join('Ana',undefined);const token=joined.body.token as string;
    const q=questionsOf(0)[0];
    await service.score(token,[{question:q,choice:right(q),ms:0}]);
    await service.hostEnd(host);
    expect((await service.score(token,[{question:questionsOf(0)[1],choice:0,ms:0}])).body.error).toBe('partida_terminada');
    const results=await service.hostResults(host);
    expect((results.body.players as {points:number}[])[0].points).toBe(1000);
  });
});

describe('Ranking',()=>{
  it('ordena por puntos, luego preguntas respondidas, y numera los puestos; nunca expone la sesión de nadie',async()=>{
    const host=await openGame();
    const names=['Ana','Beto','Caro'];const tokens:string[]=[];
    for(const name of names)tokens.push((await service.join(name,undefined)).body.token as string);
    const [q0,q1]=questionsOf(0);const [q2]=questionsOf(1);
    await service.score(tokens[0],[{question:q0,choice:right(q0),ms:0}]);
    await service.score(tokens[1],[{question:q0,choice:right(q0),ms:0},{question:q2,choice:right(q2),ms:0}]);
    await service.score(tokens[2],[{question:q0,choice:right(q0),ms:0},{question:q1,choice:(right(q1)+1)%4,ms:0}]);
    const rows=(await service.hostResults(host)).body.players as {name:string;rank:number;points:number;answered:number}[];
    expect(rows.map(r=>r.name)).toEqual(['Beto','Caro','Ana']);
    expect(rows.map(r=>r.rank)).toEqual([1,2,3]);
    expect(rows.map(r=>r.answered)).toEqual([2,2,1]);
    expect(JSON.stringify(rows)).not.toContain('token');
    const mine=await service.score(tokens[2],[]);
    expect(mine.body.rank).toBe(2);expect(mine.body.total).toBe(3);
  });
});

describe('Conservación de los resultados',()=>{
  it('los borra solo cuando pasaron dos días sin actividad',async()=>{
    await openGame();await service.join('Ana',undefined);
    expect(await service.sweep()).toBe(false);
    now+=RETENTION_MS-1;expect(await service.sweep()).toBe(false);
    expect(store.wiped).toBe(0);
    now+=2;expect(await service.sweep()).toBe(true);
    expect(store.wiped).toBe(1);expect(leaderboard(store.state)).toHaveLength(0);
  });
  it('la actividad reciente renueva el plazo',async()=>{
    const host=await openGame();await service.join('Ana',undefined);
    expect(host).toBeTruthy();
    // A day and a half later the host logs in again and ends the game: that activity renews the window.
    now+=RETENTION_MS-1000;
    const again=await hostToken();await service.hostEnd(again);
    now+=RETENTION_MS-1000;expect(await service.sweep()).toBe(false);
    now+=1001;expect(await service.sweep()).toBe(true);
  });
});

describe('Podio final',()=>{
  async function playedGame(count:number){
    const host=await openGame();const tokens:string[]=[];
    for(let i=0;i<count;i++){
      const token=(await service.join(`Jugador ${i+1}`,undefined)).body.token as string;tokens.push(token);
      // Player 1 answers best, the last player answers worst: a clear order.
      const [q]=questionsOf(0);
      await service.score(token,[{question:q,choice:i===count-1?(right(q)+1)%4:right(q),ms:i*1000}]);
    }
    return {host,tokens};
  }
  it('no se muestra mientras la partida sigue abierta ni antes de empezar',async()=>{
    expect((await service.podium(undefined)).status).toBe(409);
    await openGame();
    expect((await service.podium(undefined)).status).toBe(409);
  });
  it('al terminar, cualquiera ve los cinco primeros con nombre y puntos, sin sesiones',async()=>{
    const {host}=await playedGame(8);await service.hostEnd(host);
    const reply=await service.podium(undefined);
    expect(reply.status).toBe(200);
    const finalists=reply.body.finalists as {rank:number;name:string;points:number}[];
    expect(finalists).toHaveLength(PODIUM_SIZE);
    expect(finalists.map(f=>f.rank)).toEqual([1,2,3,4,5]);
    expect(finalists[0].name).toBe('Jugador 1');
    expect(finalists[0].points).toBeGreaterThan(finalists[1].points);
    expect(reply.body.total).toBe(8);expect(reply.body.me).toBeNull();
    expect(JSON.stringify(reply.body)).not.toContain('token');
    expect(JSON.stringify(reply.body)).not.toContain('Jugador 6');
  });
  it('a quien manda su sesión le devuelve su propio puesto, incluso fuera del podio',async()=>{
    const {host,tokens}=await playedGame(8);await service.hostEnd(host);
    const last=await service.podium(tokens[7]);
    expect(last.body.me).toMatchObject({rank:8,total:8,points:0});
    const first=await service.podium(tokens[0]);
    expect(first.body.me).toMatchObject({rank:1,total:8});
    expect((await service.podium('falso')).body.me).toBeNull();
  });
  it('con menos de cinco jugadores muestra solo a los que hay',async()=>{
    const {host}=await playedGame(2);await service.hostEnd(host);
    expect(((await service.podium(undefined)).body.finalists as unknown[]).length).toBe(2);
  });
  it('sin jugadores devuelve una lista vacía',async()=>{
    const host=await openGame();await service.hostEnd(host);
    const reply=await service.podium(undefined);
    expect(reply.status).toBe(200);expect(reply.body.finalists).toEqual([]);expect(reply.body.total).toBe(0);
  });
});
