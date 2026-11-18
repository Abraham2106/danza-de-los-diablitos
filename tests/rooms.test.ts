import {describe,it,expect} from 'vitest';
import exhibition from '../public/data/exhibition.json';
import {ROOMS,roomOf} from '../src/rooms';

describe('Salas como capítulos',()=>{
  it('reparte las fotografías: 1–7 en la Sala I, 8 en el pasillo y 9–12 en la Sala II',()=>{
    const byRoom=exhibition.artworks.map(a=>ROOMS[roomOf(a.position[0])].label);
    expect(byRoom).toEqual([...Array(7).fill('Sala I'),'El pasillo',...Array(4).fill('Sala II')]);
  });
  it('anuncia la sala correcta al caminar por cada zona transitable',()=>{
    const [salaI,pasillo,salaII]=exhibition.navigation.walkable;
    expect(roomOf((salaI.x1+salaI.x2)/2)).toBe('a');
    expect(roomOf((pasillo.x1+pasillo.x2)/2)).toBe('p');
    expect(roomOf((salaII.x1+salaII.x2)/2)).toBe('b');
    expect(roomOf(exhibition.navigation.spawn.position[0])).toBe('p');
    expect(roomOf(6.5)).toBe('b');expect(roomOf(-6.5)).toBe('a');
  });
});
