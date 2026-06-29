# Ruleta (Europea) — Live

Juego de ruleta europea single-zero (37 números) en un único componente React + TypeScript + Tailwind. Sin backend, sin assets externos: audio sintetizado con Web Audio API, voz con Web Speech API.

## Requisitos

- Node 18+
- npm

## Comandos

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # tsc -b && vite build
npm run lint      # oxlint
```

> Audio y voz requieren un navegador real (no Node) y la primera interacción del usuario (política de autoplay).

## Configuración del juego

Toda la configuración vive en el bloque `CONFIG` al tope de `src/App.tsx`:

- `SALDO_INICIAL`, `APUESTA_MINIMA`, `FICHAS`, `RECARGA`
- Tiempos de cada fase (`TIEMPO_APUESTAS`, `TIEMPO_NO_VA_MAS`, `TIEMPO_GIRO`, `TIEMPO_PAGO`)
- `USAR_CRYPTO` (`false` usa `Math.random`, `true` usa `crypto.getRandomValues` sin sesgo de módulo)
- `VOZ_ACTIVA`, `AUDIO_ACTIVO`

## Estructura

- `src/App.tsx`: componente único (~1160 líneas) con la máquina de estados, el reducer, la ruleta SVG, la mesa, los controles y el modal de pago.
- `src/index.css`: directivas de Tailwind + keyframe `.win-modal`.
- `index.html`: entrypoint de Vite.
- `tailwind.config.js`, `postcss.config.js`: configuración de Tailwind v3.

## Controles

- Selector de ficha: 250 / 500 / 1k / 5k ARS$.
- **Limpiar**: devuelve las fichas al saldo (solo en `BETTING`).
- **↻ Repetir**: vuelve a colocar la última apuesta confirmada (salta apuestas si falta saldo, nunca negativo).
- **×2 Doblar**: duplica todas las apuestas vigentes si hay saldo suficiente.
- **▶ Girar ya**: pasa a `NO_MORE_BETS`.
- **⏸ Pausar / ▶ Reanudar**: detiene/continúa los timers fuera de `SPINNING`.
- Botón **+ Recargar** en el header suma `CONFIG.RECARGA` al saldo.

## Máquina de estados

`BETTING → NO_MORE_BETS → SPINNING → PAYOUT → BETTING` (loop).

Todas las mutaciones pasan por `useReducer`. Los temporizadores se almacenan en un `useRef<number[]>` compartido y se limpian al cambiar de fase. La animación de la rueda usa doble `requestAnimationFrame` para forzar el reflow entre giros consecutivos.
