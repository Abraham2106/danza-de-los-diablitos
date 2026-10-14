import {describe,it,expect} from 'vitest';
import {PerspectiveCamera,Mesh,PlaneGeometry,BoxGeometry,MeshBasicMaterial,Raycaster,Vector3} from 'three';
import {isArtworkObservable} from '../src/focus';
const art={id:'photo',position:[0,1.7,0] as [number,number,number],rotation:0,width:2.4,height:1.8};
function camera(x=0,z=3,yaw=0){const view=new PerspectiveCamera(65,1.6,.08,180);view.position.set(x,1.65,z);view.rotation.y=yaw;view.updateMatrixWorld();return view;}
const painting=new Mesh(new PlaneGeometry(2.4,1.8),new MeshBasicMaterial());painting.position.set(...art.position);painting.updateMatrixWorld(true);
const identify=(ob:unknown)=>ob===painting?'photo':undefined;
describe('Campo de observación de la narración',()=>{
  it('permite caminar cerca conservando la foto visible',()=>{
    const intersect=(ray:Raycaster)=>ray.intersectObject(painting);
    expect(isArtworkObservable(art,camera(),identify,intersect)).toBe(true);
    expect(isArtworkObservable(art,camera(.3,3.4),identify,intersect)).toBe(true);
  });
  it('detiene al mirar fuera, estar detrás o alejarse del rango',()=>{
    const intersect=(ray:Raycaster)=>ray.intersectObject(painting);
    expect(isArtworkObservable(art,camera(0,3,Math.PI),identify,intersect)).toBe(false);
    expect(isArtworkObservable(art,camera(0,8.1),identify,intersect)).toBe(false);
    expect(isArtworkObservable(art,camera(0,-3,Math.PI),identify,intersect)).toBe(false);
  });
  it('considera las paredes que ocultan la fotografía',()=>{
    const wall=new Mesh(new BoxGeometry(6,5,.2),new MeshBasicMaterial());wall.position.set(0,2,1);wall.updateMatrixWorld(true);
    expect(isArtworkObservable(art,camera(),identify,ray=>ray.intersectObjects([painting,wall]))).toBe(false);
    wall.visible=false;
    expect(isArtworkObservable(art,camera(),identify,ray=>ray.intersectObjects([painting,wall]))).toBe(true);
  });
});
