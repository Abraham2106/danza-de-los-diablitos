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

const icons = {
  arrow:'<path d="M4 9h10M10 5l4 4-4 4"/>', close:'<path d="m5 5 8 8M13 5l-8 8"/>',
  help:'<circle cx="9" cy="9" r="7"/><path d="M7 6a2 2 0 1 1 3.1 1.7C9 8.4 9 9 9 10"/><path d="M9 13h.01"/>',
  grid:'<rect x="2" y="2" width="5" height="5"/><rect x="11" y="2" width="5" height="5"/><rect x="2" y="11" width="5" height="5"/><rect x="11" y="11" width="5" height="5"/>',
  image:'<rect x="2" y="3" width="14" height="12"/><path d="m3 13 4-4 3 3 2-2 3 3"/><circle cx="12" cy="6" r="1"/>',
  audio:'<path d="M3 7h3l4-4v12l-4-4H3zM13 6a5 5 0 0 1 0 6M15 3a9 9 0 0 1 0 12"/>',
  expand:'<path d="M6 2H2v4M12 2h4v4M2 12v4h4M16 12v4h-4"/>',
  walk:'<circle cx="10" cy="3" r="1.5"/><path d="m7 8 2-3 3 4 3 1M9 6l-1 6-4 4M8 12l4 4M7 8 3 10"/>',
};
const svg = (name: keyof typeof icons) => `<svg viewBox="0 0 18 18" aria-hidden="true">${icons[name]}</svg>`;
const brandMark = '<span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span>';
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <canvas id="gallery-canvas" tabindex="0" aria-label="Recorrido por la galería. Usa WASD o las flechas para caminar y arrastra el ratón para mirar." hidden></canvas>
  <header class="topbar" hidden>
    <div class="brand">${brandMark}<div><p class="brand-name">Baile de los Diablitos</p><p class="brand-meta">Boruca · Exposición fotográfica</p></div></div>
    <nav class="toolbar" aria-label="Visita">
      <button class="text-button" id="catalog-button">${svg('grid')}<span>Fotografías</span></button>
      <button class="text-button" id="views-button">${svg('image')}<span>Vistas</span></button>
      <span class="toolbar-divider" aria-hidden="true"></span>
      <label class="quality-label" for="quality">Calidad</label>
      <select class="quality" id="quality" aria-label="Calidad de la visita"><option value="auto">Automática</option><option value="high">Alta</option><option value="low">Reducida</option></select>
      <button class="icon-button" id="help-button" aria-label="Cómo visitar">${svg('help')}</button>
    </nav>
  </header>
  <main class="welcome" id="welcome" aria-labelledby="exhibition-title">
    <div class="welcome-copy">
      <div class="wordmark">${brandMark} Galería virtual</div>
      <p class="eyebrow">Una exposición para recorrer</p>
      <h1 id="exhibition-title">Baile de los<br/><em>Diablitos.</em></h1>
      <p class="welcome-subtitle" id="exhibition-subtitle">Una tradición viva del pueblo Boruca · Máscaras, música y resistencia</p>
      <p class="welcome-context">Un recorrido por la resistencia y la memoria del pueblo Boruca. La crónica relata la celebración del 31 de diciembre de 2024 al 2 de enero de 2025 y su reconocimiento como Patrimonio Cultural Inmaterial de Costa Rica desde 2017.</p>
      <div class="welcome-actions">
        <button class="button primary" id="enter-button" disabled>Entrar a la galería ${svg('arrow')}</button>
        <button class="text-button" id="welcome-catalog">Ver fotografías</button>
      </div>
      <div class="progress-section"><div class="progress-track" aria-hidden="true"><i id="load-progress"></i></div><p id="load-status" role="status" aria-live="polite">Preparando la exposición…</p><button id="retry-load" class="text-button" hidden>Volver a cargar</button></div>
      <p class="welcome-footnote">Recorre las salas desde tu computadora.<br/>Camina con WASD o las flechas. Arrastra para mirar.<br/><button class="text-button" id="welcome-views">Explorar las seis vistas ${svg('arrow')}</button></p>
    </div>
    <div class="welcome-visual">
      <div class="visual-placeholder">${brandMark}</div>
      <img id="cover" alt="Vista de la sala principal de la galería" decoding="async" fetchpriority="high" hidden/>
      <div class="welcome-visual-label"><span>El espacio<br/>para detenerse.</span><p id="cover-caption">Dos salas · Un recorrido</p></div>
    </div>
  </main>
  <div class="hud" id="hud" hidden>
    <div class="map-card"><div class="map-heading"><strong id="room-label">Sala A</strong><span>Tu recorrido</span></div><canvas id="minimap" aria-label="Mapa de la galería y posición del visitante"></canvas><p class="map-caption"><i></i>Estás aquí</p></div>
    <div class="walk-hint"><span><kbd>W A S D</kbd>Caminar</span><span>Arrastrar · Mirar</span><button class="text-button" id="hint-help">Controles ${svg('help')}</button></div>
    <div class="crosshair" aria-hidden="true"></div>
    <p id="hover-hint" hidden></p><p id="toast" role="status" aria-live="polite" hidden></p>
  </div>
  <div class="fade" id="fade" aria-hidden="true"></div>
  <dialog id="help-dialog" aria-labelledby="help-title"><div class="dialog-header"><h2 id="help-title">A tu propio ritmo</h2><button class="icon-button" data-close aria-label="Cerrar instrucciones">${svg('close')}</button></div><div class="dialog-body"><p>Explora las dos salas y el pasillo. Selecciona una obra para conocer su historia o verla de cerca.</p><dl class="controls-list"><div><dt>WASD o flechas</dt><dd>Caminar por la galería.</dd></div><div><dt>Arrastrar el ratón</dt><dd>Mirar alrededor.</dd></div><div><dt>Q / E</dt><dd>Girar a izquierda o derecha.</dd></div><div><dt>Shift</dt><dd>Caminar más rápido.</dd></div><div><dt>Clic en una obra</dt><dd>Acercar y encuadrar la obra junto a su descripción. Al cerrar, vuelves a tu vista anterior.</dd></div><div><dt>Escape</dt><dd>Cerrar una ficha o ventana.</dd></div></dl><p style="margin-top:24px;margin-bottom:0">También puedes recorrer todas las obras desde el catálogo, sin moverte por las salas.</p></div><div class="dialog-footer"><button class="button primary" data-close>Continuar la visita ${svg('arrow')}</button></div></dialog>
  <dialog class="catalog-dialog" id="catalog-dialog" aria-labelledby="catalog-title"><div class="dialog-header"><div><p class="eyebrow">La colección</p><h2 id="catalog-title">Las obras</h2></div><button class="icon-button" data-close aria-label="Cerrar catálogo">${svg('close')}</button></div><div class="dialog-body"><p class="catalog-description" id="catalog-description">Selecciona una obra para descubrir su historia.</p><div class="catalog-grid" id="catalog-grid"></div></div></dialog>
  <dialog class="detail-dialog" id="detail-dialog" aria-labelledby="detail-title"><div class="dialog-header"><p id="detail-index"></p><button class="icon-button" data-close aria-label="Cerrar ficha">${svg('close')}</button></div><div class="dialog-body" id="detail-content"></div></dialog>
  <dialog class="image-dialog" id="image-dialog" aria-labelledby="image-title"><div class="dialog-header"><h2 id="image-title">La obra en detalle</h2><button class="icon-button" data-close aria-label="Cerrar imagen">${svg('close')}</button></div><div class="dialog-body" id="image-content"></div></dialog>
  <dialog class="views-dialog" id="views-dialog" aria-labelledby="views-title"><div class="dialog-header"><div><p class="eyebrow">La arquitectura</p><h2 id="views-title">Seis miradas a la galería</h2></div><button class="icon-button" data-close aria-label="Cerrar vistas">${svg('close')}</button></div><div class="dialog-body"><p class="views-note">Vistas de la galería para explorar su espacio y sus detalles.</p><div class="views-grid" id="views-grid"></div></div></dialog>
