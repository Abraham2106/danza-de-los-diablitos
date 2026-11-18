import '@fontsource-variable/unbounded';
import '@fontsource-variable/josefin-sans';
import '@fontsource-variable/josefin-sans/wght-italic.css';
import '@fontsource-variable/newsreader/opsz.css';
import './style.css';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {daylightSky,finishExterior} from './exterior';
import {finishFloor} from './floor';
import {addPlanarReflections,type ReflectionController} from './reflections';
import { assetUrl, parseExhibition, type Artwork, type Exhibition } from './data';
import { canStand, clearPath, moveSafely, safeObservation, type Point } from './navigation';
import {FocusSession,framingDistance,focusViewOffset,selectArtworkView,hasArtworkSight,type CameraPose} from './focus';
import {FramePump,StaticRayIndex} from './performance';
import {joinDoorwayWalls} from './architecture';
import {addArtworkLabels} from './labels';
import {replaceFurnishings} from './furnishings';
import {QUESTIONS,SECTIONS,SECTION_SIZE,QUESTION_TIME,READ_TIME,MAX_POINTS,isUnlocked,seenInSection,sectionOfPhoto,questionsOf,pendingQuestions,makeAnswer,summarize,verdict,type Answer,type Answers,type Level} from './quiz';
import {ROOMS,roomOf,type RoomKey} from './rooms';
import {api,type RawAnswer,type Podium} from './api';
import {showPodium} from './podium';
import {mountHost} from './host';

const icons = {
  arrow:'<path d="M3 9h11M10 5l4 4-4 4"/>', close:'<path d="m5 5 8 8M13 5l-8 8"/>',
  help:'<circle cx="9" cy="9" r="7"/><path d="M7 6.6a2 2 0 1 1 3.1 1.6C9 8.9 9 9.4 9 10.2"/><path d="M9 13h.01"/>',
  grid:'<rect x="2.5" y="2.5" width="5" height="5"/><rect x="10.5" y="2.5" width="5" height="5"/><rect x="2.5" y="10.5" width="5" height="5"/><rect x="10.5" y="10.5" width="5" height="5"/>',
  image:'<rect x="2" y="3" width="14" height="12"/><path d="m3 13 4-4 3 3 2-2 3 3"/><circle cx="12" cy="6" r="1"/>',
  audio:'<path d="M3 7h3l4-4v12l-4-4H3zM13 6a5 5 0 0 1 0 6M15 3a9 9 0 0 1 0 12"/>',
  expand:'<path d="M6 2H2v4M12 2h4v4M2 12v4h4M16 12v4h-4"/>',
  walk:'<circle cx="10" cy="3" r="1.5"/><path d="m7 8 2-3 3 4 3 1M9 6l-1 6-4 4M8 12l4 4M7 8 3 10"/>',
  prev:'<path d="M11 4 6 9l5 5"/>', next:'<path d="m7 4 5 5-5 5"/>',
  book:'<path d="M2 3h5a2 2 0 0 1 2 2v10a2 2 0 0 0-2-2H2zM16 3h-5a2 2 0 0 0-2 2v10a2 2 0 0 1 2-2h5z"/>',
  spark:'<path d="M9 1.5 11 7l5.5 2-5.5 2L9 16.5 7 11 1.5 9 7 7z"/>',
  lock:'<rect x="3" y="8" width="12" height="8" rx="2"/><path d="M6 8V6a3 3 0 0 1 6 0v2"/>',
  exit:'<path d="M7 3H3v12h4M12 5l4 4-4 4M16 9H7"/>', down:'<path d="M9 3v12M4 10l5 5 5-5"/>',
};
const svg = (name: keyof typeof icons) => `<svg viewBox="0 0 18 18" aria-hidden="true">${icons[name]}</svg>`;
/** Woven belt emblem: the stripes of a Boruca backstrap-loom textile. */
const brandMark = '<span class="brand-mark" aria-hidden="true"></span>';
const pad=(n:number)=>String(n).padStart(2,'0');
const art=(file:string)=>assetUrl(`artworks/${file}`);
/**
 * Entry emblem: the flute player framed in a circle and crowned with geometric feathers,
 * like the headdresses of the diablitos. Feathers are longer at the top, as in the photographs.
 */
