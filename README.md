# Danza de los Diablitos · Galería virtual

Exposición fotográfica del Baile de los Diablitos (en boruca, *Cagrúv Rójc*) en el Territorio Indígena Boruca. Aplicación estática con Three.js, TypeScript y Vite; visita en primera persona, catálogo, enfoque de fotografías y fichas descriptivas. Las fotografías conservan sus marcas de agua y créditos.

## Ejecutar y verificar

Requiere Node.js 22 y npm. Desde la raíz del repositorio:

```sh
npm ci
npm test
npm run build
npm run dev
```

`npm run preview` sirve la compilación de `dist`. Para probar la parte en línea (anfitrión y resultados) se usa además `npm run dev:api`: ver [docs/ONLINE.md](docs/ONLINE.md). El proyecto debe abrirse mediante HTTP, no haciendo doble clic en `index.html`.

## Desplegar en Vercel

La configuración está en `vercel.json`, con soporte nativo de Vite. Después de subir los archivos del proyecto a GitHub, importar el repositorio **Abraham2106/danza-de-los-diablitos** desde Vercel y mantener estos valores:

| Ajuste | Valor |
| --- | --- |
| Root Directory | Raíz del repositorio (`.`) |
| Framework Preset | Vite |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Node.js | 22.x |
| Variables de entorno | Ninguna necesaria |

Vercel instala dependencias y genera `dist`; no hay que subir `node_modules` ni `dist` a GitHub. El modelo GLB y las imágenes de `public` sí deben incluirse en Git, porque forman parte de la visita. La galería no necesita funciones de servidor ni base de datos.

La preparación local no crea un proyecto en Vercel ni publica un dominio. El despliegue se realiza al importar y desplegar el repositorio en la cuenta elegida.

