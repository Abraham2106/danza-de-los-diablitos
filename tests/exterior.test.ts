import {describe,expect,it} from 'vitest';
import {BoxGeometry,DirectionalLight,Group,Mesh,MeshBasicMaterial,PCFSoftShadowMap,type WebGLRenderer} from 'three';
import {finishExterior} from '../src/exterior';

describe('Profundidad estable en las esquinas',()=>{
  it('prioriza módulos coplanares sin un desplazamiento que crezca al mirar de lado',()=>{
    const previousDocument=globalThis.document;
    const gradient={addColorStop(){}};
    const context={createLinearGradient:()=>gradient,createRadialGradient:()=>gradient,fillRect(){},fillStyle:''};
    globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>context})} as unknown as Document;
    try{
      const model=new Group();const materials=['room-a','room-b','corridor'].map(group=>{
        const owner=new Group();owner.name=`Architecture_${group}`;
        const material=new MeshBasicMaterial({color:0xc6c7c4});material.name=`WEB_Baked_${group}`;
        const mesh=new Mesh(new BoxGeometry(),material);owner.add(mesh);model.add(owner);return material;
      });
      const renderer={capabilities:{getMaxAnisotropy:()=>4},shadowMap:{enabled:false,type:PCFSoftShadowMap,autoUpdate:true,needsUpdate:false}} as unknown as WebGLRenderer;
      finishExterior(model,renderer,new DirectionalLight());
      for(const material of materials){
        expect(material.polygonOffset).toBe(true);
        expect(material.polygonOffsetFactor).toBe(0);
        expect(material.polygonOffsetUnits).toBeLessThan(0);
        expect(Math.abs(material.polygonOffsetUnits)).toBeLessThanOrEqual(3);
        expect(material.color.getHex()).toBe(0xc6c7c4);
      }
    }finally{globalThis.document=previousDocument;}
  });
});