`;
const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const canvas = $<HTMLCanvasElement>('#gallery-canvas');
const welcome = $('#welcome');
const enterButton = $<HTMLButtonElement>('#enter-button');
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
let selectedMode = 'auto', loweredQuality = false;
let modelHits: THREE.Object3D[] = [];
const raycaster = new THREE.Raycaster();
const keys = new Set<string>();
let dragging: {x:number;y:number;startX:number;startY:number;moved:number} | null = null;
let hoverArtwork: Artwork | undefined;
const viewNames = ['Sala A · Vista principal','Sala A · Contravista','El pasillo entre salas','Sala B · Vista principal','Sala B · Contravista','Obra y arquitectura · Detalle'];
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
function stopAudio(): void { if ('speechSynthesis' in window) speechSynthesis.cancel();const audio=$<HTMLButtonElement>('#audio-button');if(audio){audio.innerHTML=`${svg('audio')} Escuchar la descripción`;audio.setAttribute('aria-pressed','false');} }
function openDialog(dialog: HTMLDialogElement, modal = true): void {
  keys.clear();dragging=null;canvas.classList.remove('grabbing');
  triggers.set(dialog,document.activeElement as HTMLElement);
  if(modal) dialog.setAttribute('closedby','any');else dialog.removeAttribute('closedby');
  if (!dialog.open) modal ? dialog.showModal() : dialog.show();
  dialog.querySelector<HTMLButtonElement>('[data-close]')?.focus();
}
for (const dialog of dialogs) {
  dialog.querySelectorAll<HTMLButtonElement>('[data-close]').forEach(button=>button.addEventListener('click',()=>dialog.close()));
  dialog.addEventListener('close',()=>{if(dialog.open)return;if(dialog===detailDialog){stopAudio();void returnToVisit();}keys.clear();const previous=triggers.get(dialog);if(previous?.isConnected && !previous.closest('[hidden]') && !previous.closest('dialog:not([open])'))previous.focus();else if(visiting&&!uiBlocked())canvas.focus();});
  if(!('closedBy' in HTMLDialogElement.prototype)) dialog.addEventListener('click',event=>{if(event.target===dialog){const bounds=dialog.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)dialog.close();}});
}
const uiBlocked=()=>dialogs.some(dialog=>dialog.open);
document.addEventListener('keydown',event=>{
  if (event.key==='Escape' && detailDialog.open && !dialogs.some(d=>d!==detailDialog&&d.matches(':modal'))) {event.preventDefault();detailDialog.close();}
  if (!visiting||uiBlocked()||moving) return;
  const code=event.code;
  if (['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyQ','KeyE','ShiftLeft','ShiftRight'].includes(code)) {event.preventDefault();keys.add(code);}
});
document.addEventListener('keyup',event=>keys.delete(event.code));
window.addEventListener('blur',()=>{keys.clear();dragging=null;});
document.addEventListener('visibilitychange',()=>{keys.clear();dragging=null;});
$('#help-button').addEventListener('click',()=>openDialog($<HTMLDialogElement>('#help-dialog')));
$('#hint-help').addEventListener('click',()=>openDialog($<HTMLDialogElement>('#help-dialog')));
for (const id of ['#catalog-button','#welcome-catalog']) $(id).addEventListener('click',()=>openDialog(catalogDialog));
for (const id of ['#views-button','#welcome-views']) $(id).addEventListener('click',()=>openDialog($<HTMLDialogElement>('#views-dialog')));
$('#retry-load').addEventListener('click',()=>location.reload());

function showArtwork(artwork: Artwork): void {
  currentArtwork=artwork;stopAudio();
  $('#detail-index').textContent=`FOTOGRAFÍA ${String(exhibition.artworks.indexOf(artwork)+1).padStart(2,'0')} / ${exhibition.artworks.length}`;
  const content=$('#detail-content');content.replaceChildren();
  content.append(imageElement(artwork.image,`${artwork.title}, de ${artwork.artist}`,'eager'),textNode('h2',artwork.title),textNode('p',artwork.artist,'detail-artist'),textNode('p',artwork.year,'detail-year'),textNode('p',artwork.description,'detail-description'));
  content.querySelector('h2')!.id='detail-title';
  const source=textNode('p',`Procedencia: ${artwork.source}.`,'detail-source');content.append(source);
  const actions=document.createElement('div');actions.className='detail-actions';
  const closeView=document.createElement('button');closeView.className='button';closeView.innerHTML=`${svg('expand')}Ampliar`;closeView.addEventListener('click',()=>showLargeImage(artwork.image,artwork.title,artwork.artist));actions.append(closeView);
  const returnButton=document.createElement('button');returnButton.className='button primary';returnButton.innerHTML=`${svg('walk')}Volver al recorrido`;returnButton.hidden=!geometryLoaded||!visiting;returnButton.addEventListener('click',()=>detailDialog.close());actions.append(returnButton);content.append(actions);
  if ('speechSynthesis' in window) {
    const audio=document.createElement('button');audio.className='button detail-audio';audio.id='audio-button';audio.setAttribute('aria-pressed','false');audio.innerHTML=`${svg('audio')}Escuchar la descripción`;
    audio.addEventListener('click',()=>{
      if (speechSynthesis.speaking) {stopAudio();return;}
      const utterance=new SpeechSynthesisUtterance(`${artwork.title}. ${artwork.artist}. ${artwork.year}. ${artwork.description}`);utterance.lang='es';utterance.rate=.93;
      const voice=speechSynthesis.getVoices().find(v=>v.lang.startsWith('es'));if(voice)utterance.voice=voice;
      utterance.onend=stopAudio;utterance.onerror=()=>{stopAudio();toast('La lectura no está disponible. Puedes leer la descripción en la ficha.');};
      audio.setAttribute('aria-pressed','true');audio.innerHTML=`${svg('audio')}Detener lectura`;speechSynthesis.speak(utterance);
    });content.append(audio);
  }
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
  $('#catalog-description').textContent=`${exhibition.artworks.length} fotografías del Baile de los Diablitos. Selecciona una para acercarte y conocer su contexto.`;
  const grid=$('#catalog-grid');grid.replaceChildren();
  for (const artwork of exhibition.artworks) {
    const card=document.createElement('article');card.className='art-card';
    // Separate image retry from the card's primary button to avoid nested interactive controls.
    card.append(imageElement(artwork.image,`${artwork.title}, de ${artwork.artist}`));
    const button=document.createElement('button');button.className='art-card';button.append(textNode('h3',artwork.title),textNode('p',artwork.artist,'artist'),textNode('p',artwork.year,'year'));button.addEventListener('click',()=>showArtwork(artwork));card.append(button);
    card.querySelector('img')?.addEventListener('click',()=>showArtwork(artwork));grid.append(card);
  }
  const views=$('#views-grid');views.replaceChildren();
  exhibition.renders.forEach((path,i)=>{
    const card=document.createElement('div');card.className='view-card';card.append(imageElement(path,viewNames[i]??`Vista ${i+1}`));
    const button=document.createElement('button');button.className='text-button';button.textContent=viewNames[i]??`Vista ${i+1}`;button.addEventListener('click',()=>showLargeImage(path,viewNames[i]??`Vista ${i+1}`));card.append(button);
    card.querySelector('img')?.addEventListener('click',()=>showLargeImage(path,viewNames[i]??`Vista ${i+1}`));views.append(card);
  });
}

function setLoad(message: string, percent?: number): void {$('#load-status').textContent=message;if(percent!==undefined)$('#load-progress').style.width=`${percent}%`;}
function setCamera(): void {camera.position.set(point.x,1.65,point.z);camera.rotation.set(pitch,yaw,0,'YXZ');}
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
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();keys.clear();geometryLoaded=false;visiting=false;canvas.hidden=true;$('#hud').hidden=true;$('.topbar').hidden=true;welcome.hidden=false;enterButton.disabled=true;$('#retry-load').hidden=false;setLoad('La visita se interrumpió. Vuelve a cargarla o explora las obras y las vistas.');});
  window.addEventListener('resize',()=>{if(!renderer)return;camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);reflections?.setReduced(loweredQuality);updateFocusProjection();if(focusSession.active&&currentArtwork)void focusArtwork(currentArtwork);drawMinimap();});
}
async function initialize(): Promise<void> {
  try {
    const response=await fetch(assetUrl('data/exhibition.json'));if(!response.ok)throw new Error('No se pudo cargar la exposición.');
    exhibition=parseExhibition(await response.json());populateCatalog();
    $('.brand-name').textContent=exhibition.title;$('#exhibition-subtitle').textContent=exhibition.subtitle;
    $('#views-title').textContent='Miradas a la galería';
    $('#welcome-views').innerHTML=`Explorar las vistas ${svg('arrow')}`;
    if(exhibition.title!=='Baile de los Diablitos')$('#exhibition-title').textContent=exhibition.title;
    document.title=`${exhibition.title} · Galería virtual`;
    const cover=$<HTMLImageElement>('#cover');if(exhibition.renders[0]){cover.onload=()=>cover.hidden=false;cover.onerror=()=>cover.hidden=true;cover.src=assetUrl(exhibition.renders[0]);}
    $('#cover-caption').textContent=`${exhibition.artworks.length} fotografías · Dos salas`;
    if (!window.WebGL2RenderingContext||!document.createElement('canvas').getContext('webgl2')) {
      setLoad('Tu navegador no puede abrir el recorrido. Explora las obras o las seis vistas de la galería.');enterButton.hidden=true;return;
    }
    initRenderer();
    const spawn=exhibition.navigation.spawn;point={x:spawn.position[0],z:spawn.position[2]};yaw=spawn.yaw;
    if(!canStand(point,exhibition.navigation))throw new Error('El punto de entrada de la galería está ocupado.');
    setCamera();setLoad('Cargando las salas y las obras…',8);
    const loader=new GLTFLoader();
    const gltf=await loader.loadAsync(assetUrl(exhibition.model),event=>{if(event.total>0)setLoad(`Cargando la galería · ${Math.round(event.loaded/event.total*100)} %`,8+event.loaded/event.total*87);});
    model=gltf.scene;scene.add(model);model.updateMatrixWorld(true);
    model.traverse(object=>{
      if(object instanceof THREE.Mesh){modelHits.push(object);object.frustumCulled=true;
        const materials=Array.isArray(object.material)?object.material:[object.material];
        for(const material of materials)if(material instanceof THREE.MeshStandardMaterial)material.envMapIntensity=.55;
      }
    });
    finishExterior(model,renderer!,daylight);
    finishFloor(model,scene,renderer!);
    reflections=addPlanarReflections(model,scene,exhibition.navigation);
    // Fail early if a stale export dropped the interactive metadata entirely.
    const available=new Set<string>();modelHits.forEach(object=>{const id=artworkId(object);if(id)available.add(id);});
    if(available.size===0&&exhibition.artworks.length>0)toast('Las fichas están disponibles desde Obras. Esta versión de la sala no tiene selección directa.');
    renderer!.compile(scene,camera);renderer!.render(scene,camera);
    geometryLoaded=true;enterButton.disabled=false;welcome.dataset.ready='true';setLoad('La galería está lista. Puedes entrar cuando quieras.',100);
    requestAnimationFrame(loop);
  } catch(error) {
    const message=error instanceof Error?error.message:'No se pudo abrir la galería.';
    setLoad(`${message} Puedes volver a cargar o consultar las obras y las vistas disponibles.`);$('#retry-load').hidden=false;enterButton.disabled=true;
    console.error('Gallery load failed:',error);
  }
}
enterButton.addEventListener('click',()=>{
  if(!geometryLoaded)return;
  visiting=true;welcome.hidden=true;canvas.hidden=false;$('.topbar').hidden=false;$('#hud').hidden=false;canvas.focus();drawMinimap();
});

function artworkId(object: THREE.Object3D): string | undefined {
  let ancestor:THREE.Object3D|null=object;
  while(ancestor){if(typeof ancestor.userData.artworkId==='string')return ancestor.userData.artworkId;
    if(/^Painting_art-\d+/.test(ancestor.name))return ancestor.name.match(/art-\d+/)?.[0];ancestor=ancestor.parent;}
  return undefined;
}
function pickArtwork(x: number,y: number): Artwork|undefined {
  if(!geometryLoaded||!visiting||uiBlocked())return;
  const bounds=canvas.getBoundingClientRect();raycaster.setFromCamera(new THREE.Vector2((x-bounds.left)/bounds.width*2-1,-(y-bounds.top)/bounds.height*2+1),camera);
  const hits=raycaster.intersectObjects(modelHits,false);
  for(const hit of hits){
    // Ignore fully transparent helper meshes; real opaque architecture occludes works.
    const mesh=hit.object as THREE.Mesh;const material=Array.isArray(mesh.material)?mesh.material[hit.face?.materialIndex??0]:mesh.material;
    if(!hit.object.visible||material?.visible===false||material?.opacity===0)continue;
    const id=artworkId(hit.object);return id?exhibition.artworks.find(a=>a.id===id):undefined;
  }
}
canvas.addEventListener('pointerdown',event=>{if(event.button!==0||uiBlocked()||moving)return;canvas.focus();dragging={x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY,moved:0};canvas.setPointerCapture(event.pointerId);canvas.classList.add('grabbing');});
canvas.addEventListener('pointermove',event=>{
  if(dragging){const dx=event.clientX-dragging.x,dy=event.clientY-dragging.y;dragging.moved+=Math.abs(dx)+Math.abs(dy);yaw-=dx*.0045;pitch=THREE.MathUtils.clamp(pitch-dy*.0035,-1.1,1.1);dragging.x=event.clientX;dragging.y=event.clientY;setCamera();}
  else if(!moving){hoverArtwork=pickArtwork(event.clientX,event.clientY);const hint=$('#hover-hint');hint.hidden=!hoverArtwork;canvas.classList.toggle('art-hover',!!hoverArtwork);if(hoverArtwork){hint.replaceChildren(textNode('strong',hoverArtwork.title),textNode('span','Clic para conocer la obra'));}}
});
canvas.addEventListener('pointerup',event=>{if(dragging&&dragging.moved<6){const artwork=pickArtwork(event.clientX,event.clientY);if(artwork)showArtwork(artwork);}dragging=null;canvas.classList.remove('grabbing');if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);});
canvas.addEventListener('pointercancel',()=>{dragging=null;canvas.classList.remove('grabbing');});
canvas.addEventListener('pointerleave',()=>{if(!dragging){hoverArtwork=undefined;$('#hover-hint').hidden=true;canvas.classList.remove('art-hover');}});

let transition:{token:number;start:number;duration:number;from:CameraPose;to:CameraPose}|undefined;
let pendingRestorePose:CameraPose|undefined;
const currentPose=():CameraPose=>({point:{...point},yaw,pitch});
function applyPose(pose:CameraPose):void{point={...pose.point};yaw=pose.yaw;pitch=pose.pitch;setCamera();}
function updateFocusProjection():void{
  if(!camera)return;
  if(focusSession.active&&detailDialog.open&&detailDialog.dataset.mode==='visit'&&innerWidth>760){
    const panel=detailDialog.getBoundingClientRect();camera.setViewOffset(innerWidth,innerHeight,focusViewOffset(innerWidth,panel.left),0,innerWidth,innerHeight);
  }else camera.clearViewOffset();
}
function focusTarget(artwork:Artwork):Point|null{
  const panel=detailDialog.getBoundingClientRect();const availableWidth=innerWidth>760?panel.left-64:innerWidth-64;
  const distance=framingDistance(artwork.width+.16,artwork.height+.16,camera.fov,innerHeight,availableWidth,innerHeight-200);
  return selectArtworkView(artwork,exhibition.navigation,distance,candidate=>hasArtworkSight(artwork,candidate,modelHits,artworkId));
}
async function moveCameraTo(target:CameraPose,token:number,forceFade=false):Promise<void>{
  transition=undefined;keys.clear();dragging=null;moving=true;$('#hover-hint').hidden=true;canvas.classList.remove('art-hover');
  if(reducedMotion.matches){$('#fade').classList.remove('active');if(focusSession.isCurrent(token)){applyPose(target);updateFocusProjection();moving=false;}return;}
  if(!forceFade&&clearPath(point,target.point,exhibition.navigation)&&!$('#fade').classList.contains('active')){
    const delta=Math.atan2(Math.sin(target.yaw-yaw),Math.cos(target.yaw-yaw));
    transition={token,start:performance.now(),duration:900,from:currentPose(),to:{...target,yaw:yaw+delta}};
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
    moving=false;transition=undefined;$('#fade').classList.remove('active');detailDialog.dataset.mode='reading';updateFocusProjection();
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

const quality=$<HTMLSelectElement>('#quality');
function applyQuality(low:boolean):void{loweredQuality=low;renderer?.setPixelRatio(low?Math.min(devicePixelRatio,1):Math.min(devicePixelRatio,1.5));renderer?.setSize(innerWidth,innerHeight);reflections?.setReduced(low);}
quality.addEventListener('change',()=>{selectedMode=quality.value;applyQuality(selectedMode==='low');});
function drawMinimap():void{
  if(!exhibition)return;
  const map=$<HTMLCanvasElement>('#minimap');const ctx=map.getContext('2d')!;const width=map.clientWidth,height=map.clientHeight;
  // A hidden HUD has no layout box; don't derive a negative drawing scale.
  if($('#hud').hidden || width<=8 || height<=8)return;
  const dpr=Math.min(devicePixelRatio,2);map.width=width*dpr;map.height=height*dpr;ctx.scale(dpr,dpr);
  const areas=exhibition.navigation.walkable;const minX=Math.min(...areas.map(a=>a.x1)),maxX=Math.max(...areas.map(a=>a.x2)),minZ=Math.min(...areas.map(a=>a.z1)),maxZ=Math.max(...areas.map(a=>a.z2));
  const scale=Math.min((width-8)/(maxX-minX),(height-8)/(maxZ-minZ));const offsetX=(width-(maxX-minX)*scale)/2,offsetZ=(height-(maxZ-minZ)*scale)/2;
  const x=(value:number)=>offsetX+(value-minX)*scale,z=(value:number)=>offsetZ+(value-minZ)*scale;
  ctx.fillStyle='#e2eaed';ctx.strokeStyle='#bacbd1';ctx.lineWidth=1;
  for(const area of areas){ctx.fillRect(x(area.x1),z(area.z1),(area.x2-area.x1)*scale,(area.z2-area.z1)*scale);ctx.strokeRect(x(area.x1),z(area.z1),(area.x2-area.x1)*scale,(area.z2-area.z1)*scale);}
  ctx.fillStyle='#a8bcc4';
  for(const box of exhibition.navigation.boxes){ctx.save();ctx.translate(x((box.minX+box.maxX)/2),z((box.minZ+box.maxZ)/2));ctx.rotate(box.rotation??0);ctx.fillRect(-(box.maxX-box.minX)*scale/2,-(box.maxZ-box.minZ)*scale/2,(box.maxX-box.minX)*scale,(box.maxZ-box.minZ)*scale);ctx.restore();}
  for(const box of exhibition.navigation.orientedBoxes??[]){ctx.save();ctx.translate(x(box.x),z(box.z));ctx.rotate(box.rotation);ctx.fillRect(-box.width*scale/2,-box.depth*scale/2,box.width*scale,box.depth*scale);ctx.restore();}
  for(const column of exhibition.navigation.circles){ctx.beginPath();ctx.arc(x(column.x),z(column.z),column.r*scale,0,Math.PI*2);ctx.fill();}
  ctx.fillStyle='#285f72';for(const art of exhibition.artworks){ctx.beginPath();ctx.arc(x(art.position[0]),z(art.position[2]),1.1,0,Math.PI*2);ctx.fill();}
  ctx.save();ctx.translate(x(point.x),z(point.z));ctx.rotate(-yaw);ctx.fillStyle='#285f72';ctx.beginPath();ctx.moveTo(0,-6);ctx.lineTo(-3.5,4);ctx.lineTo(0,2);ctx.lineTo(3.5,4);ctx.closePath();ctx.fill();ctx.restore();
  $('#room-label').textContent=point.x<-6?'Sala A':point.x>6?'Sala B':'Pasillo';
}

let previousTime=0,accumulator=0,frameCount=0,measuredTime=0,lastMap=0;
function loop(time:number):void{
  requestAnimationFrame(loop);if(!renderer||!geometryLoaded)return;
  const actualDelta=previousTime?(time-previousTime)/1000:1/60;previousTime=time;
  if(document.hidden)return;
  if(visiting){
    if(transition){
      if(!focusSession.isCurrent(transition.token)){transition=undefined;}
      else{const t=Math.min(1,(time-transition.start)/transition.duration),e=t*t*(3-2*t);point={x:transition.from.point.x+(transition.to.point.x-transition.from.point.x)*e,z:transition.from.point.z+(transition.to.point.z-transition.from.point.z)*e};yaw=transition.from.yaw+(transition.to.yaw-transition.from.yaw)*e;pitch=transition.from.pitch+(transition.to.pitch-transition.from.pitch)*e;if(t===1){transition=undefined;moving=false;}}
    }
    accumulator+=Math.min(actualDelta,.15);const step=1/120;
    while(accumulator>=step){
      if(!uiBlocked()&&!moving){
        const forward=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0);
        const sideways=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0);
        const turn=(keys.has('KeyQ')?1:0)-(keys.has('KeyE')?1:0);yaw+=turn*1.7*step;
        const speed=keys.has('ShiftLeft')||keys.has('ShiftRight')?4.2:2.3;const length=Math.max(1,Math.hypot(forward,sideways));
        const dx=(-Math.sin(yaw)*forward+Math.cos(yaw)*sideways)/length*speed*step,dz=(-Math.cos(yaw)*forward-Math.sin(yaw)*sideways)/length*speed*step;
        if(dx||dz)point=moveSafely(point,dx,dz,exhibition.navigation);
      }
      accumulator-=step;
    }
    setCamera();renderer.render(scene,camera);
    if(time-lastMap>100){drawMinimap();lastMap=time;}
    // Use uncapped wall-clock frame times, never the simulation delta, for quality decisions.
    if(!uiBlocked()&&!moving){frameCount++;measuredTime+=actualDelta;if(measuredTime>4){const fps=frameCount/measuredTime;if(selectedMode==='auto'&&!loweredQuality&&fps<40){applyQuality(true);toast('La calidad se ha ajustado para que el recorrido sea más fluido.');}frameCount=0;measuredTime=0;}}
  }else accumulator=0;
}

void initialize();

