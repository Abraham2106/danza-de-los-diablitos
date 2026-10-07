export type Vec3 = [number, number, number];
export interface Box { minX: number; maxX: number; minZ: number; maxZ: number; rotation?: number; }
export interface Circle { x: number; z: number; r: number; }
export interface OrientedBox { x: number; z: number; width: number; depth: number; rotation: number; }
export interface Walkable { x1: number; x2: number; z1: number; z2: number; }
export interface Navigation { boxes: Box[]; orientedBoxes?: OrientedBox[]; circles: Circle[]; walkable: Walkable[]; spawn: {position: Vec3; yaw: number}; }
export interface Artwork {
  id: string; title: string; artist: string; year: string; description: string; source: string;
  image: string; imageUrl?: string; position: Vec3; rotation: number; width: number; height: number; frame: string;
  observation: {position: Vec3; yaw: number};
}
export interface Exhibition {
  schemaVersion: 1; title: string; subtitle: string; source: string; model: string;
  navigation: Navigation; artworks: Artwork[]; renders: string[];
}
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const vector = (value: unknown): value is Vec3 => Array.isArray(value) && value.length === 3 && value.every(finite);
const string = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const localResource = (value: unknown): value is string => string(value) && !/^(?:[a-z]+:|\/|\\)/i.test(value) && !value.split(/[\/\\]/).includes('..');

export function parseExhibition(value: unknown): Exhibition {
  if (!isObject(value) || value.schemaVersion !== 1 || !string(value.title) || !string(value.subtitle)
      || !localResource(value.model) || !Array.isArray(value.artworks) || !Array.isArray(value.renders)
      || !value.renders.every(localResource) || !isObject(value.navigation)) throw new Error('La exposición tiene un formato no compatible.');
  const nav = value.navigation;
  if (!Array.isArray(nav.boxes) || !Array.isArray(nav.circles) || !Array.isArray(nav.walkable) || nav.walkable.length === 0
      || !isObject(nav.spawn) || !vector(nav.spawn.position) || !finite(nav.spawn.yaw)) throw new Error('No se pudieron leer los datos del recorrido.');
  for (const box of nav.boxes) if (!isObject(box) || ![box.minX,box.maxX,box.minZ,box.maxZ].every(finite)
    || (box.minX as number) >= (box.maxX as number) || (box.minZ as number) >= (box.maxZ as number)
    || (box.rotation !== undefined && !finite(box.rotation))) throw new Error('Un obstáculo de la exposición no es válido.');
  for (const circle of nav.circles) if (!isObject(circle) || ![circle.x,circle.z,circle.r].every(finite)
    || (circle.r as number) <= 0) throw new Error('Una columna de la exposición no es válida.');
  if (nav.orientedBoxes !== undefined) {
    if (!Array.isArray(nav.orientedBoxes)) throw new Error('Los paneles de la exposición no son válidos.');
    for (const box of nav.orientedBoxes) if (!isObject(box) || ![box.x,box.z,box.width,box.depth,box.rotation].every(finite)
      || (box.width as number) <= 0 || (box.depth as number) <= 0) throw new Error('Un panel de la exposición no es válido.');
  }
  for (const area of nav.walkable) if (!isObject(area) || ![area.x1,area.x2,area.z1,area.z2].every(finite)
    || (area.x1 as number) >= (area.x2 as number) || (area.z1 as number) >= (area.z2 as number)) throw new Error('Una sala de la exposición no es válida.');
  const ids = new Set<string>();
  for (const artwork of value.artworks) {
    if (!isObject(artwork) || !string(artwork.id) || ids.has(artwork.id)
      || ![artwork.title,artwork.artist,artwork.description,artwork.source].every(string)
      || !localResource(artwork.image) || !vector(artwork.position) || !finite(artwork.rotation)
      || !finite(artwork.width) || !finite(artwork.height) || artwork.width <= 0 || artwork.height <= 0
      || !isObject(artwork.observation) || !vector(artwork.observation.position) || !finite(artwork.observation.yaw)) throw new Error('Los datos de una obra están incompletos o repetidos.');
    ids.add(artwork.id);
  }
  return value as unknown as Exhibition;
}
export function assetUrl(path: string): string { return new URL(path, new URL(import.meta.env.BASE_URL, window.location.href)).href; }
