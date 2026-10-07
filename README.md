# Danza de los Diablitos · Galería virtual

Exposición fotográfica del Baile de los Diablitos en el Territorio Indígena Boruca. Aplicación estática con Three.js, TypeScript y Vite; visita en primera persona, catálogo, enfoque de fotografías y fichas descriptivas. Las fotografías conservan sus marcas de agua y créditos.

## Ejecutar y verificar

Requiere Node.js 22 y npm. Desde la raíz del repositorio:

```sh
npm ci
npm test
npm run build
npm run dev
```

`npm run preview` sirve la compilación de `dist`. El proyecto debe abrirse mediante HTTP, no haciendo doble clic en `index.html`.

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

La visita utiliza calidad alta por defecto y renderizado a demanda para evitar trabajo en reposo. El [informe de rendimiento](docs/RENDIMIENTO.md) documenta las mediciones, las comprobaciones y la corrección de las esquinas negras durante el movimiento.

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