function corona(image:string):string{
  const cx=300,cy=300,r=176,colors=['#e5502f','#f7b731','#ffd166','#6f84ff','#2fa36b','#c75bd6'];
  const feathers:string[]=[];const count=34;
  for(let i=0;i<count;i++){
    const a=(i/count)*Math.PI*2-Math.PI/2;
    const up=Math.max(0,-Math.sin(a));const length=34+118*Math.pow(up,1.6);if(length<40&&i%2)continue;
    const half=Math.PI/count*.92,base=r+6,tip=base+length;
    const pt=(rad:number,ang:number)=>`${(cx+rad*Math.cos(ang)).toFixed(1)},${(cy+rad*Math.sin(ang)).toFixed(1)}`;
    const color=colors[i%colors.length];
    feathers.push(`<g class="pluma" style="--i:${i}"><polygon points="${pt(base,a-half)} ${pt(tip,a)} ${pt(base,a+half)}" fill="${color}"/><polyline points="${pt(base,a)} ${pt(tip-6,a)}" stroke="#1f2859" stroke-opacity=".3" stroke-width="1.6"/></g>`);
  }
  return `<svg class="corona" viewBox="74 -44 452 572" aria-hidden="true">
    <defs><clipPath id="corona-clip"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath></defs>
    ${feathers.join('')}
    <circle cx="${cx}" cy="${cy}" r="${r+7}" fill="#fff9ef"/>
    <image href="${image}" x="${cx-r}" y="${cy-r*1.08}" width="${r*2}" height="${r*2*1536/1152}" preserveAspectRatio="xMidYMin slice" clip-path="url(#corona-clip)"/>
    <circle cx="${cx}" cy="${cy}" r="${r+12}" fill="none" stroke="#fff9ef" stroke-width="2" stroke-dasharray="2 8" stroke-linecap="round"/>
  </svg>`;
}
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <canvas id="gallery-canvas" tabindex="0" aria-label="Recorrido por la galería. Usa WASD o las flechas para caminar y arrastra el ratón para mirar." hidden></canvas>
  <header class="topbar" hidden>
    <div class="brand">${brandMark}<div><p class="brand-name">Baile de los Diablitos</p><p class="brand-meta"><span id="player-label"></span></p></div><div class="seen" id="seen" aria-live="polite"><span class="seen-count"><b id="seen-count">0</b>/<span id="seen-total">12</span></span><span class="seen-text">fotografías<br/>vistas</span></div><div class="points"><b id="points-total">0</b><span class="seen-text" id="points-label">puntos</span></div></div>
    <nav class="toolbar" aria-label="Visita">
      <button class="tool tool-reto" id="quiz-button" aria-label="El reto">${svg('spark')}<span>El reto</span><b class="badge" id="quiz-badge" hidden>0</b></button>
      <button class="tool" id="catalog-button" aria-label="Fotografías">${svg('grid')}<span>Fotografías</span></button>
      <button class="tool" id="guide-button" aria-label="Guía de la fiesta">${svg('book')}<span>Guía</span></button>
      <button class="tool" id="help-button" aria-label="Cómo recorrer">${svg('help')}<span>Cómo recorrer</span></button>
      <button class="tool" id="exit-button" aria-label="Volver a la portada">${svg('exit')}<span>Portada</span></button>
    </nav>
  </header>
  <main class="welcome" id="welcome" aria-labelledby="exhibition-title">
    <div class="join-card">
    <div class="join-art">
      ${corona(art('art-008.jpg'))}
      <div class="zigzag" aria-hidden="true"></div>
      <p class="join-photo-credit">La flauta y el jaguar · Alonso Solano / El Observador</p>
    </div>
    <section class="join">
      <p class="kicker">Museo digital</p>
      <h1 id="exhibition-title"><span class="h1-lead">El baile de los</span><span class="h1-main">Diablitos</span></h1>
      <ol class="join-steps" aria-label="Cómo funciona la actividad">
        <li><b>1</b><span>Escribe tu nombre</span></li>
        <li><b>2</b><span>Recorre y abre las 12 fotos</span></li>
        <li><b>3</b><span>Responde el reto</span></li>
      </ol>
      <form class="join-form" id="join-form" novalidate>
        <label for="player-name">Tu nombre</label>
        <div class="join-row">
          <input id="player-name" name="player" type="text" autocomplete="nickname" maxlength="24" placeholder="Escribe tu nombre" required />
          <button class="button primary enter" id="enter-button" type="submit">Entrar ${svg('arrow')}</button>
        </div>
        <p class="join-error" id="join-error" role="alert" hidden>Escribe tu nombre para entrar.</p>
        <p class="join-wait" id="join-wait" role="status" aria-live="polite" hidden></p>
      </form>
      <p class="entry-progress" id="entry-progress"><span class="progress-bar"><i id="progress-fill"></i></span><span id="progress-text">Preparando la sala…</span></p>
      <p class="sr-only" id="entry-status" role="status"></p>
      <div class="entry-help" id="entry-help" hidden>
        <p id="entry-error" role="alert"></p>
        <button id="retry-load" type="button" class="text-button">Volver a cargar</button>
        <button id="welcome-views" type="button" class="text-button">Ver imágenes de las salas</button>
      </div>
      <nav class="join-links" aria-label="Antes de entrar">
        <button class="text-button" id="welcome-guide" type="button">Guía de la fiesta</button>
        <button class="text-button" id="welcome-catalog" type="button">Ver las fotografías</button>
        <button class="text-button host-link" id="host-open" type="button">${svg('lock')}Host</button>
      </nav>
    </section>
    </div>
  </main>
  <div class="hud" id="hud" hidden>
    <div class="map-card"><div class="map-heading"><strong id="room-label">El pasillo</strong><span id="room-name">La música</span></div><canvas id="minimap" aria-label="Mapa de la galería y posición del visitante"></canvas><p class="map-caption"><i></i>Estás aquí<b></b>Fotografías</p></div>
    <div class="walk-hint"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>Caminar</span><span><kbd class="wide">Arrastrar</kbd>Mirar</span><span><kbd class="wide">Clic</kbd>Abrir una foto</span></div>
    <div class="crosshair" aria-hidden="true"></div>
    <div class="chapter" id="chapter" aria-hidden="true" hidden><p class="chapter-label"></p><p class="chapter-name"></p><p class="chapter-count"></p></div>
    <p id="hover-hint" hidden></p><p id="toast" role="status" aria-live="polite" hidden></p>
  </div>
  <div class="fade" id="fade" aria-hidden="true"></div>
  <dialog id="help-dialog" aria-labelledby="help-title"><div class="faja faja-thin" aria-hidden="true"></div><div class="dialog-header"><div><p class="kicker">Antes de caminar</p><h2 id="help-title">Cómo recorrer</h2></div><button class="icon-button" data-close aria-label="Cerrar instrucciones">${svg('close')}</button></div><div class="dialog-body"><p class="help-lede">La exposición tiene dos salas unidas por un pasillo. En la Sala I están los diablitos; en el pasillo, la música; en la Sala II, el toro y el fuego.</p><dl class="controls-list"><div><dt><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></dt><dd>Caminar. También funcionan las flechas.</dd></div><div><dt><kbd class="wide">Arrastrar</kbd></dt><dd>Mirar alrededor con el ratón.</dd></div><div><dt><kbd>Q</kbd><kbd>E</kbd></dt><dd>Girar a la izquierda o a la derecha.</dd></div><div><dt><kbd class="wide">Shift</kbd></dt><dd>Caminar más rápido.</dd></div><div><dt><kbd class="wide">Clic</kbd></dt><dd>Acercarte a una fotografía y leer su historia.</dd></div><div><dt><kbd>←</kbd><kbd>→</kbd></dt><dd>Con una ficha abierta, pasar a la foto anterior o siguiente.</dd></div><div><dt><kbd class="wide">Esc</kbd></dt><dd>Cerrar una ficha o ventana.</dd></div></dl><details class="visit-options"><summary>Opciones de la visita</summary><div class="options-row"><label for="quality">Calidad de imagen</label><select id="quality"><option value="high">Alta</option><option value="low">Reducida</option></select><button class="text-button" id="views-button">Archivo de vistas</button></div></details></div><div class="dialog-footer"><button class="button primary" data-close>Continuar la visita ${svg('arrow')}</button></div></dialog>
  <dialog class="guide-dialog" id="guide-dialog" aria-labelledby="guide-title"><div class="faja faja-thin" aria-hidden="true"></div><div class="dialog-header"><div><p class="kicker">Para leer las fotografías</p><h2 id="guide-title">Guía de la fiesta</h2></div><button class="icon-button" data-close aria-label="Cerrar guía">${svg('close')}</button></div><div class="dialog-body">
    <p class="guide-lede">Cada fin de año, el pueblo Boruca recuerda su resistencia a la conquista. Los diablitos son la comunidad; el toro, los conquistadores. El baile recorre el pueblo de casa en casa del 30 de diciembre al 2 de enero.</p>
    <h3 class="guide-h">El rito en cuatro momentos</h3>
    <ol class="rito-steps">
      <li><img src="${art('art-010.jpg')}" alt="El toro, cubierto de gangoche, frente a un diablito" loading="lazy" decoding="async" /><span class="step-n">1</span><h4>El encuentro</h4><p>Los diablitos provocan al toro y él embiste. El toro es una estructura de madera cubierta con gangoche; pesa unos 40 kilos y pasa de hombro en hombro.</p></li>
      <li><img src="${art('art-009.jpg')}" alt="Un tambor y varias flautas acompañan el recorrido" loading="lazy" decoding="async" /><span class="step-n">2</span><h4>Casa por casa</h4><p>Flautas, tambores, cuernos y caracoles acompañan al grupo. En las casas se comparte chicha, bebida de maíz fermentado.</p></li>
      <li><img src="${art('art-011.jpg')}" alt="Diablitos caídos frente al toro durante La Tumbazón" loading="lazy" decoding="async" /><span class="step-n">3</span><h4>La Tumbazón</h4><p>El toro derrota a los diablitos y estos caen. Después se levantan, lo buscan y lo conducen hacia el cierre.</p></li>
      <li><img src="${art('art-012.jpg')}" alt="El toro arde de noche entre los participantes" loading="lazy" decoding="async" /><span class="step-n">4</span><h4>La quema</h4><p>El toro arde entre música y gritos. El fuego termina la representación; la tradición continúa.</p></li>
    </ol>
    <h3 class="guide-h">Palabras de la fiesta</h3>
    <dl class="glossary">
      <div><dt>Diablitos</dt><dd>Los participantes enmascarados. Representan al pueblo Boruca que resistió.</dd></div>
      <div><dt>El toro</dt><dd>Encarna a los conquistadores. También lo llaman Xaman.</dd></div>
      <div><dt>Máscaras</dt><dd>Talladas en madera y pintadas a mano: jaguares, culebras, aves y calaveras.</dd></div>
      <div><dt>Máscara jugada</dt><dd>La que ya participó en el baile y guarda la memoria de esa experiencia.</dd></div>
      <div><dt>Gangoche</dt><dd>Tela de saco que cubre al toro y viste a los participantes, junto con hojas de plátano.</dd></div>
      <div><dt>Chicha</dt><dd>Bebida de maíz fermentado que se comparte durante el recorrido.</dd></div>
      <div><dt>La Tumbazón</dt><dd>El momento en que el toro vence y los diablitos caen, antes de levantarse otra vez.</dd></div>
    </dl>
    <p class="guide-credit">Fotografías y crónica: Alonso Solano / El Observador · ©PerroMudo.</p>
  </div></dialog>
  <dialog class="podium-dialog" id="podium-dialog" aria-label="Resultado final"></dialog>
  <dialog class="host-dialog" id="host-dialog" aria-labelledby="host-title"><div class="faja faja-thin" aria-hidden="true"></div><div class="dialog-header"><div><p class="kicker">Solo anfitrión</p><h2 id="host-title">Panel del anfitrión</h2></div><button class="icon-button" data-close aria-label="Cerrar panel">${svg('close')}</button></div><div class="dialog-body" id="host-body"></div></dialog>
  <dialog class="quiz-dialog" id="quiz-dialog" aria-labelledby="quiz-title"><div class="faja faja-thin" aria-hidden="true"></div><div class="dialog-header"><div><p class="kicker" id="quiz-kicker">El reto</p><h2 id="quiz-title" class="sr-only">El reto</h2></div><button class="icon-button" data-close aria-label="Cerrar el reto">${svg('close')}</button></div><div class="dialog-body" id="quiz-body"></div></dialog>
  <dialog class="catalog-dialog" id="catalog-dialog" aria-labelledby="catalog-title"><div class="dialog-header"><div><p class="kicker">Catálogo · 12 fotografías</p><h2 id="catalog-title">Fotografías del baile</h2></div><button class="icon-button" data-close aria-label="Cerrar fotografías">${svg('close')}</button></div><div class="dialog-body"><div id="catalog-grid"></div></div></dialog>
  <dialog class="detail-dialog" id="detail-dialog" aria-labelledby="detail-title"><div class="faja faja-thin" aria-hidden="true"></div><div class="dialog-header"><p id="detail-index"></p><div class="detail-nav"><button class="icon-button" id="detail-prev" aria-label="Fotografía anterior">${svg('prev')}</button><button class="icon-button" id="detail-next" aria-label="Fotografía siguiente">${svg('next')}</button><button class="icon-button" data-close aria-label="Cerrar ficha">${svg('close')}</button></div></div><div class="dialog-body" id="detail-content"></div></dialog>
  <dialog class="image-dialog" id="image-dialog" aria-labelledby="image-title"><div class="dialog-header"><h2 id="image-title">La obra en detalle</h2><button class="icon-button" data-close aria-label="Cerrar imagen">${svg('close')}</button></div><div class="dialog-body" id="image-content"></div></dialog>
  <dialog class="views-dialog" id="views-dialog" aria-labelledby="views-title"><div class="dialog-header"><div><p class="kicker">Diseño de las salas</p><h2 id="views-title">Archivo de vistas</h2></div><button class="icon-button" data-close aria-label="Cerrar vistas">${svg('close')}</button></div><div class="dialog-body"><div class="views-grid" id="views-grid"></div></div></dialog>
