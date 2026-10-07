import {Box3,Mesh,Vector3,type Object3D,type Raycaster,type Intersection} from 'three';

/** Static world bounds reject misses; accepted meshes still use exact triangle tests. */
export class StaticRayIndex {
  private entries:{object:Object3D;bounds:Box3}[];
  private candidates:Object3D[]=[];
  private intersection=new Vector3();
  constructor(objects:Object3D[]){
    this.entries=objects.map(object=>{
      const bounds=new Box3();
      if(object instanceof Mesh){
        object.geometry.computeBoundingBox();
        bounds.copy(object.geometry.boundingBox!).applyMatrix4(object.matrixWorld);
        // Keep grazing rays inside the broad phase despite floating-point rounding.
        bounds.expandByScalar(1e-5);
      }else bounds.setFromObject(object);
      return {object,bounds};
    });
  }
  intersect(raycaster:Raycaster):Intersection[]{
    this.candidates.length=0;
    for(const {object,bounds} of this.entries){
      const entry=raycaster.ray.intersectBox(bounds,this.intersection);
      if(!entry)continue;
      if(!bounds.containsPoint(raycaster.ray.origin)&&entry.distanceTo(raycaster.ray.origin)>raycaster.far)continue;
      this.candidates.push(object);
    }
    return raycaster.intersectObjects(this.candidates,false);
  }
}

/** Coalesce events into one frame; continue only while the caller has visible work. */
export class FramePump {
  private pending=false;
  constructor(private render:(time:number)=>boolean,private schedule:(callback:FrameRequestCallback)=>number=requestAnimationFrame){}
  request():void{
    if(this.pending)return;
    this.pending=true;
    this.schedule(time=>{this.pending=false;if(this.render(time))this.request();});
  }
}
