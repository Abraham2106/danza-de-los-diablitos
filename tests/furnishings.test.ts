import {describe,it,expect} from 'vitest';
import {BoxGeometry,Group,Mesh,MeshStandardMaterial,Box3,Vector3} from 'three';
import {replaceFurnishings} from '../src/furnishings';
import type {Navigation} from '../src/data';

describe('Máscaras y planta retirada',()=>{
  it('retira solo la planta señalada y las esculturas, y coloca dos copias sobre sus pedestales',()=>{
    const model=new Group();
    const add=(name:string,x:number,y:number,z:number)=>{const mesh=new Mesh(new BoxGeometry(1,1,1),new MeshStandardMaterial());mesh.name=name+'_WEB';mesh.userData.exportSource=name;mesh.position.set(x,y,z);model.add(mesh);return mesh;};
    add('Decor_Planter_01',-7.4,.33,7.5);add('Decor_Soil_01',-7.4,.665,7.5);
    for(let i=0;i<9;i++){add(`Decor_Leaf_1_${i}`,0,0,0);add(`Decor_Stem_1_${i}`,0,0,0);}
    const otherPlant=add('Decor_Planter_00',-20.8,.33,-7.5);const otherLeaf=add('Decor_Leaf_0_0',0,0,0);
    const plinth=add('Decor_Plinth_0',-8.5,.34,0);add('Decor_Plinth_1',18,.34,-1.8);
    add('Decor_Sculpture_0_0',0,0,0);add('Decor_Sculpture_1_1',0,0,0);
    const mask=new Group();const body=new Mesh(new BoxGeometry(),new MeshStandardMaterial());mask.add(body);
    const nav={boxes:[],circles:[],walkable:[],spawn:{position:[0,1.65,0],yaw:0},orientedBoxes:[
      {x:-7.4,z:7.5,width:.81,depth:.81,rotation:0},{x:-20.8,z:-7.5,width:.81,depth:.81,rotation:0}]} as Navigation;
    model.updateMatrixWorld(true);const top=new Box3().setFromObject(plinth).max.y;
    replaceFurnishings(model,mask,nav);model.updateMatrixWorld(true);
    expect(model.children.some(o=>o.name.startsWith('Decor_Sculpture_'))).toBe(false);
    expect(model.children.some(o=>o.name.startsWith('Decor_Leaf_1_'))).toBe(false);
    expect(otherPlant.parent).toBe(model);expect(otherLeaf.parent).toBe(model);
    expect(nav.orientedBoxes).toHaveLength(1);expect(nav.orientedBoxes![0].x).toBe(-20.8);
    const copies=model.children.filter(o=>o.userData.galleryRole==='mask');expect(copies).toHaveLength(2);
    expect(copies[0].getWorldPosition(new Vector3()).y).toBe(top);
    const a=copies[0].children[0] as Mesh,b=copies[1].children[0] as Mesh;
    expect(a.geometry).toBe(b.geometry);expect(a.material).toBe(b.material);
    expect(a.castShadow).toBe(true);
    expect(new Vector3(0,0,1).applyQuaternion(copies[0].quaternion).x).toBeCloseTo(1);
    expect(new Vector3(0,0,1).applyQuaternion(copies[1].quaternion).x).toBeCloseTo(-1);
    replaceFurnishings(model,mask,nav);
    expect(model.children.filter(o=>o.userData.galleryRole==='mask')).toHaveLength(2);
    expect(nav.orientedBoxes).toHaveLength(1);
  });
});
