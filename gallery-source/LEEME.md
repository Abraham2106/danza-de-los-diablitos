# Baile de los Diablitos · Galería virtual

El proyecto contiene una galería editable en Blender y una aplicación de visita para PC. La edición del espacio y de la exposición se hace en Blender.

La exposición actual presenta doce fotografías aportadas por el usuario, con créditos de Alonso Solano / El Observador y marca visible ©PerroMudo. Sus descripciones se basan en la crónica suministrada. Los originales están en `artworks/boruca-originals`; la web conserva cada imagen completa, sin recortarla. La fecha 2024–2025 corresponde a la celebración narrada, no a una fecha individual verificada de cada foto.

## Abrir y visitar

- Modelo principal: `blender/gallery.blend`.
- Renders de alta resolución y sus maestros EXR: `renders/`.
- Aplicación web y código fuente: `web/`.
- Guía de edición: `GUIA-DE-EDICION.md`.
- Fuentes de las obras y verificación: `ATRIBUCIONES.md` y `data/provenance.json`.

Para iniciar la visita local, abre PowerShell en esta carpeta y ejecuta:

```powershell
.\Visitar-Galeria.ps1
```

Necesita Node.js 22 o posterior. Si faltan dependencias, el script las instala usando el archivo de versiones fijadas. Después abre la dirección que imprime la terminal. El servidor debe seguir ejecutándose mientras visitas la galería.

Los archivos HTML de una aplicación 3D necesitan un servidor HTTP: abrir `index.html` con doble clic no sustituye este procedimiento.

## Controles

- WASD o flechas: caminar.
- Arrastrar con el ratón: mirar alrededor.
- Q/E: girar.
- Shift: caminar más rápido.
- Clic sobre una obra: la cámara encuadra automáticamente el cuadro junto con su descripción, buscando una vista despejada de pilares.
- Volver al recorrido o cerrar la ficha: recuperar la posición y orientación anteriores.
- Ampliar: ver la imagen con más detalle sin abandonar el enfoque actual.
- Escape: cerrar la ficha o el diálogo actual.

La página también ofrece catálogo, ampliación de obras, minimapa y ayuda. La audioguía depende de las voces en español que tenga disponibles tu navegador.

## Actualizar desde Blender

Guarda `blender/gallery.blend` después de editarlo y ejecuta:

```powershell
.\Actualizar-Web.ps1
```

Este proceso exporta geometría, datos y texturas desde el archivo guardado, vuelve a calcular la apariencia estática y compila la web. La escena editable se conserva. Hornear iluminación puede tardar; una vista rápida sin horneado está disponible con `-SinHornear` y no representa el acabado final.

La iluminación horneada se limpia con Open Image Denoise para eliminar el grano. El modelo web conserva las sombras de contacto y usa mapas 4K limpios; los originales se guardan aparte. Las fuentes, imágenes y modelos se sirven localmente.

La escena incorpora paredes en gris cálido, plantas, roble, pedestales con dos estudios escultóricos originales y cordones de protección. Conserva una única columna central. El suelo combina luz horneada y reflejos suaves que se actualizan al mover la cámara. Los ventanales reflejan la sala y conservan transparencia. El jardín tiene sombras del arbolado y un cielo procedural.

Los reflejos web usan tres planos compartidos y capturas del entorno. Aproximan el acabado de Cycles; no reproducen todos sus rebotes, refracciones o reflejos entre superficies. La calidad Reducida disminuye la resolución y frecuencia de actualización para facilitar el recorrido.

La visita actual dibuja la geometría en el navegador. Usar renderizado completo en un servidor exigiría un motor en tiempo real y transmisión de vídeo interactiva, por ejemplo [Pixel Streaming de Unreal Engine](https://dev.epicgames.com/documentation/unreal-engine/overview-of-pixel-streaming-in-unreal-engine?lang=en-US). Los PNG y EXR de Cycles sirven como vistas fijas y maestros; no permiten calcular por sí solos nuevos puntos de vista mientras se camina. Esta entrega no incluye un servidor de streaming.

## Crear los seis renders

```powershell
.\blender\scripts\render_gallery.ps1
```

El script produce seis PNG a 3840 × 2160 y maestros EXR. Debes guardar el archivo Blender antes de ejecutarlo. Las cámaras se encuentran en la colección `Cameras`.

## Web lista para alojamiento

La carpeta `web/dist` contiene la compilación estática. Puede servirse por HTTPS sin base de datos ni servidor de aplicación. Conserva su estructura de recursos al copiarla. La entrega local no publica automáticamente en un servicio externo.

Para comprobar una compilación:

```powershell
Set-Location web
npm.cmd run build
npm.cmd run preview -- --host 127.0.0.1
```

## Recuperar versiones

Antes de modificar arquitectura, luz o exposición, guarda una copia versionada del `.blend`. Conserva también la compilación web publicada anterior. Una exportación nueva reemplaza los recursos web generados; no reemplaza el modelo principal.

`build_gallery.py` reconstruye la exposición inicial y puede reemplazar los objetos de las colecciones generadas. Es una herramienta de regeneración, no el procedimiento habitual para actualizar tus ediciones.
