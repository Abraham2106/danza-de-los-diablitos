import type { Navigation } from './data';
export const VISITOR_RADIUS = .33;
export interface Point {x: number; z: number;}

/** A disk must remain inside the union of rooms, including their joined doorways. */
export function canStand(point: Point, nav: Navigation, radius = VISITOR_RADIUS): boolean {
  const inside = (x: number, z: number) => nav.walkable.some(a => x >= a.x1 && x <= a.x2 && z >= a.z1 && z <= a.z2);
  if (!inside(point.x,point.z)) return false;
  for (let i=0;i<16;i++) {
    const angle = i * Math.PI / 8;
    if (!inside(point.x+Math.cos(angle)*radius,point.z+Math.sin(angle)*radius)) return false;
  }
  for (const box of nav.boxes) {
    const centerX = (box.minX+box.maxX)/2, centerZ = (box.minZ+box.maxZ)/2;
    const rotation = box.rotation ?? 0;
    const dx = point.x-centerX, dz = point.z-centerZ;
    const x = Math.cos(rotation)*dx + Math.sin(rotation)*dz;
    const z = -Math.sin(rotation)*dx + Math.cos(rotation)*dz;
    const halfX = (box.maxX-box.minX)/2, halfZ = (box.maxZ-box.minZ)/2;
    const distanceX = Math.max(Math.abs(x)-halfX,0), distanceZ = Math.max(Math.abs(z)-halfZ,0);
    if (distanceX*distanceX+distanceZ*distanceZ < radius*radius) return false;
  }
  for (const box of nav.orientedBoxes ?? []) {
    const dx = point.x-box.x, dz = point.z-box.z;
    const x = Math.cos(box.rotation)*dx + Math.sin(box.rotation)*dz;
    const z = -Math.sin(box.rotation)*dx + Math.cos(box.rotation)*dz;
    const distanceX = Math.max(Math.abs(x)-box.width/2,0), distanceZ = Math.max(Math.abs(z)-box.depth/2,0);
    if (distanceX*distanceX+distanceZ*distanceZ < radius*radius) return false;
  }
  return !nav.circles.some(c => (point.x-c.x)**2+(point.z-c.z)**2 < (radius+c.r)**2);
}

/** Substeps prevent tunnelling, then resolve each axis for natural wall sliding. */
export function moveSafely(point: Point, dx: number, dz: number, nav: Navigation): Point {
  const steps = Math.max(1,Math.ceil(Math.hypot(dx,dz)/(VISITOR_RADIUS*.4)));
  const next = {...point};
  for (let i=0;i<steps;i++) {
    const x = next.x+dx/steps, z = next.z+dz/steps;
    if (canStand({x,z},nav)) {next.x=x;next.z=z;continue;}
    if (canStand({x,z:next.z},nav)) next.x=x;
    if (canStand({x:next.x,z},nav)) next.z=z;
  }
  return next;
}

export function clearPath(from: Point, to: Point, nav: Navigation): boolean {
  const steps = Math.max(1,Math.ceil(Math.hypot(to.x-from.x,to.z-from.z)/.08));
  for (let i=0;i<=steps;i++) if (!canStand({x:from.x+(to.x-from.x)*i/steps,z:from.z+(to.z-from.z)*i/steps},nav)) return false;
  return true;
}

/** Replaces an invalid authored observation point with the nearest local free spot. */
export function safeObservation(point: Point, nav: Navigation): Point | null {
  if (canStand(point,nav)) return point;
  for (const distance of [.35,.7,1.05,1.4]) for (let i=0;i<16;i++) {
    const angle = i*Math.PI/8;
    const candidate = {x:point.x+Math.cos(angle)*distance,z:point.z+Math.sin(angle)*distance};
    if (canStand(candidate,nav)) return candidate;
  }
  return null;
}
