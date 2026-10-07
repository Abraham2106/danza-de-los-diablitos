import {describe,it,expect} from 'vitest';
import {Vector3} from 'three';
import {LABEL_WIDTH,LABEL_GAP,labelPosition,wrapLabel} from '../src/labels';
import type {Artwork} from '../src/data';

describe('Cartelas de las fotografías',()=>{
  it('envuelve por palabras y conserva acentos y el crédito completo',()=>{
    const text='Alonso Solano / El Observador';
    const lines=wrapLabel(text,t=>t.length*10,170);
    expect(lines.join(' ')).toBe(text);expect(lines.every(line=>line.length*10<=170)).toBe(true);
    expect(wrapLabel('La Tumbazón',t=>t.length*10,100)).toEqual(['La','Tumbazón']);
  });
  it.each([0,Math.PI/2,Math.PI,-Math.PI/2])('mantiene la separación de la imagen en paredes con giro %s',rotation=>{
    const art={position:[10,1.7,5],rotation,width:2.4} as Artwork;
    const delta=labelPosition(art).sub(new Vector3(...art.position));
    const right=new Vector3(Math.cos(rotation),0,-Math.sin(rotation));
    const normal=new Vector3(Math.sin(rotation),0,Math.cos(rotation));
    expect(delta.dot(right)-LABEL_WIDTH/2-art.width/2).toBeCloseTo(LABEL_GAP,6);
    expect(delta.dot(normal)).toBeCloseTo(.022,6);
    expect(labelPosition(art).y).toBe(1.45);
  });
});
