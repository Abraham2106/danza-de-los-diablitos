import { describe, expect, it } from 'vitest';
import type {Navigation} from '../src/data';
import {canStand,clearPath,moveSafely,safeObservation} from '../src/navigation';
const navigation=(overrides:Partial<Navigation>={}):Navigation=>({boxes:[],circles:[],walkable:[{x1:-10,x2:10,z1:-10,z2:10}],spawn:{position:[0,1.65,0],yaw:0},...overrides});
describe('Recorrido seguro',()=>{
  it('mantiene el radio del visitante dentro de una sala',()=>{const nav=navigation();expect(canStand({x:9.9,z:0},nav)).toBe(false);expect(canStand({x:9.5,z:0},nav)).toBe(true);});
  it('permite cruzar una puerta compartida entre salas sin margen artificial',()=>{const nav=navigation({walkable:[{x1:-10,x2:0,z1:-6,z2:6},{x1:0,x2:10,z1:-3,z2:3}]});expect(canStand({x:0,z:0},nav)).toBe(true);expect(canStand({x:0,z:4},nav)).toBe(false);});
  it('impide atravesar un panel fino incluso con un desplazamiento largo',()=>{const nav=navigation({boxes:[{minX:-.05,maxX:.05,minZ:-5,maxZ:5}]});const point=moveSafely({x:-2,z:0},6,0,nav);expect(point.x).toBeLessThan(-.33);expect(canStand(point,nav)).toBe(true);});
  it('permite deslizarse junto a una pared',()=>{const nav=navigation({boxes:[{minX:0,maxX:1,minZ:-5,maxZ:5}]});const point=moveSafely({x:-.4,z:0},1,2,nav);expect(point.x).toBeLessThan(0);expect(point.z).toBeGreaterThan(1.8);});
  it('detecta el cuerpo de una columna y el radio del visitante',()=>{const nav=navigation({circles:[{x:0,z:0,r:.5}]});expect(canStand({x:.7,z:0},nav)).toBe(false);expect(canStand({x:.9,z:0},nav)).toBe(true);});
  it('aplica la orientación de un panel a 45 grados',()=>{const nav=navigation({orientedBoxes:[{x:0,z:0,width:6,depth:.12,rotation:Math.PI/4}]});expect(canStand({x:1.5,z:1.5},nav)).toBe(false);expect(canStand({x:1.5,z:-1.5},nav)).toBe(true);expect(clearPath({x:-2,z:2},{x:2,z:-2},nav)).toBe(false);});
  it('comprueba todo el camino en vez de solo el destino',()=>{const nav=navigation({boxes:[{minX:-.1,maxX:.1,minZ:-5,maxZ:5}]});expect(canStand({x:2,z:0},nav)).toBe(true);expect(clearPath({x:-2,z:0},{x:2,z:0},nav)).toBe(false);expect(clearPath({x:-2,z:6},{x:2,z:6},nav)).toBe(true);});
  it('encuentra un punto libre cercano y rechaza una zona completamente bloqueada',()=>{const nav=navigation({circles:[{x:0,z:0,r:.25}]});const result=safeObservation({x:0,z:0},nav);expect(result).not.toBeNull();expect(canStand(result!,nav)).toBe(true);const blocked=navigation({boxes:[{minX:-9,maxX:9,minZ:-9,maxZ:9}]});expect(safeObservation({x:0,z:0},blocked)).toBeNull();});
});
