import {describe,expect,it} from 'vitest';
import {PerspectiveCamera,Vector3,Mesh,MeshBasicMaterial,CylinderGeometry,BoxGeometry,PlaneGeometry,DoubleSide,type Object3D} from 'three';
import {FocusSession,focusViewOffset,framingDistance,hasArtworkSight,selectArtworkView,type CameraPose} from '../src/focus';
import type {Navigation} from '../src/data';
const origin:CameraPose={point:{x:-8,z:1},yaw:1.2,pitch:.15};
describe('Foco de las obras',()=>{
  it('conserva la primera vista al cambiar de obra',()=>{
    const session=new FocusSession();session.begin(origin);session.begin({point:{x:15,z:5},yaw:0,pitch:0});
    expect(session.restore()?.pose).toEqual(origin);expect(session.active).toBe(false);
  });
  it('copia la posición original para que cambios del recorrido no la muten',()=>{
    const session=new FocusSession();const pose:CameraPose={point:{x:1,z:2},yaw:3,pitch:.2};session.begin(pose);pose.point.x=10;
    expect(session.restore()?.pose.point).toEqual({x:1,z:2});
  });
  it('invalida transiciones antiguas al cerrar o cambiar de obra',()=>{
    const session=new FocusSession();const first=session.begin(origin);const second=session.begin(origin);
    expect(session.isCurrent(first)).toBe(false);expect(session.isCurrent(second)).toBe(true);
    const restore=session.restore()!;expect(session.isCurrent(second)).toBe(false);expect(session.isCurrent(restore.token)).toBe(true);
    session.begin(origin);expect(session.isCurrent(restore.token)).toBe(false);
  });
  it('restaura una sola vez y evita retornos duplicados',()=>{
    const session=new FocusSession();session.begin(origin);expect(session.restore()?.pose).toEqual(origin);const token=session.token;
    expect(session.restore()).toBeUndefined();expect(session.token).toBe(token);
  });
  it('encuadra una obra grande tanto en altura como en ancho disponible',()=>{
    const w=1440,h=900,availableW=900,availableH=700,width=5,height=3,fov=65;
    const distance=framingDistance(width,height,fov,h,availableW,availableH),tan=Math.tan(fov*Math.PI/360);
    expect(width*h/(2*distance*tan)).toBeLessThanOrEqual(availableW/1.2+.001);
    expect(height*h/(2*distance*tan)).toBeLessThanOrEqual(availableH/1.2+.001);
  });
  it('desplaza la proyección del cuadro al centro de la región libre a la izquierda',()=>{
    const w=1440,h=900,panelLeft=1047;const camera=new PerspectiveCamera(65,w/h,.08,180);
    camera.setViewOffset(w,h,focusViewOffset(w,panelLeft),0,w,h);camera.updateMatrixWorld();
    const projected=new Vector3(0,0,-3).project(camera);const screenX=(projected.x+1)*w/2;
    expect(screenX).toBeCloseTo(panelLeft/2,5);
    camera.clearViewOffset();expect((new Vector3(0,0,-3).project(camera).x+1)*w/2).toBeCloseTo(w/2,5);
  });
  it('requiere alejarse más al estrechar el espacio disponible y nunca devuelve infinito',()=>{
    expect(framingDistance(5,2,65,900,400,700)).toBeGreaterThan(framingDistance(5,2,65,900,950,700));
    expect(Number.isFinite(framingDistance(5,2,65,900,0,0))).toBe(true);
  });
});

describe('Visibilidad real del cuadro',()=>{
  const artwork={id:'art-001',position:[-18,1.7,8.845] as [number,number,number],rotation:Math.PI,width:3,height:2.1};
  const navigation:Navigation={boxes:[],circles:[{x:-18,z:6,r:.28}],walkable:[{x1:-22,x2:-6,z1:-9,z2:9}],spawn:{position:[-8,1.65,0],yaw:0}};
  const identify=(object:Object3D)=>object.userData.artworkId;
  const createScene=()=>{
    const painting=new Mesh(new PlaneGeometry(3,2.1),new MeshBasicMaterial({side:DoubleSide}));painting.position.set(...artwork.position);painting.rotation.y=Math.PI;painting.userData.artworkId=artwork.id;painting.updateMatrixWorld();
    const pillar=new Mesh(new CylinderGeometry(.28,.28,4.8,32),new MeshBasicMaterial());pillar.position.set(-18,2.4,6);pillar.updateMatrixWorld();
    return {painting,pillar};
  };
  it('rechaza el punto caminable que mira a través de un pilar',()=>{
    const {painting,pillar}=createScene();expect(hasArtworkSight(artwork,{x:-18,z:5.145},[painting,pillar],identify)).toBe(false);
  });
  it('encuentra una vista lateral próxima sin modificar ni esconder el pilar',()=>{
    const {painting,pillar}=createScene();const target=selectArtworkView(artwork,navigation,3,p=>hasArtworkSight(artwork,p,[painting,pillar],identify));
    expect(target).not.toBeNull();expect(Math.abs(target!.x+18)).toBeGreaterThan(.5);expect(hasArtworkSight(artwork,target!,[painting,pillar],identify)).toBe(true);expect(pillar.visible).toBe(true);expect(pillar.position.x).toBe(-18);
  });
  it('detecta oclusión en un borde aunque el centro esté libre',()=>{
    const {painting}=createScene();const obstacle=new Mesh(new BoxGeometry(.45,3,.35),new MeshBasicMaterial());obstacle.position.set(-18.55,1.7,7);obstacle.updateMatrixWorld();
    expect(hasArtworkSight(artwork,{x:-18,z:5.845},[painting,obstacle],identify)).toBe(false);
    expect(hasArtworkSight(artwork,{x:-18,z:5.845},[painting],identify)).toBe(true);
  });
  it('devuelve ausencia de vista libre cuando una barrera tapa todos los candidatos',()=>{
    const {painting}=createScene();const barrier=new Mesh(new BoxGeometry(30,10,.2),new MeshBasicMaterial());barrier.position.set(-18,3,8.6);barrier.updateMatrixWorld();
    expect(selectArtworkView(artwork,navigation,3,p=>hasArtworkSight(artwork,p,[painting,barrier],identify))).toBeNull();
  });
});