`;
const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const canvas = $<HTMLCanvasElement>('#gallery-canvas');
const welcome = $('#welcome');
let entryRequested = false;
const detailDialog = $<HTMLDialogElement>('#detail-dialog');
const catalogDialog = $<HTMLDialogElement>('#catalog-dialog');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let exhibition: Exhibition;
let renderer: THREE.WebGLRenderer | undefined;
let scene: THREE.Scene;
let daylight: THREE.DirectionalLight;
let reflections:ReflectionController|undefined;
let camera: THREE.PerspectiveCamera;
let model: THREE.Group | undefined;
let geometryLoaded = false, visiting = false, moving = false;
let point: Point = {x:0,z:0}, yaw = 0, pitch = 0;
let currentArtwork: Artwork | undefined;
const focusSession=new FocusSession();
let loweredQuality = false;
let modelHits: THREE.Object3D[] = [];
let rayIndex:StaticRayIndex;
const raycaster = new THREE.Raycaster();
const pointer=new THREE.Vector2();
let pendingHover:{x:number;y:number}|undefined;
let renderUntil=0,frameDirty=true,mapDirty=true;
const frames=new FramePump(loop);
function invalidate():void{frameDirty=true;renderUntil=performance.now()+80;frames.request();}
const keys = new Set<string>();
let dragging: {x:number;y:number;startX:number;startY:number;moved:number} | null = null;
let hoverArtwork: Artwork | undefined;
const viewNames = ['Sala I · Vista principal','Sala I · Contravista','El pasillo entre salas','Sala II · Vista principal','Sala II · Contravista','Obra y arquitectura · Detalle'];
/** Session-only progress for the class activity: who is visiting and which works they opened. */
const store={get(key:string):string|null{try{return sessionStorage.getItem(key);}catch{return null;}},set(key:string,value:string):void{try{sessionStorage.setItem(key,value);}catch{/* private mode */}}};
let playerName=store.get('diablitos.player')??'';
const seen=new Set<string>((store.get('diablitos.seen')??'').split(',').filter(Boolean));
/** Every answered question, kept for the session: points, speed and difficulty feed the (future) ranking. */
const answers:Answers={};
try{
  const stored=JSON.parse(store.get('diablitos.answers')??'{}') as Record<string,Answer>;
  for(const [key,value] of Object.entries(stored)){const index=Number(key);if(Number.isInteger(index)&&QUESTIONS[index]&&typeof value?.points==='number')answers[index]=value;}
}catch{/* corrupt session data: start clean */}
const saveAnswers=()=>store.set('diablitos.answers',JSON.stringify(answers));
const fmt=(value:number)=>Math.round(value).toLocaleString('es-CR');
const pct=(value:number)=>`${Math.round(value*100)} %`;
/** A section whose four photographs were just completed: its questions open when the photo panel closes. */
let promptSection:number|undefined;
let currentRoom:RoomKey|undefined;let chapterTimer=0;
let toastTimer = 0;

function textNode(tag: string, text: string, className = ''): HTMLElement {
  const node = document.createElement(tag); node.textContent = text; node.className = className; return node;
}
function toast(text: string): void {
  const node = $('#toast'); node.textContent=text;node.hidden=false;
  clearTimeout(toastTimer);toastTimer=window.setTimeout(()=>node.hidden=true,5000);
}
function imageElement(path: string, alt: string, loading: 'lazy'|'eager'='lazy'): HTMLElement {
  const wrapper = document.createElement('div');wrapper.className='image-wrap';
  const image = new Image();image.alt=alt;image.loading=loading;image.decoding='async';image.src=assetUrl(path);wrapper.append(image);
  // Catalog/dialog images are hidden at first; the cover alone has high priority.
  if(loading==='lazy')image.fetchPriority='low';
  image.addEventListener('error',()=>{
    image.hidden=true;
    const failure=document.createElement('div');failure.className='image-failure';
    failure.innerHTML=`${svg('image')}<span>Esta imagen no se pudo cargar.</span>`;
    const retry=document.createElement('button');retry.type='button';retry.textContent='Volver a cargar';
    retry.addEventListener('click',event=>{event.stopPropagation();failure.remove();image.hidden=false;const url=new URL(assetUrl(path));url.searchParams.set('retry',String(Date.now()));image.src=url.href;});
    failure.append(retry);wrapper.append(failure);
  });
  return wrapper;
}

const dialogs = Array.from(document.querySelectorAll<HTMLDialogElement>('dialog'));
const triggers = new WeakMap<HTMLDialogElement,HTMLElement>();
function stopAudio(): void { if ('speechSynthesis' in window) speechSynthesis.cancel();const audio=document.querySelector<HTMLButtonElement>('#audio-button');if(audio){audio.innerHTML=`${svg('audio')}<span>Escuchar</span>`;audio.setAttribute('aria-pressed','false');} }
function openDialog(dialog: HTMLDialogElement, modal = true): void {
  entryRequested = false;
  $('#entry-status').textContent = '';
  keys.clear();dragging=null;canvas.classList.remove('grabbing');$('#chapter').hidden=true;
  triggers.set(dialog,document.activeElement as HTMLElement);
  if(modal) dialog.setAttribute('closedby','any');else dialog.removeAttribute('closedby');
  if (!dialog.open) modal ? dialog.showModal() : dialog.show();
  dialog.querySelector<HTMLButtonElement>('[data-close]')?.focus();
}
for (const dialog of dialogs) {
  dialog.querySelectorAll<HTMLButtonElement>('[data-close]').forEach(button=>button.addEventListener('click',()=>dialog.close()));
  dialog.addEventListener('close',()=>{if(dialog.open)return;if(visiting){$('#hud').hidden=false;$('.topbar').hidden=false;}if(dialog===detailDialog){stopAudio();void returnToVisit();if(promptSection!==undefined){const section=promptSection;promptSection=undefined;window.setTimeout(()=>{if(!quizDialog.open){quizHome(section);openDialog(quizDialog);}},400);}}keys.clear();const previous=triggers.get(dialog);if(previous?.isConnected && !previous.closest('[hidden]') && !previous.closest('dialog:not([open])'))previous.focus();else if(visiting&&!uiBlocked())canvas.focus();});
  if(!('closedBy' in HTMLDialogElement.prototype)) dialog.addEventListener('click',event=>{if(event.target===dialog){const bounds=dialog.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)dialog.close();}});
}
const uiBlocked=()=>dialogs.some(dialog=>dialog.open);
document.addEventListener('keydown',event=>{
  if (event.key==='Escape' && detailDialog.open && !dialogs.some(d=>d!==detailDialog&&d.matches(':modal'))) {event.preventDefault();detailDialog.close();}
  if (detailDialog.open&&(event.key==='ArrowLeft'||event.key==='ArrowRight')&&!(event.target instanceof HTMLInputElement||event.target instanceof HTMLSelectElement)&&!dialogs.some(d=>d!==detailDialog&&d.open)){event.preventDefault();stepArtwork(event.key==='ArrowLeft'?-1:1);return;}
  if (!visiting||uiBlocked()||moving) return;
  const code=event.code;
  if (['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyQ','KeyE','ShiftLeft','ShiftRight'].includes(code)) {event.preventDefault();keys.add(code);frames.request();}
});
document.addEventListener('keyup',event=>keys.delete(event.code));
window.addEventListener('blur',()=>{keys.clear();dragging=null;});
document.addEventListener('visibilitychange',()=>{keys.clear();dragging=null;if(!document.hidden&&visiting)invalidate();});
$('#help-button').addEventListener('click',()=>openDialog($<HTMLDialogElement>('#help-dialog')));
for (const id of ['#catalog-button','#welcome-catalog']) $(id).addEventListener('click',()=>openDialog(catalogDialog));
for (const id of ['#views-button','#welcome-views']) $(id).addEventListener('click',()=>openDialog($<HTMLDialogElement>('#views-dialog')));
for (const id of ['#guide-button','#welcome-guide']) $(id).addEventListener('click',()=>openDialog($<HTMLDialogElement>('#guide-dialog')));
$('#exit-button').addEventListener('click',leaveGallery);
const hostPanel=mountHost($('#host-body'));
$('#host-open').addEventListener('click',()=>{openDialog($<HTMLDialogElement>('#host-dialog'));hostPanel.show();});
$('#host-dialog').addEventListener('close',()=>hostPanel.stop());
$('#quiz-button').addEventListener('click',openQuizHome);
$('#detail-prev').addEventListener('click',()=>stepArtwork(-1));
$('#detail-next').addEventListener('click',()=>stepArtwork(1));
$('#retry-load').addEventListener('click',()=>location.reload());

function stepArtwork(direction:number):void{
  if(!exhibition||!currentArtwork)return;const list=exhibition.artworks;
  showArtwork(list[(list.indexOf(currentArtwork)+direction+list.length)%list.length]);
}
function pendingTotal():number{
  return SECTIONS.reduce((total,_,section)=>total+(isUnlocked(section,seen)?pendingQuestions(section,answers).length:0),0);
}
function markSeen(artwork:Artwork):void{
  const section=sectionOfPhoto(artwork.id),wasOpen=section>=0&&isUnlocked(section,seen);
  seen.add(artwork.id);store.set('diablitos.seen',[...seen].join(','));updateSeen();
  if(section>=0&&!wasOpen&&isUnlocked(section,seen)){
    promptSection=section;
    toast(`Sección ${section+1} completa: se desbloquearon ${questionsOf(section).length} preguntas.`);
  }
}
function updateSeen():void{
  if(!exhibition)return;const count=exhibition.artworks.filter(a=>seen.has(a.id)).length,total=exhibition.artworks.length;
  $('#seen-count').textContent=String(count);$('#seen-total').textContent=String(total);
  $('#seen').classList.toggle('complete',count===total&&total>0);
  const pending=pendingTotal(),button=$('#quiz-button'),badge=$('#quiz-badge');
  button.classList.toggle('ready',pending>0);badge.hidden=pending===0;badge.textContent=String(pending);
  button.setAttribute('aria-label',pending?`El reto: ${pending} ${pending===1?'pregunta lista':'preguntas listas'}`:'El reto');
  $('#points-total').textContent=fmt(summarize(answers).points);
  document.querySelectorAll<HTMLElement>('[data-art]').forEach(node=>node.classList.toggle('is-seen',seen.has(node.dataset.art!)));
  mapDirty=true;
}
function showArtwork(artwork: Artwork): void {
  currentArtwork=artwork;stopAudio();markSeen(artwork);
  const index=exhibition.artworks.indexOf(artwork)+1;
  $('#detail-index').replaceChildren(textNode('span',pad(index),'detail-number'),textNode('span',`de ${pad(exhibition.artworks.length)}`,'detail-room'));
  const content=$('#detail-content');content.replaceChildren();
  const figure=imageElement(artwork.image,`${artwork.title}, fotografía de ${artwork.artist}`,'eager');figure.classList.add('detail-image');
  const zoom=document.createElement('button');zoom.type='button';zoom.className='zoom-button';zoom.setAttribute('aria-label','Ampliar la fotografía');zoom.innerHTML=svg('expand');zoom.addEventListener('click',()=>showLargeImage(artwork.image,artwork.title,artwork.artist));figure.append(zoom);
  const title=textNode('h2',artwork.title);title.id='detail-title';
  content.append(figure,title,textNode('p',artwork.description,'detail-description'),textNode('p',`Foto: ${artwork.artist} · ©PerroMudo`,'detail-credit'));
  const actions=document.createElement('div');actions.className='detail-actions';
  const returnButton=document.createElement('button');returnButton.className='button primary';returnButton.innerHTML=`${svg('walk')}<span>Seguir caminando</span>`;returnButton.hidden=!geometryLoaded||!visiting;returnButton.addEventListener('click',()=>detailDialog.close());actions.append(returnButton);
  const enlarge=document.createElement('button');enlarge.className='button zoom-action';enlarge.innerHTML=`${svg('expand')}<span>Ampliar</span>`;enlarge.addEventListener('click',()=>showLargeImage(artwork.image,artwork.title,artwork.artist));actions.append(enlarge);
  if ('speechSynthesis' in window) {
    const audio=document.createElement('button');audio.className='button';audio.id='audio-button';audio.setAttribute('aria-pressed','false');audio.innerHTML=`${svg('audio')}<span>Escuchar</span>`;
    audio.addEventListener('click',()=>{
      if (speechSynthesis.speaking) {stopAudio();return;}
      const utterance=new SpeechSynthesisUtterance(`${artwork.title}. ${artwork.description}`);utterance.lang='es';utterance.rate=.93;
      const voice=speechSynthesis.getVoices().find(v=>v.lang.startsWith('es'));if(voice)utterance.voice=voice;
      utterance.onend=stopAudio;utterance.onerror=()=>{stopAudio();toast('La lectura no está disponible. Puedes leer la descripción en la ficha.');};
      audio.setAttribute('aria-pressed','true');audio.innerHTML=`${svg('audio')}<span>Detener</span>`;speechSynthesis.speak(utterance);
    });actions.append(audio);
  }
  content.append(actions);detailDialog.scrollTop=0;
  if(visiting&&geometryLoaded){
    catalogDialog.close();detailDialog.dataset.mode='visit';openDialog(detailDialog,false);void focusArtwork(artwork);
  }else{detailDialog.dataset.mode='reading';openDialog(detailDialog,true);}
}
function showLargeImage(path: string, title: string, artist=''): void {
  $('#image-title').textContent=artist?`${title} · ${artist}`:title;
  $('#image-content').replaceChildren(imageElement(path,title,'eager'));
  openDialog($<HTMLDialogElement>('#image-dialog'));
}
function populateCatalog(): void {
  const grid=$('#catalog-grid');grid.replaceChildren();
  $('#catalog-dialog .kicker').textContent=`Catálogo · ${exhibition.artworks.length} fotografías`;
  for(const key of ['a','p','b'] as RoomKey[]){
    const works=exhibition.artworks.filter(a=>roomOf(a.position[0])===key);if(!works.length)continue;
    const group=document.createElement('section');group.className='catalog-room';
    const head=document.createElement('header');head.append(textNode('p',ROOMS[key].label,'catalog-room-label'),textNode('h3',ROOMS[key].name),textNode('p',`${works.length} ${works.length===1?'fotografía':'fotografías'}`,'catalog-room-count'));
    const list=document.createElement('div');list.className='catalog-grid';
    for (const artwork of works) {
      const card=document.createElement('article');card.className='art-card';card.dataset.art=artwork.id;
      // Separate image retry from the card's primary button to avoid nested interactive controls.
      const media=imageElement(artwork.image,`${artwork.title}, de ${artwork.artist}`);
      media.append(textNode('span',pad(exhibition.artworks.indexOf(artwork)+1),'art-number'),textNode('span','✓ Vista','art-seen'));
      card.append(media);
      const button=document.createElement('button');button.className='art-card-button';
      button.append(textNode('span',artwork.title,'art-title'));
      button.addEventListener('click',()=>showArtwork(artwork));card.append(button);
      card.querySelector('img')?.addEventListener('click',()=>showArtwork(artwork));list.append(card);
    }
    group.append(head,list);grid.append(group);
  }
  const views=$('#views-grid');views.replaceChildren();
  exhibition.renders.forEach((path,i)=>{
    const card=document.createElement('div');card.className='view-card';card.append(imageElement(path,viewNames[i]??`Vista ${i+1}`));
    const button=document.createElement('button');button.className='text-button';button.textContent=viewNames[i]??`Vista ${i+1}`;button.addEventListener('click',()=>showLargeImage(path,viewNames[i]??`Vista ${i+1}`));card.append(button);
    card.querySelector('img')?.addEventListener('click',()=>showLargeImage(path,viewNames[i]??`Vista ${i+1}`));views.append(card);
  });
}

function showEntryHelp(message: string, retry: boolean): void {
  entryRequested = false;
  $('#entry-status').textContent = '';
  $('#join-form').hidden = true;$('#entry-progress').hidden = true;
  $('#entry-help').hidden = false;
  $('#retry-load').hidden = !retry;
  $('#entry-error').textContent = message;
}
function setCamera(): void {
  if(camera.position.x===point.x&&camera.position.z===point.z&&camera.rotation.x===pitch&&camera.rotation.y===yaw)return;
  camera.position.set(point.x,1.65,point.z);camera.rotation.set(pitch,yaw,0,'YXZ');camera.updateMatrixWorld();mapDirty=true;invalidate();
}
function initRenderer(): void {
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
  renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
  scene=new THREE.Scene();scene.background=daylightSky();
  camera=new THREE.PerspectiveCamera(65,innerWidth/innerHeight,.08,180);
  const pmrem=new THREE.PMREMGenerator(renderer);const room=new RoomEnvironment();
  const env=pmrem.fromScene(room,.04);scene.environment=env.texture;room.dispose();pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xffffff,0x758b96,1.2));
  daylight=new THREE.DirectionalLight(0xfff1df,2);daylight.position.set(-10,18,-14);scene.add(daylight);
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();keys.clear();geometryLoaded=false;visiting=false;canvas.hidden=true;$('#hud').hidden=true;$('.topbar').hidden=true;welcome.hidden=false;showEntryHelp('Puedes volver a cargar la visita o seguir viendo las fotografías.',true);});
  window.addEventListener('resize',()=>{if(!renderer)return;camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);reflections?.setReduced(loweredQuality);updateFocusProjection();if(focusSession.active&&currentArtwork)void focusArtwork(currentArtwork);drawMinimap();});
}
async function initialize(): Promise<void> {
  try {
    const response=await fetch(assetUrl('data/exhibition.json'));if(!response.ok)throw new Error('No se pudo cargar la exposición.');
    exhibition=parseExhibition(await response.json());populateCatalog();updateSeen();setProgress(.04);
    $('.brand-name').textContent=exhibition.title;
    document.title=`${exhibition.title} · Museo digital`;
    if (!window.WebGL2RenderingContext||!document.createElement('canvas').getContext('webgl2')) {
      showEntryHelp('Conoce la exposición a través de las fotografías y las imágenes de las salas.',false);return;
    }
    initRenderer();
    const spawn=exhibition.navigation.spawn;point={x:spawn.position[0],z:spawn.position[2]};yaw=spawn.yaw;
    if(!canStand(point,exhibition.navigation))throw new Error('El punto de entrada de la galería está ocupado.');
    setCamera();
    const loader=new GLTFLoader();
    const [gltf,mask]=await Promise.all([
      loader.loadAsync(assetUrl(exhibition.model),event=>{if(event.total)setProgress(.06+.8*event.loaded/event.total);}),
      loader.loadAsync(assetUrl('models/boruca-owl-mask.glb')),
    ]);
    model=gltf.scene;scene.add(model);model.updateMatrixWorld(true);
    model.traverse(object=>{
      if(object instanceof THREE.Mesh){modelHits.push(object);object.frustumCulled=true;
        const materials=Array.isArray(object.material)?object.material:[object.material];
        for(const material of materials)if(material instanceof THREE.MeshStandardMaterial)material.envMapIntensity=.55;
      }
    });
    replaceFurnishings(model,mask.scene,exhibition.navigation);
    joinDoorwayWalls(model,exhibition.navigation);
    setProgress(.9);
    await addArtworkLabels(model,exhibition.artworks,Math.min(8,renderer!.capabilities.getMaxAnisotropy()),art=>ROOMS[roomOf(art.position[0])].label);
    modelHits=[];model.traverse(object=>{if(object instanceof THREE.Mesh&&object.visible)modelHits.push(object);});
    finishExterior(model,renderer!,daylight);
    finishFloor(model,scene,renderer!);
    reflections=addPlanarReflections(model,scene,exhibition.navigation);
    // Fail early if a stale export dropped the interactive metadata entirely.
    const available=new Set<string>();modelHits.forEach(object=>{const id=artworkId(object);if(id)available.add(id);});
    if(available.size===0&&exhibition.artworks.length>0)toast('Las fichas están disponibles desde Obras. Esta versión de la sala no tiene selección directa.');
    // Architecture, plants and lights are static. Initialize transforms once for all
    // main, transmission and reflection passes; only the visitor camera changes.
    scene.updateMatrixWorld(true);scene.matrixWorldAutoUpdate=false;
    model.traverse(object=>{object.matrixAutoUpdate=false;object.matrixWorldAutoUpdate=false;});
    rayIndex=new StaticRayIndex(modelHits);
    await renderer!.compileAsync(scene,camera);renderer!.render(scene,camera);
    geometryLoaded=true;setProgress(1);
    if(entryRequested)enterGallery();
    invalidate();
  } catch(error) {
    showEntryHelp('El recorrido no está disponible. Puedes volver a cargar o ver las fotografías.',true);
    console.error('Gallery load failed:',error);
  }
}
function setProgress(value:number):void{
  const ready=value>=1;$('#progress-fill').style.transform=`scaleX(${Math.max(.03,Math.min(1,value))})`;
  $('#entry-progress').classList.toggle('ready',ready);
  $('#progress-text').textContent=ready?'La sala está lista':`Preparando la sala · ${Math.round(value*100)} %`;
}
function enterGallery(): void {
  entryRequested=false;
  $('#entry-status').textContent='';$('#enter-button').classList.remove('waiting');
  $('#player-label').textContent=playerName?`Visitante: ${playerName}`:'Boruca · Museo digital';
  visiting=true;welcome.hidden=true;canvas.hidden=false;$('.topbar').hidden=false;$('#hud').hidden=false;canvas.focus();
  currentRoom=undefined;drawMinimap();invalidate();void syncScore();
}
function leaveGallery(): void {
  for(const dialog of dialogs)if(dialog.open)dialog.close();
  visiting=false;keys.clear();dragging=null;canvas.hidden=true;$('.topbar').hidden=true;$('#hud').hidden=true;welcome.hidden=false;
  $('#chapter').hidden=true;nameInput.focus();
}
const nameInput=$<HTMLInputElement>('#player-name');nameInput.value=playerName;
/** Online session of this student: the server token proves who they are if the page reloads. */
type Online={token:string;gameId:string};
let online:Online|undefined;
try{
  const saved=JSON.parse(store.get('diablitos.online')||'null') as Partial<Online>|null;
  if(saved&&typeof saved.token==='string'&&typeof saved.gameId==='string')online={token:saved.token,gameId:saved.gameId};
}catch{/* ignore */}
const saveOnline=()=>store.set('diablitos.online',online?JSON.stringify(online):'');
const joinWait=$('#join-wait');
let waitTimer=0,joining=false;
function stopWaiting():void{clearTimeout(waitTimer);waitTimer=0;joinWait.hidden=true;}
function joinProblem(message:string):void{
  $('#join-error').textContent=message;$('#join-error').hidden=false;
  nameInput.setAttribute('aria-invalid','true');nameInput.closest('.join-row')!.classList.add('invalid');
}
nameInput.addEventListener('input',()=>{
  $('#join-error').hidden=true;nameInput.removeAttribute('aria-invalid');nameInput.closest('.join-row')!.classList.remove('invalid');stopWaiting();
});
function proceedToVisit():void{
  if(geometryLoaded){enterGallery();return;}
  entryRequested=true;$('#enter-button').classList.add('waiting');
  $('#entry-status').textContent='La galería se abrirá en cuanto esté lista.';
}
function waitForHost(name:string):void{
  joinWait.hidden=false;joinWait.textContent='Todavía no hay una partida abierta. Esperando a que el anfitrión la inicie…';
  clearTimeout(waitTimer);waitTimer=window.setTimeout(()=>void tryJoin(name),3000);
}
/** Online if the server answers; otherwise the activity runs locally on this computer, as before. */
async function tryJoin(name:string):Promise<void>{
  if(joining)return;joining=true;
  try{
    const status=await api.status();
    if(!status.ok){
      if(status.offline){online=undefined;saveOnline();stopWaiting();proceedToVisit();return;}
      joinProblem(status.message);return;
    }
    if(!status.data.open){waitForHost(name);return;}
    const returning=online&&online.gameId===status.data.gameId?online.token:undefined;
    const joined=await api.join(name,returning);
    if(!joined.ok){
      if(joined.error==='sin_partida'){waitForHost(name);return;}
      stopWaiting();joinProblem(joined.message);return;
    }
    // A different game than the one this tab remembers: start its progress clean.
    if(online&&online.gameId!==joined.data.gameId)resetProgress();
    online={token:joined.data.token,gameId:joined.data.gameId};saveOnline();
    playerName=joined.data.name;store.set('diablitos.player',playerName);
    stopWaiting();proceedToVisit();
  }finally{joining=false;}
}
$<HTMLFormElement>('#join-form').addEventListener('submit',event=>{
  event.preventDefault();
  const name=nameInput.value.trim().replace(/\s+/g,' ');
  if(!name){$('#join-error').hidden=false;nameInput.setAttribute('aria-invalid','true');nameInput.closest('.join-row')!.classList.add('invalid');nameInput.focus();return;}
  playerName=name;store.set('diablitos.player',name);
  stopWaiting();void tryJoin(name);
});

/** Send raw answers (never points): the server scores them, so the ranking cannot be faked. */
let syncing=false,syncAgain=false,syncRetries=0;
function setRank(rank?:number,total?:number):void{$('#points-label').textContent=rank?`puntos · puesto ${rank}/${total}`:'puntos';}
function endOnline(message:string):void{toast(message);online=undefined;saveOnline();setRank();}
/** The host ended the game: every player sees the final podium once. */
const finishedGames=new Set<string>();
function showFinal(data:Podium):void{
  promptSection=undefined;
  for(const dialog of dialogs)if(dialog.open&&dialog.id!=='host-dialog'&&dialog.id!=='podium-dialog')dialog.close();
  showPodium(data);
}
async function presentFinal(session:Online):Promise<void>{
  if(finishedGames.has(session.gameId))return;finishedGames.add(session.gameId);
  const result=await api.podium(session.token);
  if(online?.gameId===session.gameId){online=undefined;saveOnline();setRank();}
  if(result.ok)showFinal(result.data);else toast('El anfitrión terminó la partida. Tus resultados quedaron guardados.');
}
/** Students find out the game ended by asking every few seconds; it is a tiny request. */
async function watchForEnd():Promise<void>{
  const session=online;if(!session||finishedGames.has(session.gameId))return;
  const status=await api.status();
  if(status.ok&&!status.data.open&&status.data.gameId===session.gameId)await presentFinal(session);
}
setInterval(()=>void watchForEnd(),4000);
async function syncScore():Promise<void>{
  if(!online)return;
  if(syncing){syncAgain=true;return;}
  syncing=true;
  try{
    do{
      syncAgain=false;const session=online;if(!session)break;
      const list:RawAnswer[]=Object.values(answers).filter(a=>Number.isInteger(a.choice)).map(a=>({question:a.question,choice:a.choice,ms:Math.round(a.ms)}));
      if(!list.length)break;
      const result=await api.score(session.token,list);
      if(result.ok){syncRetries=0;setRank(result.data.rank,result.data.total);}
      else if(result.error==='partida_terminada')void presentFinal(session);
      else if(result.error==='sesion_invalida')endOnline('Tu sesión en la partida ya no existe. Vuelve a la portada para entrar de nuevo.');
      else if(result.offline&&syncRetries<5){syncRetries++;window.setTimeout(()=>void syncScore(),8000*syncRetries);}
    }while(syncAgain&&online);
  }finally{syncing=false;}
}

function announceRoom(key:RoomKey):void{
  if(!exhibition)return;const room=ROOMS[key];const count=exhibition.artworks.filter(a=>roomOf(a.position[0])===key).length;
  $('#room-label').textContent=room.label;$('#room-name').textContent=room.name;
  const chapter=$('#chapter');chapter.querySelector('.chapter-label')!.textContent=room.label;chapter.querySelector('.chapter-name')!.textContent=room.name;
  chapter.querySelector('.chapter-count')!.textContent=`${count} ${count===1?'fotografía':'fotografías'}`;
  if(uiBlocked()||moving){chapter.hidden=true;return;}
  chapter.hidden=false;chapter.classList.remove('show');void chapter.offsetWidth;chapter.classList.add('show');
  clearTimeout(chapterTimer);chapterTimer=window.setTimeout(()=>{chapter.hidden=true;},3600);
}
function artworkId(object: THREE.Object3D): string | undefined {
  let ancestor:THREE.Object3D|null=object;
  while(ancestor){if(typeof ancestor.userData.artworkId==='string')return ancestor.userData.artworkId;
    if(/^Painting_art-\d+/.test(ancestor.name))return ancestor.name.match(/art-\d+/)?.[0];ancestor=ancestor.parent;}
  return undefined;
}
function pickArtwork(x: number,y: number): Artwork|undefined {
  if(!geometryLoaded||!visiting||uiBlocked())return;
  const bounds=canvas.getBoundingClientRect();raycaster.setFromCamera(pointer.set((x-bounds.left)/bounds.width*2-1,-(y-bounds.top)/bounds.height*2+1),camera);
  const hits=rayIndex.intersect(raycaster);
  for(const hit of hits){
    // Ignore fully transparent helper meshes; real opaque architecture occludes works.
    const mesh=hit.object as THREE.Mesh;const material=Array.isArray(mesh.material)?mesh.material[hit.face?.materialIndex??0]:mesh.material;
    if(!hit.object.visible||material?.visible===false||material?.opacity===0)continue;
    const id=artworkId(hit.object);return id?exhibition.artworks.find(a=>a.id===id):undefined;
  }
}
canvas.addEventListener('pointerdown',event=>{if(event.button!==0||uiBlocked()||moving)return;canvas.focus();dragging={x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY,moved:0};canvas.setPointerCapture(event.pointerId);canvas.classList.add('grabbing');});
canvas.addEventListener('pointermove',event=>{
  if(dragging){const dx=event.clientX-dragging.x,dy=event.clientY-dragging.y;dragging.moved+=Math.abs(dx)+Math.abs(dy);yaw-=dx*DRAG_YAW;pitch=THREE.MathUtils.clamp(pitch-dy*.0035,-1.1,1.1);dragging.x=event.clientX;dragging.y=event.clientY;invalidate();}
  else if(!moving){pendingHover={x:event.clientX,y:event.clientY};frames.request();}
});
canvas.addEventListener('pointerup',event=>{if(dragging)setCamera();if(dragging&&dragging.moved<6){const artwork=pickArtwork(event.clientX,event.clientY);if(artwork)showArtwork(artwork);}dragging=null;canvas.classList.remove('grabbing');if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);});
canvas.addEventListener('pointercancel',()=>{dragging=null;canvas.classList.remove('grabbing');});
canvas.addEventListener('pointerleave',()=>{pendingHover=undefined;if(!dragging){hoverArtwork=undefined;$('#hover-hint').hidden=true;canvas.classList.remove('art-hover');}});

let transition:{token:number;start:number;duration:number;from:CameraPose;to:CameraPose}|undefined;
let pendingRestorePose:CameraPose|undefined;
const currentPose=():CameraPose=>({point:{...point},yaw,pitch});
function applyPose(pose:CameraPose):void{point={...pose.point};yaw=pose.yaw;pitch=pose.pitch;setCamera();}
function updateFocusProjection():void{
  if(!camera)return;
  if(focusSession.active&&detailDialog.open&&detailDialog.dataset.mode==='visit'&&innerWidth>760){
    const panel=detailDialog.getBoundingClientRect();camera.setViewOffset(innerWidth,innerHeight,focusViewOffset(innerWidth,panel.left),0,innerWidth,innerHeight);
  }else camera.clearViewOffset();
  invalidate();
}
function focusTarget(artwork:Artwork):Point|null{
  const panel=detailDialog.getBoundingClientRect();const availableWidth=innerWidth>760?panel.left-64:innerWidth-64;
  const distance=framingDistance(artwork.width+.16,artwork.height+.16,camera.fov,innerHeight,availableWidth,innerHeight-200);
  return selectArtworkView(artwork,exhibition.navigation,distance,candidate=>hasArtworkSight(artwork,candidate,modelHits,artworkId,ray=>rayIndex.intersect(ray)));
}
async function moveCameraTo(target:CameraPose,token:number,forceFade=false):Promise<void>{
  transition=undefined;keys.clear();dragging=null;moving=true;$('#hover-hint').hidden=true;canvas.classList.remove('art-hover');
  pendingHover=undefined;hoverArtwork=undefined;
  if(reducedMotion.matches){$('#fade').classList.remove('active');if(focusSession.isCurrent(token)){applyPose(target);updateFocusProjection();moving=false;}return;}
  if(!forceFade&&clearPath(point,target.point,exhibition.navigation)&&!$('#fade').classList.contains('active')){
    const delta=Math.atan2(Math.sin(target.yaw-yaw),Math.cos(target.yaw-yaw));
    transition={token,start:performance.now(),duration:900,from:currentPose(),to:{...target,yaw:yaw+delta}};
    frames.request();
  }else{
    $('#fade').classList.add('active');await new Promise(resolve=>setTimeout(resolve,270));
    if(!focusSession.isCurrent(token))return;
    applyPose(target);updateFocusProjection();$('#fade').classList.remove('active');moving=false;
  }
}
async function focusArtwork(artwork:Artwork):Promise<void>{
  const token=focusSession.begin(pendingRestorePose??currentPose());pendingRestorePose=undefined;updateFocusProjection();
  const target=focusTarget(artwork);
  if(!target){
    moving=false;transition=undefined;$('#fade').classList.remove('active');detailDialog.dataset.mode='reading';updateFocusProjection();$('#hud').hidden=true;$('.topbar').hidden=true;
    const note=textNode('p','No hay una vista despejada desde el recorrido. Aquí puedes ver la obra en detalle.','focus-note');note.setAttribute('role','status');$('#detail-content').prepend(note);return;
  }
  const dx=artwork.position[0]-target.x,dz=artwork.position[2]-target.z;
  await moveCameraTo({point:target,yaw:Math.atan2(-dx,-dz),pitch:Math.atan2(artwork.position[1]-1.65,Math.hypot(dx,dz))},token);
}
async function returnToVisit():Promise<void>{
  const restore=focusSession.restore();if(!restore)return;
  pendingRestorePose=restore.pose;
  const safe=canStand(restore.pose.point,exhibition.navigation)?restore.pose.point:safeObservation(restore.pose.point,exhibition.navigation);
  if(!safe){transition=undefined;moving=false;$('#fade').classList.remove('active');camera.clearViewOffset();return;}
  await moveCameraTo({...restore.pose,point:safe},restore.token,true);
  if(focusSession.isCurrent(restore.token)){pendingRestorePose=undefined;if(visiting&&!uiBlocked())canvas.focus();}
}


/* ——— El reto: three sections of four photographs, two questions each ——— */
const quizDialog=$<HTMLDialogElement>('#quiz-dialog');
const DYES=[{name:'Añil',cls:'dye-anil'},{name:'Caracol',cls:'dye-caracol'},{name:'Achiote',cls:'dye-achiote'},{name:'Monte',cls:'dye-monte'}];
type QuizRun={section:number;list:number[];pos:number;current:number;started:number;frame:number;timeout:number;locked:boolean;reading:boolean};
let quiz:QuizRun|undefined;
const photoNumber=(id:string)=>Number(id.replace(/\D/g,''));
function quizButton(label:string,primary=true,icon:keyof typeof icons='arrow'):HTMLButtonElement{
  const button=document.createElement('button');button.type='button';button.className=`button${primary?' primary':''}`;button.innerHTML=`<span>${label}</span>${svg(icon)}`;return button;
}
function stopQuizTimer():void{if(quiz){cancelAnimationFrame(quiz.frame);clearTimeout(quiz.timeout);}}
function openQuizHome():void{quizHome();openDialog(quizDialog);}
function resetProgress():void{
  seen.clear();for(const key of Object.keys(answers))delete answers[Number(key)];
  store.set('diablitos.seen','');saveAnswers();promptSection=undefined;updateSeen();
}
/** Overview: the three sections, what is unlocked, and the running score. */
function quizHome(highlight?:number):void{
  stopQuizTimer();quiz=undefined;quizDialog.dataset.state='home';
  const summary=summarize(answers),finished=summary.answered===QUESTIONS.length;
  $('#quiz-kicker').textContent='El reto · 3 secciones';
  const body=$('#quiz-body');body.replaceChildren();
  const intro=document.createElement('div');intro.className='quiz-intro';
  intro.append(textNode('h3','Ve 4 fotos. Responde 2 preguntas.','quiz-hero'),
    textNode('p','Cada sección abre sus preguntas cuando conoces sus 4 fotografías. Mientras más rápido aciertes, más puntos ganas. Las últimas secciones son más difíciles y valen más.','quiz-lede'));
  const list=document.createElement('div');list.className='sections';
  let firstAction:HTMLButtonElement|undefined;
  SECTIONS.forEach((section,index)=>{
    const unlocked=isUnlocked(index,seen),pending=pendingQuestions(index,answers),ids=questionsOf(index),done=pending.length===0;
    const card=document.createElement('article');card.className=`sec ${done?'is-done':unlocked?'is-open':'is-locked'}${highlight===index?' is-new':''}`;
    const head=document.createElement('header');
    head.append(textNode('span',String(index+1),'sec-n'),textNode('h4',section.name),
      textNode('span',`${section.levelName} · vale ×${String(section.multiplier).replace('.',',')}`,'sec-level'));
    const photos=document.createElement('ul');photos.className='sec-photos';photos.setAttribute('aria-label',`Fotos vistas: ${seenInSection(index,seen)} de ${SECTION_SIZE}`);
    for(const id of section.photos)photos.append(textNode('li',String(photoNumber(id)),seen.has(id)?'is-seen':''));
    const status=document.createElement('p');status.className='sec-status';
    let action:HTMLButtonElement|undefined;
    if(done){
      const part=summarize(Object.fromEntries(ids.map(i=>[i,answers[i]])));
      status.textContent=`${part.correct} de ${ids.length} correctas · ${fmt(part.points)} pts · rapidez ${pct(part.avgSpeed)}`;
    }else if(unlocked){
      status.textContent=pending.length===1?'1 pregunta lista':`${pending.length} preguntas listas`;
      action=quizButton(pending.length===ids.length?'Responder':'Continuar');action.addEventListener('click',()=>startSection(index));firstAction??=action;
    }else{
      const missing=section.photos.filter(id=>!seen.has(id)).map(photoNumber);
      status.textContent=missing.length===1?`Te falta la foto ${missing[0]}`:`Te faltan las fotos ${missing.slice(0,-1).join(', ')} y ${missing[missing.length-1]}`;
    }
    card.append(head,photos,status);if(action)card.append(action);list.append(card);
  });
  const totals=document.createElement('dl');totals.className='quiz-totals';
  for(const [term,value] of [['Puntos',fmt(summary.points)],['Respondidas',`${summary.answered} de ${QUESTIONS.length}`],['Rapidez media',summary.answered?pct(summary.avgSpeed):'—']] as const){
    const cell=document.createElement('div');cell.append(textNode('dt',term),textNode('dd',value));totals.append(cell);
  }
  body.append(intro,list,totals);
  if(finished){
    const final=quizButton('Ver mi resultado final',true,'spark');final.addEventListener('click',quizFinal);body.append(final);
  }
  const reset=document.createElement('button');reset.type='button';reset.className='text-button quiz-reset';reset.textContent='Empezar de nuevo';
  let armed=false;
  reset.addEventListener('click',()=>{
    if(!armed){armed=true;reset.textContent='¿Seguro? Se borran tus fotos vistas y tus puntos. Toca otra vez.';return;}
    resetProgress();quizHome();
  });
  body.append(reset);firstAction?.focus();
}
function startSection(section:number):void{
  const list=pendingQuestions(section,answers);if(!list.length){quizHome();return;}
  quiz={section,list,pos:0,current:list[0],started:0,frame:0,timeout:0,locked:false,reading:true};quizQuestion();
}
/** Phase 1: only the question, with a countdown that can be skipped. Nothing to press yet. */
function quizQuestion():void{
  if(!quiz)return;const index=quiz.list[quiz.pos],q=QUESTIONS[index],section=SECTIONS[q.section];
  quiz.current=index;quiz.locked=false;quiz.reading=true;quizDialog.dataset.state='reading';
  const siblings=questionsOf(q.section);
  $('#quiz-kicker').textContent=`${section.name} · Pregunta ${siblings.indexOf(index)+1} de ${siblings.length}`;
  const body=$('#quiz-body');body.replaceChildren();
  const read=document.createElement('div');read.className='quiz-read';
  const level=textNode('p',`Nivel ${section.levelName.toLowerCase()} · vale hasta ${fmt(MAX_POINTS*section.multiplier)} puntos`,'quiz-level');
  level.prepend(textNode('span','●'.repeat(section.level)+'○'.repeat(3-section.level),'quiz-dots'));
  const prompt=textNode('p',q.prompt,'quiz-read-prompt');prompt.tabIndex=-1;
  const count=textNode('span',String(READ_TIME/1000),'quiz-count');
  const countdown=document.createElement('p');countdown.className='quiz-countdown';countdown.setAttribute('aria-live','off');
  countdown.append(count,textNode('span','Lee con calma. Las opciones aparecen al terminar la cuenta.','quiz-count-text'));
  const bar=document.createElement('div');bar.className='quiz-read-bar';const fill=document.createElement('i');bar.append(fill);
  const skip=quizButton('Ya la leí',false);skip.classList.add('quiz-skip');skip.addEventListener('click',skipReading);
  read.append(level,prompt,countdown,bar,skip);body.append(read);prompt.focus();
  const readStart=performance.now();
  const tick=(now:number)=>{
    if(!quiz||!quiz.reading)return;const left=Math.max(0,1-(now-readStart)/READ_TIME);
    fill.style.transform=`scaleX(${1-left})`;count.textContent=String(Math.max(1,Math.ceil(left*READ_TIME/1000)));
    quiz.frame=requestAnimationFrame(tick);
  };
  // Timers, not frames, decide the phases: they keep running if the tab is hidden.
  quiz.timeout=window.setTimeout(skipReading,READ_TIME);
  quiz.frame=requestAnimationFrame(tick);
}
function skipReading():void{if(quiz?.reading)quizAnswers();}
/** Phase 2: the question stays on top, the four options appear, and the answer clock starts. */
function quizAnswers():void{
  if(!quiz||!quiz.reading)return;stopQuizTimer();const q=QUESTIONS[quiz.current];quiz.reading=false;quizDialog.dataset.state='question';
  const body=$('#quiz-body');body.replaceChildren();
  const status=document.createElement('div');status.className='quiz-status';
  const timer=document.createElement('div');timer.className='quiz-timer';timer.setAttribute('role','progressbar');timer.setAttribute('aria-label','Tiempo restante');
  const fill=document.createElement('i');timer.append(fill);
  const seconds=textNode('span',String(QUESTION_TIME/1000),'quiz-seconds');
  status.append(timer,seconds,textNode('span',`${fmt(summarize(answers).points)} pts`,'quiz-score'));
  const stage=document.createElement('div');stage.className='quiz-stage';
  const figure=imageElement(q.image,'','eager');figure.classList.add('quiz-image');
  const prompt=textNode('p',q.prompt,'quiz-prompt');prompt.id='quiz-prompt';
  stage.append(figure,prompt);
  const options=document.createElement('div');options.className='quiz-options';options.setAttribute('role','group');options.setAttribute('aria-labelledby','quiz-prompt');
  q.options.forEach((option,i)=>{
    const button=document.createElement('button');button.type='button';button.className=`quiz-option ${DYES[i].cls}`;
    button.append(textNode('span',String(i+1),'quiz-key'),textNode('span',option,'quiz-text'));
    button.addEventListener('click',()=>answerQuiz(i));options.append(button);
  });
  const feedback=document.createElement('div');feedback.className='quiz-feedback';feedback.id='quiz-feedback';feedback.setAttribute('aria-live','polite');
  body.append(status,stage,options,feedback);
  options.querySelector<HTMLButtonElement>('.quiz-option')?.focus();
  quiz.started=performance.now();
  const tick=(now:number)=>{
    if(!quiz||quiz.locked)return;const left=Math.max(0,1-(now-quiz.started)/QUESTION_TIME);
    fill.style.transform=`scaleX(${left})`;timer.setAttribute('aria-valuenow',String(Math.round(left*100)));
    seconds.textContent=String(Math.ceil(left*QUESTION_TIME/1000));timer.classList.toggle('urgent',left<.25);
    quiz.frame=requestAnimationFrame(tick);
  };
  quiz.timeout=window.setTimeout(()=>answerQuiz(-1),QUESTION_TIME);
  quiz.frame=requestAnimationFrame(tick);
}
function answerQuiz(choice:number):void{
  if(!quiz||quiz.locked||quiz.reading)return;quiz.locked=true;stopQuizTimer();
  const run=quiz,index=run.current,q=QUESTIONS[index],answer=makeAnswer(index,choice,performance.now()-run.started);
  answers[index]=answer;saveAnswers();updateSeen();void syncScore();quizDialog.dataset.state='feedback';
  document.querySelectorAll<HTMLButtonElement>('.quiz-option').forEach((button,i)=>{button.disabled=true;button.classList.toggle('is-answer',i===q.answer);button.classList.toggle('is-wrong',i===choice&&!answer.correct);button.classList.toggle('is-muted',i!==q.answer&&i!==choice);});
  $('.quiz-score').textContent=`${fmt(summarize(answers).points)} pts`;
  const feedback=$('#quiz-feedback');feedback.className=`quiz-feedback ${answer.correct?'good':'bad'}`;
  const headline=choice<0?'Se acabó el tiempo.':answer.correct?`¡Correcto! +${fmt(answer.points)}`:'No era esa.';
  const last=run.pos+1>=run.list.length;
  const next=quizButton(last?'Ver la sección':'Siguiente');
  next.addEventListener('click',()=>{if(quiz!==run)return;if(last)quizSectionDone(run.section);else{run.pos++;quizQuestion();}});
  const parts:HTMLElement[]=[textNode('strong',headline),textNode('p',q.why),next];
  if(answer.correct){
    const speed=document.createElement('div');speed.className='quiz-speed';
    const track=document.createElement('span');track.className='quiz-speed-track';const level=document.createElement('i');level.style.transform=`scaleX(${answer.speed})`;track.append(level);
    speed.append(textNode('span',`Rapidez ${pct(answer.speed)}`),track);parts.push(speed);
  }
  feedback.replaceChildren(...parts);next.focus();
}
function quizSectionDone(section:number):void{
  if(Object.keys(answers).length===QUESTIONS.length){quizFinal();return;}
  quizDialog.dataset.state='results';$('#quiz-kicker').textContent='Sección completada';
  const ids=questionsOf(section),part=summarize(Object.fromEntries(ids.map(i=>[i,answers[i]]).filter(([,a])=>a)));
  const body=$('#quiz-body');body.replaceChildren();
  const card=document.createElement('div');card.className='quiz-result';
  card.append(textNode('p',`Sección ${section+1} · ${SECTIONS[section].name}`,'quiz-player'),
    textNode('p',part.correct===ids.length?'¡Sección perfecta!':part.correct?'¡Buen avance!':'Sigue explorando','quiz-title'),
    textNode('p',fmt(part.points),'quiz-total'),
    textNode('p',`puntos en esta sección · ${part.correct} de ${ids.length} correctas · rapidez ${part.answered?pct(part.avgSpeed):'—'}`,'quiz-sub'));
  const actions=document.createElement('div');actions.className='quiz-actions';
  const progress=quizButton('Ver mi progreso',false,'spark');progress.addEventListener('click',()=>quizHome());
  const back=quizButton(visiting?'Seguir recorriendo':'Cerrar',true,'walk');back.addEventListener('click',()=>quizDialog.close());
  actions.append(progress,back);body.append(card,actions);back.focus();quiz=undefined;
}
function quizFinal():void{
  stopQuizTimer();quiz=undefined;quizDialog.dataset.state='results';$('#quiz-kicker').textContent='Resultado final';
  const summary=summarize(answers),body=$('#quiz-body');body.replaceChildren();
  const card=document.createElement('div');card.className='quiz-result';
  const levels=document.createElement('ul');levels.className='quiz-levels';
  for(const level of [1,2,3] as Level[]){
    const stat=summary.byLevel[level],item=document.createElement('li');
    item.append(textNode('b',`${stat.correct}/${stat.answered}`),textNode('span',SECTIONS[level-1].levelName));levels.append(item);
  }
  card.append(textNode('p',playerName||'Visitante','quiz-player'),textNode('p',verdict(summary.correct,summary.answered),'quiz-title'),
    textNode('p',fmt(summary.points),'quiz-total'),
    textNode('p',`puntos · ${summary.correct} de ${summary.answered} correctas · rapidez media ${pct(summary.avgSpeed)}`,'quiz-sub'),levels);
  const actions=document.createElement('div');actions.className='quiz-actions';
  const progress=quizButton('Ver mi progreso',false,'spark');progress.addEventListener('click',()=>quizHome());
  const back=quizButton(visiting?'Volver al museo':'Cerrar',true,'walk');back.addEventListener('click',()=>quizDialog.close());
  actions.append(progress,back);body.append(card,actions);back.focus();
}
quizDialog.addEventListener('keydown',event=>{
  const state=quizDialog.dataset.state;
  if(state==='question'&&/^[1-4]$/.test(event.key)){event.preventDefault();answerQuiz(Number(event.key)-1);}
  else if(state==='reading'&&(event.key==='Enter'||event.key===' ')){event.preventDefault();skipReading();}
});
quizDialog.addEventListener('close',()=>{stopQuizTimer();quiz=undefined;});

const quality=$<HTMLSelectElement>('#quality');
function applyQuality(low:boolean):void{loweredQuality=low;renderer?.setPixelRatio(low?Math.min(devicePixelRatio,1):Math.min(devicePixelRatio,1.5));renderer?.setSize(innerWidth,innerHeight);reflections?.setReduced(low);invalidate();}
quality.addEventListener('change',()=>applyQuality(quality.value==='low'));
function drawMinimap():void{
  if(!exhibition)return;
  const map=$<HTMLCanvasElement>('#minimap');const ctx=map.getContext('2d')!;const width=map.clientWidth,height=map.clientHeight;
  // A hidden HUD has no layout box; don't derive a negative drawing scale.
  if($('#hud').hidden || width<=8 || height<=8)return;
  const dpr=Math.min(devicePixelRatio,2);map.width=width*dpr;map.height=height*dpr;ctx.scale(dpr,dpr);
  const areas=exhibition.navigation.walkable;const minX=Math.min(...areas.map(a=>a.x1)),maxX=Math.max(...areas.map(a=>a.x2)),minZ=Math.min(...areas.map(a=>a.z1)),maxZ=Math.max(...areas.map(a=>a.z2));
  const scale=Math.min((width-8)/(maxX-minX),(height-8)/(maxZ-minZ));const offsetX=(width-(maxX-minX)*scale)/2,offsetZ=(height-(maxZ-minZ)*scale)/2;
  const x=(value:number)=>offsetX+(value-minX)*scale,z=(value:number)=>offsetZ+(value-minZ)*scale;
  ctx.fillStyle='#f3e6cc';ctx.strokeStyle='#d2bb90';ctx.lineWidth=1.5;
  for(const area of areas){ctx.fillRect(x(area.x1),z(area.z1),(area.x2-area.x1)*scale,(area.z2-area.z1)*scale);ctx.strokeRect(x(area.x1),z(area.z1),(area.x2-area.x1)*scale,(area.z2-area.z1)*scale);}
  ctx.fillStyle='#c9b48c';
  for(const box of exhibition.navigation.boxes){ctx.save();ctx.translate(x((box.minX+box.maxX)/2),z((box.minZ+box.maxZ)/2));ctx.rotate(box.rotation??0);ctx.fillRect(-(box.maxX-box.minX)*scale/2,-(box.maxZ-box.minZ)*scale/2,(box.maxX-box.minX)*scale,(box.maxZ-box.minZ)*scale);ctx.restore();}
  for(const box of exhibition.navigation.orientedBoxes??[]){ctx.save();ctx.translate(x(box.x),z(box.z));ctx.rotate(box.rotation);ctx.fillRect(-box.width*scale/2,-box.depth*scale/2,box.width*scale,box.depth*scale);ctx.restore();}
  for(const column of exhibition.navigation.circles){ctx.beginPath();ctx.arc(x(column.x),z(column.z),column.r*scale,0,Math.PI*2);ctx.fill();}
  for(const art of exhibition.artworks){ctx.beginPath();ctx.arc(x(art.position[0]),z(art.position[2]),2,0,Math.PI*2);if(seen.has(art.id)){ctx.fillStyle='#2fa36b';ctx.fill();}else{ctx.strokeStyle='#e5502f';ctx.lineWidth=1.5;ctx.stroke();}}
  ctx.save();ctx.translate(x(point.x),z(point.z));ctx.rotate(-yaw);ctx.fillStyle='#1f2859';ctx.beginPath();ctx.moveTo(0,-6);ctx.lineTo(-3.5,4);ctx.lineTo(0,2);ctx.lineTo(3.5,4);ctx.closePath();ctx.fill();ctx.restore();
  const room=roomOf(point.x);if(room!==currentRoom){currentRoom=room;announceRoom(room);}
  mapDirty=false;
}

// Movement tuning. Per fixed step (1/120 s) the visitor moves at most RUN_SPEED/120 m, far below the collision radius.
const WALK_SPEED=3.5;   // metres per second (was 2.3)
const RUN_SPEED=6;      // metres per second with Shift (was 4.2)
const TURN_SPEED=2.5;   // radians per second for Q/E (was 1.7)
const DRAG_YAW=.0065;   // radians per pixel when dragging the mouse (was .0045)
let previousTime=0,accumulator=0,lastMap=0;
function loop(time:number):boolean{
  if(!renderer||!geometryLoaded||!visiting||document.hidden){previousTime=0;accumulator=0;return false;}
  const actualDelta=previousTime?(time-previousTime)/1000:1/60;previousTime=time;
  {
    if(transition){
      if(!focusSession.isCurrent(transition.token)){transition=undefined;}
      else{const t=Math.min(1,(time-transition.start)/transition.duration),e=t*t*(3-2*t);point={x:transition.from.point.x+(transition.to.point.x-transition.from.point.x)*e,z:transition.from.point.z+(transition.to.point.z-transition.from.point.z)*e};yaw=transition.from.yaw+(transition.to.yaw-transition.from.yaw)*e;pitch=transition.from.pitch+(transition.to.pitch-transition.from.pitch)*e;if(t===1){transition=undefined;moving=false;}}
    }
    accumulator+=Math.min(actualDelta,.15);const step=1/120;
    while(accumulator>=step){
      if(!uiBlocked()&&!moving){
        const forward=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0);
        const sideways=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0);
        const turn=(keys.has('KeyQ')?1:0)-(keys.has('KeyE')?1:0);yaw+=turn*TURN_SPEED*step;
        const speed=keys.has('ShiftLeft')||keys.has('ShiftRight')?RUN_SPEED:WALK_SPEED;const length=Math.max(1,Math.hypot(forward,sideways));
        const dx=(-Math.sin(yaw)*forward+Math.cos(yaw)*sideways)/length*speed*step,dz=(-Math.cos(yaw)*forward-Math.sin(yaw)*sideways)/length*speed*step;
        if(dx||dz)point=moveSafely(point,dx,dz,exhibition.navigation);
      }
      accumulator-=step;
    }
    setCamera();
    if(pendingHover){
      const next=pickArtwork(pendingHover.x,pendingHover.y);pendingHover=undefined;
      if(next?.id!==hoverArtwork?.id){hoverArtwork=next;const hint=$('#hover-hint');hint.hidden=!next;canvas.classList.toggle('art-hover',!!next);if(next)hint.replaceChildren(textNode('span',pad(exhibition.artworks.indexOf(next)+1),'hint-number'),textNode('strong',next.title),textNode('span',seen.has(next.id)?'Ya la viste · clic para abrirla':'Clic para abrir la ficha','hint-action'));}
    }
    // Give throttled mirrors time to capture the final pose before going idle.
    if(frameDirty||time<renderUntil){renderer.render(scene,camera);if(mapDirty&&time-lastMap>100){drawMinimap();lastMap=time;}frameDirty=false;}
  }
  const active=!!transition||(!uiBlocked()&&!moving&&keys.size>0)||time<renderUntil;
  if(!active){if(mapDirty)drawMinimap();previousTime=0;accumulator=0;}
  return active;
}

void initialize();

