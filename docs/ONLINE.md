# Versión en línea: anfitrión y resultados

La galería y el reto se ejecutan en la computadora de cada estudiante. Lo único que viaja al servidor es **quién puede iniciar la partida** y **los resultados**. Una sola sala, una partida a la vez, hasta 40 jugadores.

## Cómo se usa

1. **El anfitrión** abre la portada, toca **Host** (abajo a la derecha, con un candado) y escribe su código de 4 dígitos.
2. En el panel toca **Iniciar partida**. Hasta que lo haga, nadie puede entrar: los estudiantes ven «Esperando a que el anfitrión inicie la partida…» y entran solos en cuanto se abre.
3. Cada estudiante escribe su nombre y recorre el museo. Al responder, su puntaje se envía al servidor y aparece **en vivo** en el panel: puesto, puntos, preguntas respondidas, rapidez media y cuántas acertó en cada nivel (fácil, intermedio, difícil).
4. El anfitrión toca **Terminar partida**. Los estudiantes dejan de sumar puntos y los resultados quedan guardados.
5. **Descargar resultados** genera un CSV que abre bien en Excel.

Los botones de iniciar y terminar piden un segundo toque de confirmación para que no se pulsen sin querer. Iniciar una partida nueva reemplaza los resultados de la anterior; el panel avisa y conviene descargarlos antes.

## Reglas del servidor

| Regla | Detalle |
| --- | --- |
| Quién es el anfitrión | Solo quien conoce el código. Se comprueba **en el servidor**; la página nunca lo contiene. |
| Código | Un secreto de Cloudflare llamado `HOST_CODE` (4 a 8 dígitos). **No hay código por defecto**: sin el secreto, el modo anfitrión no funciona. |
| Intentos | Máximo 5 fallos por dirección IP cada 10 minutos y 30 en total. Después se bloquea hasta que pase la ventana. |
| Sesión del anfitrión | Dura 12 horas y vive solo en esa pestaña del navegador. |
| Entrar | Solo con una partida abierta. Nombres sin repetir (se ignoran mayúsculas y tildes), hasta 24 caracteres, sin etiquetas. Máximo 40 jugadores. |
| Puntajes | El estudiante envía **respuestas**, no puntos. El servidor recalcula cada puntaje con las mismas reglas del reto, así que no se pueden inventar. Cada pregunta cuenta una sola vez. |
| Reconexión | Si el estudiante recarga la página, vuelve a su mismo puesto con su nombre. |
| Conservación | Los resultados se borran solos **2 días** después de la última actividad. |

Un código de 4 dígitos tiene solo 10 000 combinaciones. El límite de intentos hace que adivinarlo tarde días, pero si algún día guardas datos más sensibles conviene usar 6 u 8 dígitos: basta cambiar el secreto.

Si el servidor no responde (por ejemplo, la versión estática de Vercel), el reto funciona como antes, solo en esa computadora, y el botón Host avisa que no hay conexión. Nunca da acceso de anfitrión sin servidor.

## Probarlo en tu computadora

```sh
npm install
npm run dev:api     # servidor local de Cloudflare, puerto 8787
npm run dev         # la página, en otra terminal; /api se redirige al puerto 8787
```

El código local vive en `.dev.vars` (ignorado por git; hay un ejemplo en `.dev.vars.example`). Crea ese archivo con una línea:

```
HOST_CODE=2106
```

## Publicarlo en Cloudflare

Todo se sirve desde un solo Worker: la galería (`dist/`) y la API (`/api/*`). Necesitas una cuenta de Cloudflare (el plan gratuito debería alcanzar para una clase; confírmalo en tu panel).

```sh
npx wrangler login            # abre el navegador: tú autorizas el acceso
npm run deploy                # compila y publica; la primera vez crea el Worker
npx wrangler secret put HOST_CODE   # escribe tu código cuando lo pida
```

El código se guarda cifrado en Cloudflare. **No lo pongas en el repositorio**, que es público. Para cambiarlo, vuelve a ejecutar el último comando.

La dirección queda como `https://danza-de-los-diablitos.<tu-subdominio>.workers.dev`. Comparte esa con los estudiantes.

## Cómo está hecho

- `worker/game.ts`: las reglas, sin depender de Cloudflare, con pruebas en `tests/game.test.ts`.
- `worker/index.ts`: el Worker (rutas `/api/*`) y un Durable Object `GameRoom` que guarda el estado. Hay un único objeto, `sala`, así que todas las lecturas y escrituras se ordenan solas y 40 personas no pueden pisarse.
- `src/api.ts`: el cliente. `src/host.ts`: el panel del anfitrión.
- `src/quiz.ts`: las preguntas y el puntaje, compartidos por la página y el servidor.
