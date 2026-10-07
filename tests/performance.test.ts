import {describe,expect,it,vi} from 'vitest';
import {BoxGeometry,Group,Mesh,MeshBasicMaterial,Raycaster,Vector3,DoubleSide} from 'three';
import {FramePump,StaticRayIndex} from '../src/performance';

describe('Selección acelerada sin cambiar los impactos',()=>{
  const material=new MeshBasicMaterial({side:DoubleSide});
  it('conserva impactos y orden con geometría girada, escalada y grupos',()=>{
    const group=new Group();group.position.set(2,1,-4);group.rotation.y=.6;
    const objects=Array.from({length:80},(_,i)=>{
      const mesh=new Mesh(new BoxGeometry(1,1,1),material);
      mesh.position.set(i%10-5,Math.floor(i/10)*.6,-i*.2);mesh.scale.set(1,.8,1.3);mesh.rotation.z=.2;group.add(mesh);return mesh;
    });group.updateMatrixWorld(true);const index=new StaticRayIndex(objects);
    for(let i=0;i<200;i++){
      const ray=new Raycaster(new Vector3(0,2,3),new Vector3(Math.sin(i)*.5,Math.cos(i)*.3,-1).normalize(),.01,30);
      const expected=ray.intersectObjects(objects,false),actual=index.intersect(ray);
      expect(actual.map(hit=>[hit.object.uuid,hit.distance,hit.faceIndex])).toEqual(expected.map(hit=>[hit.object.uuid,hit.distance,hit.faceIndex]));
    }
  });
  it('mantiene impactos cuando el origen está dentro de una caja y respeta far',()=>{
    const box=new Mesh(new BoxGeometry(4,4,4),material);box.updateMatrixWorld();const index=new StaticRayIndex([box]);
    for(const far of [1,3]){
      const ray=new Raycaster(new Vector3(),new Vector3(0,0,-1),0,far);
      expect(index.intersect(ray)).toEqual(ray.intersectObjects([box],false));
    }
  });
  it('evita consultar triángulos de objetos fuera del rayo',()=>{
    const box=new Mesh(new BoxGeometry(1,1,1),material);box.position.set(10,0,0);box.updateMatrixWorld();
    const spy=vi.spyOn(box,'raycast');const index=new StaticRayIndex([box]);
    expect(index.intersect(new Raycaster(new Vector3(),new Vector3(0,0,-1)))).toEqual([]);expect(spy).not.toHaveBeenCalled();
  });
});

describe('Renderizado a demanda',()=>{
  it('llama al planificador nativo con Window como receptor',()=>{
    const callbacks:FrameRequestCallback[]=[];
    const windowLike={requestAnimationFrame:function(this:unknown,callback:FrameRequestCallback){
      if(this!==windowLike)throw new TypeError('requestAnimationFrame requires Window');
      return callbacks.push(callback);
    }};
    vi.stubGlobal('window',windowLike);vi.stubGlobal('requestAnimationFrame',windowLike.requestAnimationFrame);
    try{
      const render=vi.fn(()=>false);const pump=new FramePump(render);
      expect(()=>pump.request()).not.toThrow();expect(callbacks).toHaveLength(1);
      callbacks[0](16);expect(render).toHaveBeenCalledWith(16);
    }finally{vi.unstubAllGlobals();}
  });
  it('agrupa eventos, continúa durante movimiento y vuelve a dormir',()=>{
    const callbacks:FrameRequestCallback[]=[];let moving=false;const render=vi.fn(()=>moving);
    const pump=new FramePump(render,callback=>callbacks.push(callback));
    for(let i=0;i<600;i++)pump.request();expect(callbacks).toHaveLength(1);
    callbacks.shift()!(0);expect(render).toHaveBeenCalledTimes(1);expect(callbacks).toHaveLength(0);
    moving=true;pump.request();callbacks.shift()!(16);expect(callbacks).toHaveLength(1);
    moving=false;callbacks.shift()!(32);expect(callbacks).toHaveLength(0);
    pump.request();expect(callbacks).toHaveLength(1);
  });
});
