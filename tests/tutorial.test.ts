import {describe,it,expect} from 'vitest';
import {tutorialCards,cardState,currentRules,type Rules} from '../src/tutorial';
import {READ_TIME,QUESTION_TIME,MAX_POINTS,SECTIONS,SECTION_SIZE,scoreAnswer} from '../src/quiz';

describe('Tarjetas del tutorial',()=>{
  const cards=tutorialCards();
  it('son cinco pasos en orden: recorrer, abrir fotos, desbloquear, responder y el podio',()=>{
    expect(cards.map(c=>c.id)).toEqual(['recorre','abre','desbloquea','responde','gana']);
    expect(cards.map(c=>c.scene)).toEqual(['museum','photos','unlock','answer','podium']);
    expect(cards.map(c=>c.step)).toEqual(['Paso 1 de 5','Paso 2 de 5','Paso 3 de 5','Paso 4 de 5','Paso 5 de 5']);
  });
  it('cada una tiene título y un texto corto, sin repetirse',()=>{
    expect(new Set(cards.map(c=>c.id)).size).toBe(5);
    expect(new Set(cards.map(c=>c.tone)).size).toBe(5);
    for(const card of cards){
      expect(card.title.length).toBeGreaterThan(3);
      expect(card.text.length).toBeGreaterThan(30);
      expect(card.text.length).toBeLessThan(230);
    }
  });
  it('los números del texto salen de las reglas reales del juego',()=>{
    const text=cards.map(c=>c.text).join(' ');
    expect(text).toContain(`${READ_TIME/1000} segundos`);
    expect(text).toContain(`${QUESTION_TIME/1000} para elegir`);
    expect(text).toContain('1 000 puntos');
    expect(text).toContain(`${SECTIONS.length} secciones de ${SECTION_SIZE} fotos`);
    expect(text).toContain('×1,5');expect(text).toContain('×2');
    expect(MAX_POINTS).toBe(1000);
  });
  it('si cambian las reglas, cambia el texto: no puede contradecir al juego',()=>{
    const rules:Rules={readSeconds:7,answerSeconds:30,maxPoints:2500,multipliers:[1,3,4.5],sectionSize:6,questionsPerSection:3,sections:2};
    const text=tutorialCards(rules).map(c=>c.text).join(' ');
    expect(text).toContain('7 segundos');expect(text).toContain('30 para elegir');expect(text).toContain('2 500 puntos');
    expect(text).toContain('×3 y ×4,5');expect(text).toContain('2 secciones de 6 fotos');expect(text).toContain('Hay 12 fotografías');
    expect(text).toContain('se abren 3 preguntas');
  });
  it('tolera reglas con menos multiplicadores sin romperse',()=>{
    expect(()=>tutorialCards({...currentRules(),multipliers:[1]})).not.toThrow();
  });
});

describe('Pila de tarjetas',()=>{
  it('la actual va al frente, las dos siguientes asoman detrás y las lejanas se ocultan',()=>{
    const states=[0,1,2,3,4,5].map(i=>cardState(i,2));
    expect(states.map(s=>s.state)).toEqual(['past','past','current','next','next','far']);
    expect(states.map(s=>s.depth)).toEqual([0,0,0,1,2,3]);
  });
  it('al volver atrás una tarjeta pasada regresa a la pila',()=>{
    expect(cardState(1,2).state).toBe('past');
    expect(cardState(1,1).state).toBe('current');
    expect(cardState(2,1)).toEqual({state:'next',depth:1});
  });
});

describe('Ejemplo de puntos del tutorial',()=>{
  it('responder rápido vale más que responder lento, ambos con la misma regla del juego',()=>{
    const fast=scoreAnswer(true,1000,1),slow=scoreAnswer(true,QUESTION_TIME*.8,1);
    expect(fast).toBe(975);expect(slow).toBe(600);expect(fast).toBeGreaterThan(slow);
  });
});
