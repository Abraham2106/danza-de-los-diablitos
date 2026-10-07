import * as THREE from 'three';
import type {Navigation} from './data';

const sourceName=(object:THREE.Object3D)=>String(object.userData.exportSource??object.name.replace(/_WEB$/,''));

/** Replace the two sculptural studies; remove only the plant beside photo 3. */
export function replaceFurnishings(model:THREE.Group,mask:THREE.Group,navigation:Navigation):void{
  model.updateMatrixWorld(true);
  const remove:THREE.Object3D[]=[],plinths:THREE.Object3D[]=[];
  let plantCenter:THREE.Vector3|undefined;
  model.traverse(object=>{
    const source=sourceName(object);
    if(/^Decor_Plinth_[01]$/.test(source))plinths.push(object);
    if(source==='Decor_Planter_01')plantCenter=new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3());
    if(/^(?:Decor_Sculpture_|Decor_BorucaOwlMask_|OwlMask_Decor_Plinth_)/.test(source)||/^Decor_(?:Planter|Soil)_01$/.test(source)||/^Decor_(?:Stem|Leaf)_1_\d+$/.test(source))remove.push(object);
  });
  remove.forEach(object=>object.removeFromParent());
  // The pot's old obstacle must disappear along with the visible pot and leaves.
  if(plantCenter){const center=plantCenter;navigation.orientedBoxes=navigation.orientedBoxes?.filter(box=>Math.abs(box.x-center.x)>.01||Math.abs(box.z-center.z)>.01);}
  for(const plinth of plinths){
    const bounds=new THREE.Box3().setFromObject(plinth),center=bounds.getCenter(new THREE.Vector3());
    const instance=mask.clone(true);instance.name=`OwlMask_${sourceName(plinth)}`;
    instance.userData.galleryRole='mask';
    model.add(instance);instance.position.copy(model.worldToLocal(new THREE.Vector3(center.x,bounds.max.y,center.z)));
    instance.quaternion.copy(model.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),center.x<0?Math.PI/2:-Math.PI/2)));
    instance.traverse(object=>{if(object instanceof THREE.Mesh){object.castShadow=true;object.receiveShadow=true;
      const materials=Array.isArray(object.material)?object.material:[object.material];
      materials.forEach(material=>{if(material instanceof THREE.MeshStandardMaterial)material.envMapIntensity=.35;});
    }});
  }
}
