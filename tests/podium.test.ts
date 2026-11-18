import {describe,it,expect} from 'vitest';
import {buildTimeline} from '../src/podium';

const kinds=(count:number,runners:boolean)=>buildTimeline(count,runners).map(b=>`${b.kind}${b.place?`:${b.place}`:''}`);

describe('Secuencia del podio',()=>{
  it('con cinco jugadores revela tercero, segundo y primero, y después los puestos cuarto y quinto',()=>{
    expect(kinds(5,true)).toEqual(['call:3','reveal:3','call:2','reveal:2','call:1','reveal:1','runners','final']);
  });
  it('los momentos van en orden y el primer lugar se hace esperar más que los demás',()=>{
    const beats=buildTimeline(3,true);
    const times=beats.map(b=>b.at);
    expect([...times].sort((a,b)=>a-b)).toEqual(times);
    const at=(kind:string,place:number)=>beats.find(b=>b.kind===kind&&b.place===place)!.at;
    const suspense=at('reveal',1)-at('call',1),normal=at('reveal',3)-at('call',3);
    expect(suspense).toBeGreaterThan(normal);
    expect(beats.find(b=>b.kind==='runners')!.at).toBeGreaterThan(at('reveal',1));
    expect(beats.find(b=>b.kind==='final')!.at).toBeGreaterThan(beats.find(b=>b.kind==='runners')!.at);
  });
  it('sin cuarto ni quinto lugar no hay bloque gris y el cierre llega antes',()=>{
    expect(kinds(3,false)).toEqual(['call:3','reveal:3','call:2','reveal:2','call:1','reveal:1','final']);
    const withRunners=buildTimeline(3,true).at(-1)!.at,without=buildTimeline(3,false).at(-1)!.at;
    expect(without).toBeLessThan(withRunners);
  });
  it('con dos jugadores empieza por el segundo y con uno solo anuncia al primero',()=>{
    expect(kinds(2,false)).toEqual(['call:2','reveal:2','call:1','reveal:1','final']);
    expect(kinds(1,false)).toEqual(['call:1','reveal:1','final']);
    expect(buildTimeline(1,false)[0].text).toBe('¡El primer lugar es…!');
    expect(buildTimeline(3,true)[0].text).toBe('Tercer lugar…');
  });
  it('sin jugadores solo muestra el cierre',()=>{
    expect(kinds(0,false)).toEqual(['final']);
  });
});
