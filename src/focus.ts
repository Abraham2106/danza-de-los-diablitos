import type {Point} from './navigation';
import {canStand} from './navigation';
import type {Artwork,Navigation,Vec3} from './data';
import {Mesh,Raycaster,Vector3,type Object3D,type Intersection} from 'three';
export interface CameraPose {point:Point;yaw:number;pitch:number;}
const copyPose=(pose:CameraPose):CameraPose=>({point:{...pose.point},yaw:pose.yaw,pitch:pose.pitch});

/** Preserve the first pre-focus pose even when the visitor switches between works. */
export class FocusSession {
  private origin?:CameraPose;
  private sequence=0;
  get active():boolean{return this.origin!==undefined;}
  get token():number{return this.sequence;}
  begin(pose:CameraPose):number{this.origin??=copyPose(pose);return ++this.sequence;}
  restore():{pose:CameraPose;token:number}|undefined{
    if(!this.origin)return;
    const pose=copyPose(this.origin);this.origin=undefined;
    return {pose,token:++this.sequence};
  }
  isCurrent(token:number):boolean{return token===this.sequence;}
}

/** Perspective fit uses the complete viewport height and the usable panel-free region. */
export function framingDistance(width:number,height:number,fovDegrees:number,viewportHeight:number,availableWidth:number,availableHeight:number):number{
  const tangent=Math.tan(fovDegrees*Math.PI/360);
  const horizontal=width*viewportHeight/(2*tangent*Math.max(160,availableWidth));
  const vertical=height*viewportHeight/(2*tangent*Math.max(160,availableHeight));
  return Math.max(width>=2.5?3:2.4,horizontal*1.2,vertical*1.2);
}

/** Positive frustum offset projects the target axis to the left of the side panel. */
export function focusViewOffset(viewportWidth:number,panelLeft:number):number{
  return Math.max(0,(viewportWidth-Math.max(0,Math.min(viewportWidth,panelLeft)))/2);
}

/** Sample the full visible painting, not just a center ray that can miss edge occlusion. */
export function artworkProbes(artwork:Pick<Artwork,'position'|'rotation'|'width'|'height'>):Vec3[]{
  const right={x:Math.cos(artwork.rotation),z:-Math.sin(artwork.rotation)};
  const samples:Vec3[]=[];
  for(const vertical of [0,-.46,.46])for(const horizontal of [0,-.46,.46])samples.push([
    artwork.position[0]+right.x*artwork.width*horizontal,
    artwork.position[1]+artwork.height*vertical,
    artwork.position[2]+right.z*artwork.width*horizontal,
  ]);
  return samples;
}

/** Search laterally as well as backwards, preferring the shortest fully visible view. */
export function selectArtworkView(artwork:Pick<Artwork,'position'|'rotation'>,nav:Navigation,distance:number,isVisible:(point:Point)=>boolean):Point|null{
  const normal={x:Math.sin(artwork.rotation),z:Math.cos(artwork.rotation)};
  const right={x:Math.cos(artwork.rotation),z:-Math.sin(artwork.rotation)};
  const candidates:{point:Point;distance:number;lateral:number}[]=[];
  for(const extra of [0,.35,.7,1.1,1.6,2.2])for(const lateral of [0,.45,-.45,.75,-.75,1.05,-1.05,1.4,-1.4,1.8,-1.8,2.3,-2.3,2.8,-2.8]){
    candidates.push({point:{x:artwork.position[0]+normal.x*(distance+extra)+right.x*lateral,z:artwork.position[2]+normal.z*(distance+extra)+right.z*lateral},distance:Math.hypot(distance+extra,lateral),lateral});
  }
  candidates.sort((a,b)=>a.distance-b.distance||Math.abs(a.lateral)-Math.abs(b.lateral));
  for(const candidate of candidates)if(canStand(candidate.point,nav)&&isVisible(candidate.point))return candidate.point;
  return null;
}

/** Validate real scene geometry against nine probes across the painting surface. */
export function hasArtworkSight(artwork:Pick<Artwork,'id'|'position'|'rotation'|'width'|'height'>,candidate:Point,objects:Object3D[],identify:(object:Object3D)=>string|undefined,intersect?:(ray:Raycaster)=>Intersection[]):boolean{
  const ray=new Raycaster();const origin=new Vector3(candidate.x,1.65,candidate.z);
  for(const probe of artworkProbes(artwork)){
    const target=new Vector3(...probe);const length=origin.distanceTo(target);ray.set(origin,target.sub(origin).normalize());ray.near=.01;ray.far=length+.08;
    for(const hit of intersect?intersect(ray):ray.intersectObjects(objects,false)){
      let visible=true;for(let ancestor:Object3D|null=hit.object;ancestor;ancestor=ancestor.parent)if(!ancestor.visible){visible=false;break;}
      if(!visible||!(hit.object instanceof Mesh))continue;
      const mesh=hit.object;const material=Array.isArray(mesh.material)?mesh.material[hit.face?.materialIndex??0]:mesh.material;
      if(!material||material.visible===false||material.opacity<.25)continue;
      if(identify(hit.object)===artwork.id)break;
      if(hit.distance<length-.025)return false;
      break;
    }
  }
  return true;
}
