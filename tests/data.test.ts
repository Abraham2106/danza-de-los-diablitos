import { describe, expect, it } from 'vitest';
import { parseExhibition } from '../src/data';
const fixture=()=>({schemaVersion:1,title:'Luz y color',subtitle:'Una visita',source:'Museo',model:'models/gallery.glb',renders:['renders/01-sala-a.png'],navigation:{boxes:[],circles:[],walkable:[{x1:-10,x2:10,z1:-10,z2:10}],spawn:{position:[0,1.65,0],yaw:0}},artworks:[{id:'art-001',title:'Obra',artist:'Artista',year:'1900',description:'Una descripción',source:'Museo',image:'artworks/art-001.jpg',position:[0,1.7,4],rotation:Math.PI,width:2,height:1,frame:'wood',observation:{position:[0,1.65,1],yaw:0}}]});
describe('Contrato de exposición',()=>{
  it('conserva los datos de una exposición compatible',()=>{expect(parseExhibition(fixture()).artworks[0].id).toBe('art-001');});
  it('rechaza versiones incompatibles',()=>{const data=fixture();data.schemaVersion=2;expect(()=>parseExhibition(data)).toThrow();});
  it('rechaza identificadores de obras repetidos',()=>{const data=fixture();data.artworks.push({...data.artworks[0]});expect(()=>parseExhibition(data)).toThrow();});
  it('rechaza rutas que salen de la exposición',()=>{const data=fixture();data.artworks[0].image='../outside.jpg';expect(()=>parseExhibition(data)).toThrow();});
  it('rechaza dimensiones o coordenadas inválidas',()=>{const data=fixture();data.artworks[0].width=0;expect(()=>parseExhibition(data)).toThrow();data.artworks[0].width=1;data.artworks[0].position[0]=Infinity;expect(()=>parseExhibition(data)).toThrow();});
  it('rechaza una navegación sin salas',()=>{const data=fixture();data.navigation.walkable=[];expect(()=>parseExhibition(data)).toThrow();});
  it('rechaza geometría orientada inválida',()=>{const data={...fixture(),navigation:{...fixture().navigation,orientedBoxes:[{x:0,z:0,width:1,depth:-1,rotation:0}]}};expect(()=>parseExhibition(data)).toThrow();});
});
