import {describe,it,expect} from 'vitest';
import exhibition from '../public/data/exhibition.json';
import {QUESTIONS,SECTIONS,QUESTION_TIME,READ_TIME,MAX_POINTS,SECTION_SIZE,scoreAnswer,speedOf,makeAnswer,
  isUnlocked,seenInSection,sectionOfPhoto,questionsOf,pendingQuestions,summarize,verdict} from '../src/quiz';

describe('Secciones del reto',()=>{
  it('reparten las 12 fotografías de la exposición en 3 secciones de 4, sin repetir ninguna',()=>{
    const ids=exhibition.artworks.map(a=>a.id);
    const assigned=SECTIONS.flatMap(s=>s.photos);
    expect(SECTIONS).toHaveLength(3);
    SECTIONS.forEach(s=>expect(s.photos).toHaveLength(SECTION_SIZE));
    expect([...assigned].sort()).toEqual([...ids].sort());
    expect(sectionOfPhoto('art-001')).toBe(0);expect(sectionOfPhoto('art-008')).toBe(1);expect(sectionOfPhoto('art-012')).toBe(2);
  });
  it('tienen 2 preguntas cada una, con dificultad y puntos crecientes',()=>{
    SECTIONS.forEach((_,i)=>expect(questionsOf(i)).toHaveLength(2));
    expect(SECTIONS.map(s=>s.level)).toEqual([1,2,3]);
    expect(SECTIONS[0].multiplier).toBeLessThan(SECTIONS[1].multiplier);
    expect(SECTIONS[1].multiplier).toBeLessThan(SECTIONS[2].multiplier);
  });
  it('desbloquean sus preguntas solo cuando se vieron las 4 fotografías',()=>{
    const seen=new Set<string>(['art-001','art-002','art-003']);
    expect(seenInSection(0,seen)).toBe(3);expect(isUnlocked(0,seen)).toBe(false);
    seen.add('art-004');expect(isUnlocked(0,seen)).toBe(true);expect(isUnlocked(1,seen)).toBe(false);
    expect(isUnlocked(2,new Set(['art-001','art-002','art-003','art-004']))).toBe(false);
  });
  it('cuentan como pendientes las preguntas sin responder',()=>{
    const [a,b]=questionsOf(1);
    expect(pendingQuestions(1,{})).toEqual([a,b]);
    expect(pendingQuestions(1,{[a]:makeAnswer(a,QUESTIONS[a].answer,1000)})).toEqual([b]);
  });
});

describe('Preguntas',()=>{
  it('tienen cuatro opciones distintas, una respuesta válida y una imagen de la exposición',()=>{
    const images=new Set(exhibition.artworks.map(a=>a.image));
    for(const q of QUESTIONS){
      expect(new Set(q.options).size).toBe(4);
      expect(q.answer).toBeGreaterThanOrEqual(0);expect(q.answer).toBeLessThan(4);
      expect(images.has(q.image)).toBe(true);expect(q.why.length).toBeGreaterThan(10);
      expect(SECTIONS[q.section]).toBeDefined();
    }
  });
  it('no dejan la respuesta correcta siempre en la misma posición',()=>{
    expect(new Set(QUESTIONS.map(q=>q.answer)).size).toBeGreaterThan(2);
  });
});

describe('Puntaje',()=>{
  it('premia la rapidez entre el 50 % y el 100 % y nunca da puntos por un error',()=>{
    expect(scoreAnswer(false,0)).toBe(0);
    expect(scoreAnswer(true,0)).toBe(MAX_POINTS);
    expect(scoreAnswer(true,QUESTION_TIME)).toBe(MAX_POINTS/2);
    expect(scoreAnswer(true,QUESTION_TIME*3)).toBe(MAX_POINTS/2);
    expect(scoreAnswer(true,QUESTION_TIME/2)).toBe(750);
  });
  it('multiplica por la dificultad de la sección',()=>{
    expect(scoreAnswer(true,0,1.5)).toBe(1500);
    expect(scoreAnswer(true,0,2)).toBe(2000);
    expect(scoreAnswer(true,QUESTION_TIME,2)).toBe(1000);
  });
  it('mide la rapidez como el porcentaje de tiempo que sobró',()=>{
    expect(speedOf(0)).toBe(1);expect(speedOf(QUESTION_TIME/4)).toBeCloseTo(.75);expect(speedOf(QUESTION_TIME*2)).toBe(0);
  });
  it('rápido y correcto vale más que lento y correcto, y un error no suma',()=>{
    const q=questionsOf(2)[0],right=QUESTIONS[q].answer,wrong=(right+1)%4;
    const fast=makeAnswer(q,right,2000),slow=makeAnswer(q,right,18000),bad=makeAnswer(q,wrong,500);
    expect(fast.points).toBeGreaterThan(slow.points);expect(slow.points).toBeGreaterThan(0);
    expect(bad.correct).toBe(false);expect(bad.points).toBe(0);
  });
  it('trata el tiempo agotado como respuesta incorrecta sin puntos',()=>{
    const answer=makeAnswer(0,-1,0);
    expect(answer.correct).toBe(false);expect(answer.points).toBe(0);expect(answer.speed).toBe(0);expect(answer.ms).toBe(QUESTION_TIME);
  });
  it('da 5 segundos de lectura antes de que corra el tiempo de respuesta',()=>{
    expect(READ_TIME).toBe(5000);expect(READ_TIME).toBeLessThan(QUESTION_TIME);
  });
});

describe('Resumen para el ranking',()=>{
  it('cuenta puntos, respuestas, aciertos, rapidez y preguntas por nivel',()=>{
    const a=questionsOf(0)[0],b=questionsOf(2)[0];
    const answers={[a]:makeAnswer(a,QUESTIONS[a].answer,0),[b]:makeAnswer(b,(QUESTIONS[b].answer+1)%4,1000)};
    const summary=summarize(answers);
    expect(summary.answered).toBe(2);expect(summary.correct).toBe(1);expect(summary.points).toBe(1000);
    expect(summary.byLevel[1]).toEqual({answered:1,correct:1,points:1000});
    expect(summary.byLevel[3]).toEqual({answered:1,correct:0,points:0});
    expect(summary.byLevel[2].answered).toBe(0);
    expect(summary.avgSpeed).toBeCloseTo((1+.95)/2);
    expect(summarize({}).avgSpeed).toBe(0);
  });
  it('asigna un título según los aciertos',()=>{
    expect(verdict(6,6)).toBe('Diablito mayor');expect(verdict(4,6)).toBe('Guardián de la máscara');
    expect(verdict(3,6)).toBe('Aprendiz del baile');expect(verdict(0,6)).toBe('Visitante del pueblo');
  });
});
