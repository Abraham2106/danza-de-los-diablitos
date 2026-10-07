import * as THREE from 'three';

function canvasTexture(width:number,height:number,paint:(ctx:CanvasRenderingContext2D)=>void):THREE.CanvasTexture {
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  paint(canvas.getContext('2d')!);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  return texture;
}

/** A quiet daylight horizon, separate from the interior's reflection environment. */
export function daylightSky():THREE.CanvasTexture {
  const texture=canvasTexture(1024,512,ctx=>{
    const sky=ctx.createLinearGradient(0,0,0,512);
    sky.addColorStop(0,'#7798b2');sky.addColorStop(.28,'#b4cbd9');
    sky.addColorStop(.50,'#e7ece9');sky.addColorStop(.66,'#d4ded4');sky.addColorStop(1,'#98aa98');
    ctx.fillStyle=sky;ctx.fillRect(0,0,1024,512);
    for(const [x,y,w] of [[140,120,220],[620,95,290],[850,180,220]]){
      const cloud=ctx.createRadialGradient(x,y,0,x,y,w);
      cloud.addColorStop(0,'rgba(255,255,255,.23)');cloud.addColorStop(1,'rgba(255,255,255,0)');
      ctx.fillStyle=cloud;ctx.fillRect(x-w,y-w,w*2,w*2);
    }
  });
  texture.mapping=THREE.EquirectangularReflectionMapping;return texture;
}

function projectedUV(mesh:THREE.Mesh,ground:boolean):void {
  const geometry=mesh.geometry.clone();geometry.computeBoundingBox();
  const box=geometry.boundingBox!,position=geometry.getAttribute('position'),normal=geometry.getAttribute('normal');
  const uv=new Float32Array(position.count*2);
  for(let i=0;i<position.count;i++){
    const x=position.getX(i),y=position.getY(i),z=position.getZ(i);
    const side=!ground&&Math.abs(normal.getX(i))>.5;
    uv[i*2]=ground?(x-box.min.x)/Math.max(.01,box.max.x-box.min.x):side?(z-box.min.z)/Math.max(.01,box.max.z-box.min.z):(x-box.min.x)/Math.max(.01,box.max.x-box.min.x);
    uv[i*2+1]=ground?(z-box.min.z)/Math.max(.01,box.max.z-box.min.z):(y-box.min.y)/Math.max(.01,box.max.y-box.min.y);
  }
  geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));mesh.geometry=geometry;
}

export function finishExterior(model:THREE.Group,renderer:THREE.WebGLRenderer,sun:THREE.DirectionalLight):void {
  const lawn=canvasTexture(512,512,ctx=>{
    ctx.fillStyle='#70865f';ctx.fillRect(0,0,512,512);
    // Large tonal patches create planted ground without grain or moiré.
    for(let i=0;i<18;i++){
      const x=(i*173)%512,y=(i*97)%512,r=70+(i%4)*20;
      const patch=ctx.createRadialGradient(x,y,0,x,y,r);
      patch.addColorStop(0,i%2?'rgba(166,172,130,.22)':'rgba(52,78,47,.17)');
      patch.addColorStop(1,'rgba(110,135,96,0)');ctx.fillStyle=patch;ctx.fillRect(x-r,y-r,r*2,r*2);
    }
  });
  lawn.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());
  const facade=canvasTexture(256,512,ctx=>{
    ctx.fillStyle='#bbc3c1';ctx.fillRect(0,0,256,512);
    for(let row=0;row<10;row++)for(let column=0;column<5;column++){
      ctx.fillStyle=(row+column)%4===0?'#a2b0b4':'#96a7ad';
      ctx.fillRect(15+column*48,18+row*49,26,29);
      ctx.fillStyle='#d0d6d3';ctx.fillRect(15+column*48,47+row*49,26,2);
    }
  });
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
  sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
  // Move the light back along the same direction to include the garden in its frustum.
  sun.position.multiplyScalar(5);
  const shadowCamera=sun.shadow.camera;
  shadowCamera.left=-82;shadowCamera.right=82;shadowCamera.top=70;shadowCamera.bottom=-70;
  shadowCamera.near=.5;shadowCamera.far=300;shadowCamera.updateProjectionMatrix();
  sun.shadow.bias=-.00015;sun.shadow.normalBias=.08;
  model.traverse(object=>{
    if(!(object instanceof THREE.Mesh))return;
    let owner:THREE.Object3D|null=object;
    while(owner&&!owner.userData.exportSource)owner=owner.parent;
    const source=String(owner?.userData.exportSource??object.name);
    const materials=Array.isArray(object.material)?object.material:[object.material];
    // Deterministic depth offsets resolve coplanar room/corridor seams.
    const architecture=`${object.name} ${owner?.name??''} ${materials.map(m=>m.name).join(' ')}`;
    const group=architecture.includes('room-a')?1:architecture.includes('room-b')?2:architecture.includes('corridor')?3:0;
    if(group)for(const material of materials){material.polygonOffset=true;material.polygonOffsetFactor=group;material.polygonOffsetUnits=group;}
    if(source.startsWith('Exterior_TreeAsset_')||source.startsWith('Exterior_Shrub_')){
      object.castShadow=true;
      for(const m of materials)if(m instanceof THREE.MeshStandardMaterial)m.envMapIntensity=.28;
    }
    if(source==='Exterior_Ground'){
      projectedUV(object,true);
      object.material=new THREE.MeshStandardMaterial({map:lawn,color:0xffffff,roughness:1,envMapIntensity:.15});
      object.receiveShadow=true;
    }else if(source.startsWith('Exterior_DistantArchitecture_')){
      projectedUV(object,false);
      object.material=new THREE.MeshStandardMaterial({map:facade,roughness:.95,envMapIntensity:.15});
    }else if(source.startsWith('Exterior_Terrace_')||source==='Exterior_Path'||source.startsWith('Exterior_GardenBed_')){
      object.material=materials.map(m=>m.clone());object.receiveShadow=true;
    }
  });
}
