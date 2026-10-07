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

/** Readable physical placards, generated once; no DOM overlays or frame work. */
export async function addArtworkLabels(model:THREE.Group,artworks:Artwork[],anisotropy:number):Promise<void>{
  await document.fonts.load('600 88px "DM Sans"');
  await document.fonts.load('400 64px "DM Sans"');
  model.traverse(object=>{if(/^Label(?:Text|Board)_art-\d+/.test(object.name))object.visible=false;});
  const faceGeometry=new THREE.PlaneGeometry(LABEL_WIDTH,LABEL_HEIGHT);
  const boardGeometry=new THREE.BoxGeometry(LABEL_WIDTH+.012,LABEL_HEIGHT+.012,.014);
  const boardMaterial=new THREE.MeshStandardMaterial({color:0xe8e5df,roughness:.9});
  model.updateMatrixWorld(true);
  artworks.forEach((art,index)=>{
    const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=720;
    const ctx=canvas.getContext('2d')!;
    ctx.fillStyle='#f6f3ed';ctx.fillRect(0,0,1200,720);
    ctx.fillStyle='#50615f';ctx.font='500 46px "DM Sans"';ctx.fillText(`FOTOGRAFÍA ${String(index+1).padStart(2,'0')}`,64,82);
    ctx.fillStyle='#172326';ctx.font='600 88px "DM Sans"';
    const title=wrapLabel(art.title,t=>ctx.measureText(t).width,1072);
    let y=188;for(const line of title){ctx.fillText(line,64,y);y+=104;}
    ctx.fillStyle='#2f3c3e';ctx.font='400 64px "DM Sans"';
    y+=30;for(const line of wrapLabel(art.artist,t=>ctx.measureText(t).width,1072)){ctx.fillText(line,64,y);y+=80;}
    ctx.fillStyle='#455653';ctx.font='400 58px "DM Sans"';ctx.fillText('Boruca · Costa Rica',64,656);
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
