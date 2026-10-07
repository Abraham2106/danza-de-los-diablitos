import * as THREE from 'three';
import type {Navigation} from './data';

type Vertex = {x:number; values:number[][]};

/** Clip static triangles, interpolating every attribute (including baked UVs). */
export function trimWallSkin(geometry:THREE.BufferGeometry,matrix:THREE.Matrix4,
  limits:{minX:number;maxX:number;minZ:number;maxZ:number;minSpan:number}):THREE.BufferGeometry {
  const source=geometry.index?geometry.toNonIndexed():geometry;
  const attributes=Object.entries(source.attributes);
  const position=source.getAttribute('position');
  const output=attributes.map(()=>[] as number[]);
  let changed=false;
  const clip=(polygon:Vertex[],edge:number,keepAbove:boolean):Vertex[]=>{
    const result:Vertex[]=[];
    for(let i=0;i<polygon.length;i++){
      const a=polygon[i],b=polygon[(i+1)%polygon.length];
      const insideA=keepAbove?a.x>=edge:a.x<=edge,insideB=keepAbove?b.x>=edge:b.x<=edge;
      if(insideA)result.push(a);
      if(insideA!==insideB){
        const t=(edge-a.x)/(b.x-a.x);
        result.push({x:edge,values:a.values.map((values,j)=>values.map((v,k)=>v+(b.values[j][k]-v)*t))});
      }
    }
    return result;
  };
  const point=new THREE.Vector3();
  for(let start=0;start<position.count;start+=3){
    const world=[0,1,2].map(i=>point.fromBufferAttribute(position,start+i).applyMatrix4(matrix).clone());
    let polygon:Vertex[]=[0,1,2].map(i=>({x:world[i].x,values:attributes.map(([,attribute])=>
      Array.from({length:attribute.itemSize},(_,k)=>attribute.getComponent(start+i,k)))}));
    const xs=world.map(p=>p.x);
    // Only the long corridor surfaces overlap room end caps. Room caps, the
    // column and the ceiling share this exported mesh and must remain intact.
    if(Math.max(...xs)-Math.min(...xs)>limits.minSpan && world.every(p=>p.z>=limits.minZ-.02&&p.z<=limits.maxZ+.02)){
      if(Math.min(...xs)<limits.minX||Math.max(...xs)>limits.maxX){
        polygon=clip(clip(polygon,limits.minX,true),limits.maxX,false);changed=true;
      }
    }
    for(let i=1;i<polygon.length-1;i++)for(const vertex of [polygon[0],polygon[i],polygon[i+1]])
      vertex.values.forEach((values,j)=>output[j].push(...values));
  }
  if(!changed){if(source!==geometry)source.dispose();return geometry;}
  const result=new THREE.BufferGeometry();
  attributes.forEach(([name,attribute],i)=>result.setAttribute(name,new THREE.Float32BufferAttribute(output[i],attribute.itemSize,attribute.normalized)));
  // GLTF architecture primitives use one material, with no groups or morphs.
  result.normalizeNormals();result.computeBoundingBox();result.computeBoundingSphere();
  if(source!==geometry)source.dispose();
  return result;
}

/** Butt-join the south corridor wall to the rooms instead of overlapping it. */
export function joinDoorwayWalls(model:THREE.Group,navigation:Navigation):void {
  const corridor=navigation.walkable.find(a=>
    navigation.walkable.some(left=>left.x1<a.x1&&left.x2>=a.x1&&left.x2<a.x2)&&
    navigation.walkable.some(right=>right.x2>a.x2&&right.x1<=a.x2&&right.x1>a.x1));
  if(!corridor)return;
  const south=navigation.boxes.find(b=>b.minX<=corridor.x1&&b.maxX>=corridor.x2&&Math.abs(b.minZ-corridor.z2)<.01&&b.maxZ-b.minZ<1);
  const left=navigation.boxes.find(b=>b.minX<corridor.x1&&b.maxX>corridor.x1&&Math.abs(b.minZ-corridor.z2)<.01&&b.maxZ-b.minZ>1);
  const right=navigation.boxes.find(b=>b.minX<corridor.x2&&b.maxX>corridor.x2&&Math.abs(b.minZ-corridor.z2)<.01&&b.maxZ-b.minZ>1);
  if(!south||!left||!right)return;
  model.updateMatrixWorld(true);
  model.traverse(object=>{
    if(!(object instanceof THREE.Mesh)||Array.isArray(object.material))return;
    const name=object.material.name;
    if(!['WEB_Baked_corridor','WEB_SmoothDetail_corridor_4','WEB_SmoothDetail_corridor_1'].includes(name))return;
    const skirt=name.endsWith('_1'),overhang=skirt ? .004 : 0;
    object.geometry=trimWallSkin(object.geometry,object.matrixWorld,{minX:left.maxX-overhang,maxX:right.minX+overhang,minZ:south.minZ-overhang,maxZ:south.maxZ+overhang,minSpan:(corridor.x2-corridor.x1)/2});
  });
}
