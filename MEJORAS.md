# Mejoras pendientes

Lista incremental del proyecto Ruleta Live. Hecho / pendiente con notas de implementación.

## Estado

| # | Mejora | Estado | Archivos clave | Notas |
|---|--------|--------|----------------|-------|
| 1 | Repetir apuesta / Doblar (`REBET`, `DOUBLE`) | ✅ Hecho | `src/App.tsx` | `lastBets` se guarda al entrar a `NO_MORE_BETS`. Rebet omite apuestas sin saldo. Doblar es atómico (no aplica si no alcanza). |
| 2 | Panel de estadísticas de sesión | 🕐 Pendiente | `src/App.tsx` | Derivar de `history`. Conteos y % de rojo/negro, par/impar, docenas, ceros. Usar barras horizontales proporcionales. |
| 3 | Números calientes y fríos (hot/cold) | 🕐 Pendiente | `src/App.tsx` | Necesita agregar un contador acumulado de toda la sesión (`Record<number, count>`) además del `history` visual de 10. |
| 4 | Racetrack / apuestas anunciadas (Voisins, Tiers, Orphelins, Zero) | 🕐 Pendiente | `src/App.tsx` | Definir arrays exactos, dividir monto sectorial M/K, resolver como pleno 35:1 y colocar UI con 4 zonas clickeables. |
| 5 | Persistencia de saldo | 🕐 Pendiente | `src/App.tsx` | Guardar/leer `localStorage.getItem("ruleta_saldo")`; try/catch. El botón "+ Recargar" debe resetear saldo y persistir. |

## Orden sugerido de retomada

1. Mejora 2 (panel de estadísticas) — lectura pura del estado.
2. Mejora 3 (hot/cold) — requiere agregar el contador de sesión antes de calcular.
3. Mejora 5 (persistencia) — separada de la lógica UI.
4. Mejora 4 (racetrack) — la más compleja, dejar para el final.

## Convenciones para las próximas mejoras

- Toda mutación de estado pasa por `useReducer`.
- Validar saldo en cada acción; nunca dejar saldo negativo.
- Fase `BETTING` es la única fase donde se permiten apuestas.
- Castigo estricto de TypeScript, sin `any`.
- Verificar siempre `npm run build` antes de declarar listo.
