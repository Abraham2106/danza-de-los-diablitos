import * as THREE from 'three';

/** Capture static gallery reflections once; traversal does not render extra cameras. */
export function finishFloor(model:THREE.Group,scene:THREE.Scene,renderer:THREE.WebGLRenderer):void {
  const floors:{mesh:THREE.Mesh;material:THREE.MeshStandardMaterial;room:string}[]=[];
  const glass:{mesh:THREE.Mesh;material:THREE.MeshPhysicalMaterial;room:string}[]=[];
  model.traverse(object=>{
    if(!(object instanceof THREE.Mesh))return;
    const materials=Array.isArray(object.material)?object.material:[object.material];
    if(materials.length===1&&materials[0] instanceof THREE.MeshPhysicalMaterial&&materials[0].transmission>.5){
      const material=materials[0].clone();object.material=material;
      const name=String(object.userData.exportSource??object.name);
      glass.push({mesh:object,material,room:name.includes('Pane_A_')?'a':name.includes('Pane_B_')?'b':'corridor'});
      material.roughness=.025;material.ior=1.45;material.thickness=.012;
    }
    for(const material of materials)if(material instanceof THREE.MeshStandardMaterial&&material.name.startsWith('WEB_BakedFloor_')){
      const room=material.name.includes('room-a')?'a':material.name.includes('room-b')?'b':'corridor';
      floors.push({mesh:object,material,room});
      material.emissiveIntensity=.62;material.color.setRGB(.025,.027,.026);
      material.roughness=.27;
    }
  });
  if(!floors.length)return;
  const visibility=floors.map(f=>f.mesh.visible);floors.forEach(f=>f.mesh.visible=false);
  const pmrem=new THREE.PMREMGenerator(renderer);
  try{
    for(const [room,x,z] of [['a',-14,4.8],['b',14,4.8],['corridor',-3.5,0]] as const){
      const cube=new THREE.WebGLCubeRenderTarget(256,{type:THREE.HalfFloatType});
      const probe=new THREE.CubeCamera(.08,180,cube);probe.position.set(x,1.4,z);
      probe.update(renderer,scene);
      const reflection=pmrem.fromCubemap(cube.texture);
      for(const floor of floors.filter(f=>f.room===room)){
        floor.material.envMap=reflection.texture;floor.material.envMapIntensity=1.15;floor.material.needsUpdate=true;
      }
      for(const pane of glass.filter(g=>g.room===room)){
        pane.material.envMap=reflection.texture;pane.material.envMapIntensity=.65;pane.material.needsUpdate=true;
      }
      cube.dispose();
    }
  }finally{floors.forEach((f,i)=>f.mesh.visible=visibility[i]);pmrem.dispose();}
}
