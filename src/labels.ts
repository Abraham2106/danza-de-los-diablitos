import * as THREE from 'three';
import type {Artwork} from './data';

export const LABEL_WIDTH=.80,LABEL_HEIGHT=.48,LABEL_GAP=.16;

export function wrapLabel(text:string,measure:(value:string)=>number,maxWidth:number):string[]{
  const lines:string[]=[];let line='';
  for(const word of text.trim().split(/\s+/)){
    const next=line?`${line} ${word}`:word;
    if(line&&measure(next)>maxWidth){lines.push(line);line=word;}else line=next;
  }
  if(line)lines.push(line);return lines;
}

export function labelPosition(art:Artwork):THREE.Vector3 {
  const right=new THREE.Vector3(Math.cos(art.rotation),0,-Math.sin(art.rotation));
  const normal=new THREE.Vector3(Math.sin(art.rotation),0,Math.cos(art.rotation));
  return new THREE.Vector3(...art.position).addScaledVector(right,art.width/2+LABEL_GAP+LABEL_WIDTH/2)
    .addScaledVector(normal,.022).setY(1.45);
}

/** Woven-belt stripes of a Boruca textile, shared by the placards and the interface. */
export const FAJA=['#1f2859','#3547b8','#f7b731','#9b3fa8','#f7b731','#3547b8','#e5502f','#3547b8','#f7b731','#9b3fa8','#f7b731','#3547b8','#1f2859'];

/** Readable physical placards, generated once; no DOM overlays or frame work. */
export async function addArtworkLabels(model:THREE.Group,artworks:Artwork[],anisotropy:number,chapter:(art:Artwork)=>string=()=>'Boruca'):Promise<void>{
  await Promise.all(['800 80px "Unbounded Variable"','600 42px "Josefin Sans Variable"','italic 300 54px "Josefin Sans Variable"'].map(font=>document.fonts.load(font)));
  model.traverse(object=>{if(/^Label(?:Text|Board)_art-\d+/.test(object.name))object.visible=false;});
  const faceGeometry=new THREE.PlaneGeometry(LABEL_WIDTH,LABEL_HEIGHT);
  const boardGeometry=new THREE.BoxGeometry(LABEL_WIDTH+.012,LABEL_HEIGHT+.012,.014);
  const boardMaterial=new THREE.MeshStandardMaterial({color:0x1f2859,roughness:.8});
  model.updateMatrixWorld(true);
  artworks.forEach((art,index)=>{
    const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=720;
    const ctx=canvas.getContext('2d')!;
    ctx.fillStyle='#fff9ef';ctx.fillRect(0,0,1200,720);
    // Left woven band: the textile stripes run along the placard edge.
    const band=56,stripe=band/FAJA.length;FAJA.forEach((color,i)=>{ctx.fillStyle=color;ctx.fillRect(i*stripe,0,stripe+1,720);});
    const x=band+60;
    ctx.fillStyle='#e5502f';ctx.font='800 80px "Unbounded Variable"';ctx.fillText(String(index+1).padStart(2,'0'),x,124);
    const numberWidth=ctx.measureText(String(index+1).padStart(2,'0')).width;
    ctx.fillStyle='#5b6089';ctx.font='600 42px "Josefin Sans Variable"';ctx.fillText(chapter(art).toUpperCase(),x+numberWidth+28,116);
    ctx.fillStyle='#1f2859';ctx.font='700 66px "Unbounded Variable"';
    const title=wrapLabel(art.title,t=>ctx.measureText(t).width,1200-x-60);
    let y=246;for(const line of title.slice(0,3)){ctx.fillText(line,x,y);y+=80;}
    ctx.fillStyle='#5b6089';ctx.font='italic 300 54px "Josefin Sans Variable"';
    y+=18;for(const line of wrapLabel(art.artist,t=>ctx.measureText(t).width,1200-x-60)){ctx.fillText(line,x,y);y+=62;}
    ctx.fillStyle='#3547b8';ctx.font='600 38px "Josefin Sans Variable"';ctx.fillText('CLIC PARA ABRIR LA FICHA',x,664);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=anisotropy;
    const label=new THREE.Group();label.name=`ReadableLabel_${art.id}`;label.userData.artworkId=art.id;
    const face=new THREE.Mesh(faceGeometry,new THREE.MeshBasicMaterial({map:texture,toneMapped:false}));
    face.name=`ReadableLabelFace_${art.id}`;
    const board=new THREE.Mesh(boardGeometry,boardMaterial);board.position.z=-.0075;label.add(board,face);
    // Attach with a world-space pose even if a future export transforms its root.
    model.add(label);label.position.copy(model.worldToLocal(labelPosition(art)));
    label.quaternion.copy(model.getWorldQuaternion(new THREE.Quaternion()).invert()
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),art.rotation)));
  });
}
