/** The exhibition read as chapters: Sala I, the corridor, Sala II. */
export type RoomKey = 'a' | 'p' | 'b';
export const ROOMS: Record<RoomKey, {label: string; name: string}> = {
  a: {label: 'Sala I', name: 'Los diablitos'},
  p: {label: 'El pasillo', name: 'La música'},
  b: {label: 'Sala II', name: 'El toro y el fuego'},
};
/** The corridor spans x ∈ [-6, 6]; works hung on its end walls belong to the rooms they face. */
export const roomOf = (x: number): RoomKey => x < -6 ? 'a' : x > 6 ? 'b' : 'p';
