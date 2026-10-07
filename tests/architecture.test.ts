import {describe,it,expect} from 'vitest';
import {BufferGeometry,Float32BufferAttribute,Matrix4,Mesh,MeshBasicMaterial,Raycaster,Vector3} from 'three';
import {trimWallSkin} from '../src/architecture';

describe('Unión de paredes sin caras superpuestas',()=>{
  const limits={minX:-5.85,maxX:5.85,minZ:3.5,maxZ:3.8,minSpan:6};
  function surface():BufferGeometry{
    const geometry=new BufferGeometry();
    geometry.setAttribute('position',new Float32BufferAttribute([-6,0,3.5,-6,4.8,3.5,6,0,3.5,6,4.8,3.5],3));
    geometry.setAttribute('normal',new Float32BufferAttribute([0,0,-1,0,0,-1,0,0,-1,0,0,-1],3));
    geometry.setAttribute('uv',new Float32BufferAttribute([0,0,0,1,1,0,1,1],2));
    geometry.setAttribute('uv1',new Float32BufferAttribute([.2,.1,.2,.9,.8,.1,.8,.9],2));
    geometry.setIndex([0,1,2,2,1,3]);return geometry;
  }
  it('quita el solapamiento en ambos extremos y conserva la pared entre salas',()=>{
    const original=surface(),trimmed=trimWallSkin(original,new Matrix4(),limits);
    const mesh=new Mesh(trimmed,new MeshBasicMaterial());mesh.updateMatrixWorld(true);
    for(const x of [-5.94,5.94])expect(new Raycaster(new Vector3(x,2,1),new Vector3(0,0,1)).intersectObject(mesh)).toHaveLength(0);
    expect(new Raycaster(new Vector3(0,2,1),new Vector3(0,0,1)).intersectObject(mesh)).toHaveLength(1);
    expect(original.getAttribute('position').count).toBe(4);
  });
  it('interpola las dos coordenadas de textura en vez de estirar el horneado',()=>{
    const result=trimWallSkin(surface(),new Matrix4(),limits),position=result.getAttribute('position');
    for(let i=0;i<position.count;i++){
      const u=(position.getX(i)+6)/12,v=position.getY(i)/4.8;
      expect(result.getAttribute('uv').getX(i)).toBeCloseTo(u,6);
      expect(result.getAttribute('uv').getY(i)).toBeCloseTo(v,6);
      expect(result.getAttribute('uv1').getX(i)).toBeCloseTo(.2+u*.6,6);
      expect(result.getAttribute('uv1').getY(i)).toBeCloseTo(.1+v*.8,6);
    }
  });
  it('recorta en coordenadas del mundo aunque la malla tenga una transformación',()=>{
    const matrix=new Matrix4().makeTranslation(10,0,0);
    const result=trimWallSkin(surface(),matrix,{...limits,minX:4.15,maxX:15.85});
    const position=result.getAttribute('position');
    for(let i=0;i<position.count;i++)expect(Math.abs(position.getX(i))).toBeLessThanOrEqual(5.850001);
  });
  it('no altera paredes, techos ni columnas fuera de la unión',()=>{
    const geometry=surface();geometry.translate(0,0,6);
    expect(trimWallSkin(geometry,new Matrix4(),limits)).toBe(geometry);
  });
});
