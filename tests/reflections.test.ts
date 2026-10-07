import {describe,it,expect} from 'vitest';
import {floorPatches} from '../src/reflections';
const area=(r:{x1:number;x2:number;z1:number;z2:number})=>(r.x2-r.x1)*(r.z2-r.z1);
describe('reflection floor coverage',()=>{
  it('keeps the gallery doorway overlaps from drawing twice',()=>{
    const patches=floorPatches([{x1:-22.15,x2:-5.85,z1:-9.15,z2:9.15},{x1:-6,x2:6,z1:-3.5,z2:3.5},{x1:5.85,x2:22.15,z1:-9.15,z2:9.15}]);
    expect(patches.reduce((sum,r)=>sum+area(r),0)).toBeCloseTo(678.48,5);
    for(let i=0;i<patches.length;i++)for(let j=i+1;j<patches.length;j++){
      const a=patches[i],b=patches[j];
      expect(Math.min(a.x2,b.x2)-Math.max(a.x1,b.x1)>1e-5&&Math.min(a.z2,b.z2)-Math.max(a.z1,b.z1)>1e-5).toBe(false);
    }
  });
  it('does not paint the void in an L shaped space',()=>{
    const patches=floorPatches([{x1:0,x2:3,z1:0,z2:1},{x1:0,x2:1,z1:0,z2:3}]);
    expect(patches.reduce((sum,r)=>sum+area(r),0)).toBe(5);
    expect(patches.some(r=>r.x1<2&&r.x2>2&&r.z1<2&&r.z2>2)).toBe(false);
  });
  it('handles repeated and nested floor modules',()=>{
    const large={x1:0,x2:3,z1:0,z2:3},small={x1:1,x2:2,z1:1,z2:2};
    for(const rectangles of [[large,small,large],[small,large,small]])expect(floorPatches(rectangles).reduce((sum,r)=>sum+area(r),0)).toBe(9);
  });
});
