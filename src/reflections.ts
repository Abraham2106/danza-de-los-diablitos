import * as THREE from 'three';
import {Reflector} from 'three/addons/objects/Reflector.js';
import type {Navigation} from './data';

export interface ReflectionController {setReduced(reduced:boolean):void;}
type Rectangle={x1:number;x2:number;z1:number;z2:number};

// Subtract overlaps before drawing translucent floor patches, avoiding doubled seams.
function subtract(a:Rectangle,b:Rectangle):Rectangle[]{
  const x1=Math.max(a.x1,b.x1),x2=Math.min(a.x2,b.x2),z1=Math.max(a.z1,b.z1),z2=Math.min(a.z2,b.z2);
  if(x1>=x2||z1>=z2)return[a];
  return[{x1:a.x1,x2:x1,z1:a.z1,z2:a.z2},{x1:x2,x2:a.x2,z1:a.z1,z2:a.z2},
    {x1,x2,z1:a.z1,z2:z1},{x1,x2,z1:z2,z2:a.z2}].filter(r=>r.x2-r.x1>1e-5&&r.z2-r.z1>1e-5);
}
export function floorPatches(rectangles:Rectangle[]):Rectangle[]{
  const patches:Rectangle[]=[];
  for(const rectangle of rectangles){let next=[rectangle];for(const previous of patches)next=next.flatMap(r=>subtract(r,previous));patches.push(...next);}
  return patches;
}
function rectanglesGeometry(rectangles:{x1:number;x2:number;y1:number;y2:number}[]):THREE.BufferGeometry{
  const vertices:number[]=[];
  for(const r of rectangles)vertices.push(r.x1,r.y1,0,r.x2,r.y1,0,r.x2,r.y2,0,r.x1,r.y1,0,r.x2,r.y2,0,r.x1,r.y2,0);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.computeVertexNormals();return geometry;
}
const vertexShader=`
uniform mat4 textureMatrix;
varying vec4 vProjected;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
void main(){
  vec4 world=modelMatrix*vec4(position,1.0);
  vWorldPosition=world.xyz;vWorldNormal=normalize(mat3(modelMatrix)*normal);
  vProjected=textureMatrix*vec4(position,1.0);
  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
}`;
const fragmentShader=`
uniform sampler2D tDiffuse;
uniform vec3 color;
uniform vec2 texel;
uniform float blurRadius;
uniform float baseOpacity;
uniform float grazingOpacity;
varying vec4 vProjected;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
vec3 sampleReflection(vec2 uv){return texture2D(tDiffuse,clamp(uv,vec2(.001),vec2(.999)),blurRadius).rgb;}
void main(){
  vec2 uv=vProjected.xy/vProjected.w;
  vec3 reflection=sampleReflection(uv);
  float facing=clamp(abs(dot(normalize(cameraPosition-vWorldPosition),normalize(vWorldNormal))),0.,1.);
  float opacity=baseOpacity+grazingOpacity*pow(1.-facing,4.);
  gl_FragColor=vec4(reflection*color,opacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Three shared planes capture geometry from the visitor's current viewpoint. */
export function addPlanarReflections(model:THREE.Group,scene:THREE.Scene,nav:Navigation):ReflectionController{
  const floors:THREE.Mesh[]=[],glass:THREE.Mesh[]=[];
  const windows:{box:THREE.Box3;corridor:boolean}[]=[];
  model.traverse(object=>{
    if(!(object instanceof THREE.Mesh))return;
    const materials=Array.isArray(object.material)?object.material:[object.material];
    if(materials.some(m=>m.name.startsWith('WEB_BakedFloor_'))){floors.push(object);for(const m of materials)if(m instanceof THREE.MeshStandardMaterial)m.envMapIntensity=.35;}
    if(materials.some(m=>m instanceof THREE.MeshPhysicalMaterial&&m.transmission>.5)){
      glass.push(object);const source=String(object.userData.exportSource??object.name);
      windows.push({box:new THREE.Box3().setFromObject(object),corridor:source.includes('Corridor')});
      for(const m of materials)if(m instanceof THREE.MeshStandardMaterial)m.envMapIntensity=.4;
    }
  });
  const mirrors:Reflector[]=[];const resetCaptures:(()=>void)[]=[];let reduced=false;
  function mirror(geometry:THREE.BufferGeometry,name:string,floor:boolean):Reflector{
    const width=floor?1024:768,height=Math.round(width*innerHeight/innerWidth);
    const reflector=new Reflector(geometry,{textureWidth:width,textureHeight:height,clipBias:.002,multisample:0,shader:{
      name:'SoftPlanarReflection',vertexShader,fragmentShader,uniforms:{
        tDiffuse:{value:null},textureMatrix:{value:new THREE.Matrix4()},color:{value:new THREE.Color(floor?0xe8eceb:0xffffff)},
        texel:{value:new THREE.Vector2(1/width,1/height)},blurRadius:{value:floor?3:0},
        baseOpacity:{value:floor?.015:.025},grazingOpacity:{value:floor?.30:.58}
      }
    }});
    reflector.name=name;
    // Filter the reflected image as a continuous surface instead of offset copies of thin edges.
    const reflectionTexture=reflector.getRenderTarget().texture;
    reflectionTexture.generateMipmaps=true;reflectionTexture.minFilter=THREE.LinearMipmapLinearFilter;
    const surface=reflector.material as THREE.ShaderMaterial;surface.transparent=true;surface.depthWrite=false;
    reflector.renderOrder=floor?1:2;
    const capture=reflector.onBeforeRender;let previous='',lastTime=-Infinity;
    resetCaptures.push(()=>{previous='';lastTime=-Infinity;});
    reflector.onBeforeRender=(renderer,currentScene,camera,geometry,material,group)=>{
      const key=camera.matrixWorld.elements.join(',')+camera.projectionMatrix.elements.join(',');
      const now=performance.now();if(key===previous||now-lastTime<(reduced?66:30))return;
      const hidden:THREE.Object3D[]=[...mirrors,...glass,...(floor?floors:[])];
      const visibility=hidden.map(o=>o.visible);hidden.forEach(o=>o.visible=false);
      try{capture.call(reflector,renderer,currentScene,camera,geometry,material,group);previous=key;lastTime=now;}
      finally{hidden.forEach((o,i)=>o.visible=visibility[i]);}
    };
    mirrors.push(reflector);scene.add(reflector);return reflector;
  }
  const patches=floorPatches(nav.walkable);
  const floor=mirror(rectanglesGeometry(patches.map(r=>({x1:r.x1,x2:r.x2,y1:-r.z2,y2:-r.z1}))),'FloorReflection',true);
  floor.rotation.x=-Math.PI/2;floor.position.y=.004;
  for(const corridor of [false,true]){
    const panes=windows.filter(w=>w.corridor===corridor);
    if(!panes.length)continue;
    const r=mirror(rectanglesGeometry(panes.map(({box})=>({x1:box.min.x,x2:box.max.x,y1:box.min.y-2.4,y2:box.max.y-2.4}))),corridor?'CorridorGlassReflection':'HallGlassReflection',false);
    r.position.set(0,2.4,Math.max(...panes.map(w=>w.box.max.z))+.002);
  }
  return{setReduced(value){reduced=value;for(const r of mirrors){const width=reduced?512:r===floor?1024:768,height=Math.round(width*innerHeight/innerWidth);r.getRenderTarget().setSize(width,height);(r.material as THREE.ShaderMaterial).uniforms.texel.value.set(1/width,1/height);}resetCaptures.forEach(reset=>reset());}};
}
