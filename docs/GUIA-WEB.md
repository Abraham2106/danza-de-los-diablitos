# Baile de los Diablitos · Visita web

Visor estático de la galería creada en Blender. Three.js 0.170.0, TypeScript 5.9.3 y Vite 6.4.1, con dependencias fijadas y archivo de bloqueo. No necesita backend ni cuentas. El contenido proviene del archivo Blender y su exportación.

## Ejecutar

Requiere Node.js 22. En esta carpeta:

```sh
npm ci
npm run dev
```

Abrir la dirección que imprime Vite. El navegador debe usar HTTP; abrir `index.html` con doble clic no carga los recursos correctamente.

```sh
npm test
npm run build
npm run preview
```

La compilación publicable queda en `dist`. Alojamiento estático HTTPS, incluida una subcarpeta gracias a `base: './'`. Copiar el contenido completo de `dist` conservando `models`, `data`, `artworks` y `renders`. No publicar `node_modules`.

## Recursos y actualización

El exportador de Blender genera `public/models/gallery.glb` y `public/data/exhibition.json`. Las imágenes de obras están en `public/artworks` y las seis vistas en `public/renders`. Después de reexportar y revisar la visita local, ejecutar nuevamente `npm run build`.

El manifiesto usa `schemaVersion: 1`, título, subtítulo, recursos locales, obras con fichas y puntos de observación, más navegación. `boxes` define rectángulos de colisión, `circles` columnas y `walkable` la unión de superficies visitables. `orientedBoxes` admite `{x,z,width,depth,rotation}` para paneles o bancos girados. Su rotación es el ángulo matemático en el plano XZ; se aplica la transformación inversa `localX=cos(a)*dx+sin(a)*dz`, `localZ=-sin(a)*dx+cos(a)*dz`. Todas las medidas están en metros y el eje vertical de la web es Y.

Cada raíz de obra del GLB tiene `extras.artworkId` (expuesto por Three.js como `userData.artworkId`). La selección comprueba primero la geometría visible para respetar paredes y paneles. El nombre `Painting_art-001` es un apoyo compatible si la propiedad no existe. La web utiliza exclusivamente la geometría del GLB, sin reconstruir el edificio por código.

Las imágenes se sirven localmente. Si una imagen falla, aparece un marcador neutro con reintento; no se sustituye por otras fotografías. Las atribuciones se conservan en las fichas. La cubierta proviene del primer render final, sin imágenes ajenas a la galería.

## Visita

- WASD / flechas: caminar. Q / E: girar. Shift: caminar más rápido.
- Arrastrar el ratón: mirar. Clic en cuadro o foto del catálogo: encuadrar automáticamente la obra y abrir su descripción. El cuadro se centra en el espacio libre a la izquierda de la ficha.
- Cerrar la ficha / Volver al recorrido: recuperar la posición y orientación previas a la primera obra seleccionada, aunque se hayan cambiado obras. Ampliar abre la imagen sin cancelar ese estado.
- El foco ajusta la distancia según dimensiones, campo de visión y espacio disponible. Se mueve cuando todo el camino está libre; usa fundido y cambio de posición cuando hay obstáculos. Ambos destinos se validan. En la portada se muestra la obra y su descripción sin entrar al recorrido.
- La pose de observación también debe tener visibilidad real: nueve rayos comprueban centro, bordes y esquinas contra la geometría del GLB. Se buscan desplazamientos laterales y distancias próximas para evitar pilares sin esconderlos. Si ninguna posición ofrece la obra completa, se presenta la imagen y descripción en una ficha grande.
- Escape: cerrar ficha o diálogo. Al abrir las fichas se suspende el movimiento.
- Obras: catálogo accesible con teclado. Ampliar: imagen mayor. Lectura: voz española del navegador si está disponible; la descripción textual siempre queda visible.
- Calidad: alta por defecto. La visita nunca baja automáticamente la resolución ni los reflejos. La opción reducida solo se aplica al elegirla manualmente.

El visor dibuja a demanda: sigue animando al caminar, girar o enfocar una fotografía y deja de enviar dibujos a la GPU cuando la vista está quieta. Antes de descansar, completa las capturas de reflejos de la última posición. Conserva el antialiasing, el límite de densidad de píxeles de 1,5, las texturas, materiales, sombras y tamaños de captura de calidad alta. Los eventos del ratón se agrupan por fotograma; la selección conserva las pruebas exactas de triángulos y las oclusiones, descartando previamente las cajas que el rayo no atraviesa. Los objetos estáticos conservan sus matrices calculadas. Las capturas de reflejos solo se omiten cuando todas sus superficies están fuera de la vista.

Los diálogos usan el elemento nativo `dialog`, foco restaurado, controles etiquetados y cierre por Escape. El catálogo y las vistas funcionan sin WebGL 2. La preferencia de movimiento reducido evita transiciones de desplazamiento. El recorrido está dirigido a computadora; en pantallas pequeñas se puede consultar el catálogo.

## Verificación

`npm test` comprueba radio del visitante, unión de salas, colisiones, paneles girados, deslizamiento, trayectos completos y puntos de observación; además valida esquema, rutas locales, dimensiones y obras duplicadas. Las pruebas de cámara verifican encuadre horizontal/vertical, proyección desplazada real de Three.js, conservación de la vista original y cancelación de transiciones antiguas. `npm run build` verifica TypeScript y genera la compilación.

Antes de publicar, comprobar el GLB exportado: entrada válida, recorrido por ambas salas, fotografías seleccionables, fichas de las 12 fotos, seis renders, navegación con teclado, ampliación y audio, bloqueo de descargas para confirmar marcadores, y calidad en el equipo de referencia. Las pruebas automatizadas no establecen por sí solas calidad visual, compatibilidad de voces o rendimiento en todos los equipos.

## Apariencia y iluminación

La aplicación incorpora materiales de la exportación, entorno de reflejos y luz ambiental/direccional ligera. La arquitectura con iluminación horneada debe exportarse con materiales sin iluminación adicional (`KHR_materials_unlit`). Los materiales de metal, vidrio y marcos mantienen PBR. Cambiar paneles o luces requiere regenerar los mapas horneados en Blender.

La interfaz sirve Instrument Serif y DM Sans desde archivos locales con licencia OFL, con Georgia y system-ui como alternativas.
