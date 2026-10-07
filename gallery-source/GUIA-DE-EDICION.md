# Edición en Blender

## Modelo y organización

Abre `blender/gallery.blend`. El modelo usa metros. `Gallery` contiene arquitectura, mobiliario y obras. `Navigation` contiene el punto inicial y los puntos auxiliares de observación. `Lighting` contiene la iluminación y `Cameras` las seis vistas de render.

La exposición actual contiene doce fotografías del Baile de los Diablitos. Cada marco respeta la proporción de su imagen. Los originales y sus marcas de autor se conservan en `artworks/boruca-originals`. El script `import_boruca.py` reinstala la selección descrita en `data/boruca-import.json`; utilízalo para recuperar la exposición generada, no para actualizar una sola foto editada manualmente.

La escena inicial de Blender se conserva en una colección oculta. Los objetos de navegación no se renderizan.

## Cambiar la distribución

Selecciona un objeto raíz `Panel_A_N`, `Panel_A_S` o `Panel_B` para mover o girar el panel completo. Sus obras seguirán la transformación del panel. Mueve el objeto raíz del banco para conservar juntas sus piezas.

Mantén las obras a una altura cómoda y deja espacio para caminar y observarlas. Los puntos `Observation_art-...` siguen a las obras y deben quedar delante de ellas, en un lugar transitable.

Los obstáculos se obtienen de la geometría exportada. Si añades objetos arquitectónicos, conserva las funciones/nombres reconocidos por el exportador y revisa su informe. El exportador no convierte automáticamente cualquier objeto decorativo en obstáculo.

## Editar una obra

Cada cuadro tiene un objeto raíz `Artwork_art-...`, una superficie `Painting_art-...`, marco, paspartú y cartela.

En las propiedades personalizadas del objeto raíz se encuentran el identificador y los datos de la ficha: título, autor, año, descripción y procedencia. Mantén el identificador único. El nombre visible del objeto puede cambiar; el identificador es la relación estable con la ficha.

Para cambiar la imagen, selecciona la superficie `Painting_art-...` y sustituye la imagen del nodo de textura de color en su material. El exportador obtiene la imagen que utiliza realmente el material. Conserva una copia del original antes de reemplazarlo.

El plano y el marco deben respetar la proporción de la imagen. Si cambias por una obra de proporción diferente, ajusta la geometría en Blender; la exportación no remodela automáticamente un marco personalizado.

Actualiza también el texto físico de `LabelText_art-...`: es un objeto de texto editable separado de la ficha web.

## Materiales y luces

Los materiales `MAT_...` organizan las superficies principales. Puedes editar su color, rugosidad y acabado en Blender. Cycles produce los renders finales; la exportación prepara una apariencia optimizada para el navegador.

Las superficies estáticas mates marcadas con `webBake` se hornean para conservar luz y sombras. Vidrio, metal y otros acabados con reflejos conservan materiales de tiempo real. Los nodos complejos de Blender no son una interfaz general de materiales web: revisa visualmente el resultado después de modificar el acabado.

La exportación aplica Open Image Denoise a los mapas de iluminación antes de empaquetarlos. Conserva los PNG originales y los mapas limpios en `blender/baked-textures`; la web usa las versiones limpias. No sustituye el detalle de las imágenes de los cuadros. Los archivos de caché comprueban el hash del proyecto y del mapa de origen para evitar reutilizar sombras antiguas.

Después de mover paredes o paneles, cambiar luces o modificar materiales, vuelve a exportar con horneado. Una textura de iluminación antigua conserva sombras de la distribución anterior.

Las dos líneas interiores de luminarias recorren ambas salas y el pasillo sobre ejes comunes a 2 metros del centro. Las líneas exteriores de cada sala siguen los ejes a 6 metros. Si modificas un tramo, conserva su eje y altura para evitar saltos entre espacios.

## Mobiliario y personalidad

La colección `GalleryFurnishings`, dentro de `Gallery`, contiene macetas, hojas, dos estudios escultóricos originales, pedestales, postes con cordones y listones de roble. Puedes moverlos y cambiar sus materiales como cualquier objeto de Blender. Las paredes usan gris cálido y los paneles un tono claro de piedra.

Los objetos marcados con `decorCollider` impiden atravesar las macetas y los pedestales en la visita. `decorMargin` amplía el perímetro protegido del pedestal para incluir los cordones. Después de cambiar estas piezas, exporta nuevamente para actualizar colisiones y sombras.

`personalize_gallery.py` reconstruye este mobiliario y restablece sus colores; ejecútalo solamente si quieres recuperar la distribución generada. La edición habitual se hace directamente en el `.blend`.

El navegador añade un cielo de día, variaciones amplias de césped, ventanas en los edificios lejanos y sombras estáticas del arbolado. Estos recursos procedurales se generan localmente en `web/src/exterior.ts`. La geometría del jardín procede de Blender.

La arquitectura conserva una única columna en el centro del pasillo. La entrada está desplazada para dejarla libre. El suelo web combina iluminación horneada, capturas del entorno al cargar y reflejos planos actualizados al mover la cámara. Los ventanales también reflejan la geometría interior. Los ajustes están en `web/src/floor.ts` y `web/src/reflections.ts`.

Los tres planos de reflexión comparten superficies coplanares para evitar una captura por cada baldosa o ventana. El acabado del piso se suaviza con filtrado de la imagen reflejada y su intensidad aumenta en ángulos rasantes. La calidad Reducida usa capturas menores y actualiza con menos frecuencia. Si mueves ventanas fuera de sus planos originales o añades salas, adapta este agrupamiento; no es un sistema general de reflejos arbitrarios.

## Árboles y jardín

Los árboles exteriores utilizan tres modelos de Quaternius con licencia CC0. Sus originales y texturas están en `assets/trees`. Los ejemplares comparten mallas y materiales; editar una malla compartida cambia todos los ejemplares de esa variante. Para modificar uno por separado, convierte su malla en una copia independiente en Blender.

La exportación reduce las texturas de los árboles para la visita web. El archivo Blender conserva las texturas de origen. Consulta `assets/trees/provenance.json` para identificar las fuentes y sus hashes.

Los materiales botánicos de Cycles se convierten únicamente en la copia de exportación a materiales PBR con corte de transparencia para las hojas. Los materiales originales de Blender se conservan.

## Enfoque de las obras en la visita

Al seleccionar una obra, la cámara busca una posición transitable desde la que se vean su centro y bordes, evitando que columnas u otros objetos la tapen. La descripción aparece al lado. Cerrar la ficha o usar «Volver al recorrido» restaura la posición y orientación previas; ampliar la imagen conserva ese enfoque.

Al distribuir obras nuevas, deja suficiente espacio delante y a los lados. Si ninguna posición de observación permite ver la obra completa, la web presenta su imagen en una ficha de detalle e indica que no encontró una vista despejada.

## Cámaras y renders

Las seis cámaras tienen nombres numerados. Puedes cambiar posición, focal y composición. Guarda el `.blend` y ejecuta el script de render. Los PNG utilizan la transformación de visualización de la escena; los EXR conservan información para trabajo posterior.

## Validación antes de compartir

1. Guarda una copia del proyecto.
2. Comprueba que las imágenes están disponibles o empaquetadas.
3. Revisa los identificadores y las fichas.
4. Comprueba el punto inicial y los puntos de observación.
5. Exporta y consulta el informe.
6. Abre la visita y recorre las dos salas y el pasillo.
7. Comprueba cada obra y cualquier zona que hayas movido.
8. Compila y sustituye la versión alojada cuando la revisión esté terminada.
