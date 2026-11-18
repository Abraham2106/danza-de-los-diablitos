import {afterEach,describe,expect,it,vi} from 'vitest';
import {GuidedTour,RecordedNarration} from '../src/visit';

afterEach(()=>vi.useRealTimers());
describe('Reloj del recorrido',()=>{
  it('cuenta la contemplación desde la llegada, no durante el acercamiento',()=>{
    vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance']});const next=vi.fn(),tour=new GuidedTour(next,1000);
    tour.start();tour.select(1);vi.advanceTimersByTime(5000);expect(next).not.toHaveBeenCalled();
    tour.arrive();vi.advanceTimersByTime(999);expect(next).not.toHaveBeenCalled();vi.advanceTimersByTime(1);expect(next).toHaveBeenCalledOnce();
  });
  it('pausa sin avanzar y solo continúa por una decisión explícita',()=>{
    vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance']});const next=vi.fn(),tour=new GuidedTour(next,1000);
    tour.start();tour.arrive();vi.advanceTimersByTime(400);tour.pause();vi.advanceTimersByTime(10000);expect(next).not.toHaveBeenCalled();
    tour.start();vi.advanceTimersByTime(599);expect(next).not.toHaveBeenCalled();vi.advanceTimersByTime(1);expect(next).toHaveBeenCalledOnce();
  });
  it('espera audio y deja dos segundos como mínimo tras finalizar',()=>{
    vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance']});const next=vi.fn(),tour=new GuidedTour(next,1000);
    tour.start();tour.arrive();vi.advanceTimersByTime(900);tour.hold();vi.advanceTimersByTime(40000);expect(next).not.toHaveBeenCalled();
    tour.release(true);vi.advanceTimersByTime(1999);expect(next).not.toHaveBeenCalled();vi.advanceTimersByTime(1);expect(next).toHaveBeenCalledOnce();
  });
  it('seleccionar otra parada cancela el vencimiento anterior y sincroniza su posición',()=>{
    vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance']});const next=vi.fn(),tour=new GuidedTour(next,1000);
    tour.start();tour.arrive();vi.advanceTimersByTime(900);tour.select(8);expect(tour.index).toBe(8);
    vi.advanceTimersByTime(2000);expect(next).not.toHaveBeenCalled();tour.arrive();vi.advanceTimersByTime(1000);expect(next).toHaveBeenCalledOnce();
  });
  it('la pausa después del audio es breve incluso si quedaba toda la contemplación',()=>{
    vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance']});const next=vi.fn(),tour=new GuidedTour(next);
    tour.start();tour.arrive();tour.hold();vi.advanceTimersByTime(41000);tour.release(true);
    vi.advanceTimersByTime(2000);expect(next).toHaveBeenCalledOnce();
  });
  it('salir invalida relojes pendientes y liberar audio no reinicia el recorrido',()=>{
    vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance']});const next=vi.fn(),tour=new GuidedTour(next,1000);
    tour.start();tour.arrive();tour.hold();tour.stop();tour.release(true);tour.arrive();vi.advanceTimersByTime(10000);
    expect(tour.running).toBe(false);expect(next).not.toHaveBeenCalled();
  });
});

function fakeMedia(){
  const media={preload:'',src:'',ended:false,onended:null,onerror:null,onplaying:null,onpause:null,
    pause:vi.fn(),load:vi.fn(),removeAttribute:vi.fn(),play:vi.fn(()=>Promise.resolve())};
  return media as unknown as HTMLAudioElement;
}
describe('Grabaciones proporcionadas',()=>{
  it('detener durante play pendiente impide que su resolución vuelva a reproducir',async()=>{
    const media=fakeMedia();let resolve!:()=>void;media.play=vi.fn(()=>new Promise<void>(r=>resolve=r));
    const changed=vi.fn(),ended=vi.fn(),failed=vi.fn();const audio=new RecordedNarration(changed,ended,failed,()=>media);
    const pending=audio.play('/audio/provided.mp3');expect(audio.state).toBe('loading');audio.stop();resolve();await pending;
    expect(audio.busy).toBe(false);expect(changed).not.toHaveBeenLastCalledWith('playing');expect(media.pause).toHaveBeenCalled();expect(failed).not.toHaveBeenCalled();
  });
  it('un cambio rápido detiene el anterior y sus eventos tardíos no afectan al nuevo',async()=>{
    const first=fakeMedia(),second=fakeMedia(),changed=vi.fn(),ended=vi.fn(),failed=vi.fn();
    const create=vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
    const audio=new RecordedNarration(changed,ended,failed,create);await audio.play('/one.mp3');
    const oldEnd=first.onended!,oldError=first.onerror!;await audio.play('/two.mp3');
    oldEnd.call(first,new Event('ended'));oldError.call(first,new Event('error'));
    expect(first.pause).toHaveBeenCalled();expect(audio.state).toBe('playing');expect(ended).not.toHaveBeenCalled();expect(failed).not.toHaveBeenCalled();
  });
  it('un rechazo de reproducción libera el estado y comunica el fallo',async()=>{
    const media=fakeMedia();media.play=vi.fn(()=>Promise.reject(new Error('NotAllowedError')));
    const failed=vi.fn(),audio=new RecordedNarration(vi.fn(),vi.fn(),failed,()=>media);
    await audio.play('/one.mp3');expect(audio.busy).toBe(false);expect(failed).toHaveBeenCalledOnce();expect(media.pause).toHaveBeenCalled();
  });
  it('terminar informa una sola vez y un error viejo después de detener no hace nada',async()=>{
    const media=fakeMedia(),ended=vi.fn(),failed=vi.fn(),audio=new RecordedNarration(vi.fn(),ended,failed,()=>media);
    await audio.play('/one.mp3');const finish=media.onended!,error=media.onerror!;finish.call(media,new Event('ended'));finish.call(media,new Event('ended'));error.call(media,new Event('error'));
    expect(audio.state).toBe('idle');expect(ended).toHaveBeenCalledOnce();expect(failed).not.toHaveBeenCalled();
  });
});
