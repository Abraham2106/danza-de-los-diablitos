import {describe,it,expect} from 'vitest';
import {resultsCsv} from '../src/host';
import type {HostResults} from '../src/api';
import type {Row} from '../worker/game';

const row=(overrides:Partial<Row>):Row=>({
  rank:1,id:'a',name:'Ana',points:1974,answered:2,correct:2,avgSpeed:.973,joinedAt:1,updatedAt:2,
  byLevel:{1:{answered:2,correct:2,points:1974},2:{answered:0,correct:0,points:0},3:{answered:0,correct:0,points:0}},...overrides,
});
const results=(players:Row[]):HostResults=>({game:{id:'g',status:'closed',startedAt:1},max:40,players,retentionMs:1});

describe('Resultados para descargar',()=>{
  it('arma un CSV con puesto, nombre, puntos, respuestas, rapidez y los aciertos de cada nivel',()=>{
    const csv=resultsCsv(results([row({}),row({rank:2,id:'b',name:'Beto',points:500,answered:1,correct:1,avgSpeed:.5,
      byLevel:{1:{answered:1,correct:1,points:500},2:{answered:0,correct:0,points:0},3:{answered:0,correct:0,points:0}}})]));
    const lines=csv.replace(/^﻿/,'').split('\r\n');
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(lines[0]).toBe('"Puesto";"Nombre";"Puntos";"Respondidas";"Correctas";"Rapidez media (%)";"Fácil correctas";"Fácil respondidas";"Intermedio correctas";"Intermedio respondidas";"Difícil correctas";"Difícil respondidas"');
    expect(lines[1]).toBe('"1";"Ana";"1974";"2";"2";"97";"2";"2";"0";"0";"0";"0"');
    expect(lines[2]).toBe('"2";"Beto";"500";"1";"1";"50";"1";"1";"0";"0";"0";"0"');
  });
  it('protege los nombres con comillas para que no rompan las columnas',()=>{
    const csv=resultsCsv(results([row({name:'Ana "la; fuerte"'})]));
    expect(csv).toContain('"Ana ""la; fuerte"""');
  });
  it('sin jugadores deja solo los encabezados',()=>{
    expect(resultsCsv(results([])).split('\r\n')).toHaveLength(1);
  });
});