Documentación oficial: [Vite en Vercel](https://vercel.com/docs/frameworks/frontend/vite) y [configuración de vercel.json](https://vercel.com/docs/project-configuration/vercel-json).

## Contenido y edición

### Diseño de la interfaz

La aplicación es el espacio de una actividad de clase. La pantalla de entrada pide el nombre del estudiante y muestra el avance de carga de la sala. Dentro del museo, la barra superior muestra el nombre y cuántas de las fotografías ya abrió; el minimapa marca las vistas en relleno. Ese progreso vive solo en `sessionStorage` y no se envía a ningún servidor. La portada usa «La flauta y el jaguar», de Alonso Solano / El Observador.

**El reto** (`src/quiz.ts`) es la parte de juego de la actividad y se desbloquea mientras se recorre el museo. Las 12 fotografías se reparten en tres secciones de cuatro: *Los rostros* (1–4, nivel fácil), *El recorrido* (5–8, intermedio) y *El toro y el fuego* (9–12, difícil). Al abrir la cuarta fotografía de una sección se desbloquean sus dos preguntas: aparece un aviso y, al cerrar la ficha, se abren solas. También se pueden contestar después desde el botón **El reto**, que muestra cuántas preguntas hay listas.

Cada pregunta se muestra sola durante 5 segundos (se puede saltar con «Ya la leí» o con Enter); después aparecen las cuatro respuestas y corren 20 segundos. Un acierto vale entre el 50 % y el 100 % de los puntos de su sección según la rapidez (el porcentaje se muestra al contestar), y un error no suma. Las secciones multiplican los puntos por 1, 1,5 y 2, así que las últimas preguntas son más difíciles y valen más. Entre una pregunta y la siguiente no hay espera. Las fases usan temporizadores reales y siguen corriendo aunque el estudiante cambie de pestaña.

El progreso (fotos vistas y respuestas con puntos, rapidez y nivel) vive solo en `sessionStorage` y no se envía a ningún servidor; «Empezar de nuevo» lo borra. `summarize()` ya entrega lo que pedirá el ranking en línea: puntos, preguntas respondidas, aciertos, rapidez media y respuestas por nivel. Para cambiar las preguntas se edita `QUESTIONS`, y `tests/quiz.test.ts` valida que las secciones y las preguntas estén bien formadas.

Las salas se presentan como capítulos: Sala I · Los diablitos (fotografías 1–7), el pasillo · La música (8) y Sala II · El toro y el fuego (9–12). La «Guía de la fiesta» reúne el rito en cuatro momentos y un glosario, con textos tomados de la crónica.

La interfaz es una plataforma clara, amable y redondeada: fondo de algodón cálido, botones en forma de píldora y tarjetas suaves. La paleta toma como referencia los tintes documentados por [Artesanos Naturales Boruca](https://www.borucacostarica.org/) y [María del Rocío Juárez Nogueira](https://revistacienciassociales.ucr.ac.cr/html/12-JUAREZ171/12-JUAREZ171.html): añil, morado de caracol y rojo achiote, junto con el dorado del sol y el verde de la selva. La faja tejida en telar de cintura es el motivo que une la interfaz y las cartelas 3D.

Tipografías (SIL OFL 1.1, servidas desde los paquetes `@fontsource-variable`): [Unbounded](https://github.com/googlefonts/unbounded), geométrica y pesada, para títulos y números; [Josefin Sans](https://github.com/googlefonts/josefinsans), inspirada en las sans geométricas de los años veinte, para la interfaz y los textos breves, y [Newsreader](https://github.com/productiontype/Newsreader) solo para los textos largos de la crónica. Es una geometría en espíritu Bauhaus, pero los motivos salen de la fiesta: en la entrada, el flautista aparece coronado por plumas geométricas con los colores de los penachos, sobre una banda en zigzag del tejido Boruca.

La visita utiliza calidad alta por defecto y renderizado a demanda para evitar trabajo en reposo. El [informe de rendimiento](docs/RENDIMIENTO.md) documenta las mediciones, las comprobaciones y la corrección de las esquinas negras durante el movimiento.

Las cartelas físicas tienen texto más grande, crédito completo y selección directa. La [actualización de cartelas y entradas](docs/CARTELAS-Y-UNIONES.md) muestra las capturas y explica cómo se elimina la superposición del muro del pasillo.

Los pedestales exponen una [máscara de búho en relieve](docs/MASCARA-BUHO.md), creada en Blender a partir de la referencia elegida por el usuario. El asset GLB incluye textura y soporte, y la fuente editable está incluida en el repositorio.

La visita permite explorar libremente o seguir un [recorrido guiado con narración](docs/RECORRIDO-Y-NARRACION.md). Solo El diablito mayor tiene el MP3 proporcionado; se escucha por decisión del visitante, se puede caminar con la ficha abierta y no se utiliza síntesis de voz.

- `src/`: aplicación y navegación.
- `public/models/`: geometría exportada de Blender y materiales.
- `public/data/exhibition.json`: títulos, descripciones, créditos y posiciones de enfoque.
- `public/artworks/`: fotografías utilizadas por el catálogo y las fichas.
- `public/renders/`: vistas de presentación exportadas.
- `tests/`: verificaciones de navegación, cámara, datos y reflejos.
- `docs/`: guía del visor y atribuciones.
- `gallery-source/`: fuente editable de Blender, sus scripts y documentación. `gallery-source/blender/gallery.blend` se versiona con Git LFS.

El archivo Blender de aproximadamente 138 MB se incluye en GitHub mediante Git LFS; los EXR, atlas de horneado y originales se conservan localmente y están excluidos de Git. La aplicación completa para desplegar está en la raíz y sus recursos públicos. `gallery-source/` se excluye del despliegue; Vercel no ejecuta Blender ni necesita el modelo editable para compilar el visor.

Para descargar y editar el modelo, instalar [Git LFS](https://git-lfs.com/), clonar el repositorio y obtener el archivo completo:

```sh
git lfs install
git clone https://github.com/Abraham2106/danza-de-los-diablitos.git
cd danza-de-los-diablitos
git lfs pull
```

Abrir `gallery-source/blender/gallery.blend` en Blender. Las fotografías y texturas están empaquetadas dentro del archivo.

Para modificar una fotografía en la visita, hay que actualizar su imagen, ficha y textura del GLB; cambiar solamente la imagen del catálogo no cambia la fotografía que está enmarcada en la sala. El exportador dentro de `gallery-source` conserva su estructura original: genera allí `web/public`. Después de exportar, copiar los recursos generados a `public` de la raíz, verificar la visita y volver a compilar.
