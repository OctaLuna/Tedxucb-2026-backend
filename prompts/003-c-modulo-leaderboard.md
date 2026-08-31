# 003-c — Módulo `leaderboard`

## Contexto

Tercer y último módulo de negocio de `003-motor-de-puntos` (de los 3 que
permite el Artículo VII para esta feature). Requiere `003-b-modulo-points.md`
ejecutado — lee la caché `total_points` que ese módulo mantiene, nunca
recalcula sumando el ledger en cada consulta (eso sería lento con cientos de
alumnos, por eso existe la caché). También requiere que T001 (RF-342,
visibilidad del ranking para alumnos) se haya resuelto en `003-a` — si no se
resolvió, detente y resuélvela antes de seguir: define directamente el
alcance de este módulo (¿el endpoint de ranking es solo para admin/staff, o
también accesible por el propio alumno?).

## Skill a cargar

`.claude/skills/motor-de-puntos/SKILL.md`, `.claude/skills/modulo-backend/SKILL.md`,
`.claude/skills/contratos-api/SKILL.md`, `.claude/skills/pruebas/SKILL.md`.

## Paso 1 — Prueba de contrato primero (Grupo 1, parte de `leaderboard`)

T018: ranking ordenado correctamente, desempate determinista y reproducible
(la consulta de referencia de `data-model.md` usa
`RANK() OVER (ORDER BY total_points DESC, MAX(created_at) ASC)` — desempata
por quien llegó primero a ese puntaje), exclusión de alumnos deshabilitados.
Confirma que falla antes de implementar.

## Paso 2 — Implementación (Grupo 6, parte de `leaderboard`)

T073 (consulta de ranking con desempate determinista y filtros por
carrera/facultad — según lo que haya resuelto T001, expón el endpoint según
el alcance de visibilidad decidido), T074 (endpoint de progreso individual
del alumno — `totalPoints`, `rank`, `totalStudents`; revisa si
`contracts/points-and-claims.md` sigue teniendo abierto el marcador sobre
`pointsToCutoff` y resuélvelo si aplica), T075 (exportación del ranking en
formato tabular abierto, rol admin).

## Paso 3 — Métricas (parte del Grupo 8)

T093: métricas de check-in — latencia p95 y proporción de registros
manuales frente a escaneados (CE-301 y CE-304 de
`specs/003-motor-de-puntos/spec.md`). No es estrictamente "ranking", pero es
el último dato agregado que le falta a la feature y cierra bien junto a este
módulo.

## Pruebas y cierre

Cierre estándar de `prompts/README.md`:

1. Jest: contrato (T018) y una prueba de integración que siembre alumnos con
   puntajes empatados y verifique el desempate determinista (dos ejecuciones
   seguidas deben dar exactamente el mismo orden).
2. Playwright: `tests/e2e/leaderboard.e2e.spec.ts` — consulta el ranking tras
   sembrar datos vía la API (o fixtures), verifica orden y que un alumno
   deshabilitado no aparece.
3. Actualiza `docs/progress.md`: fila `003-c` → ✅ hecho.
4. Commit(s), ejemplo:
   ```
   test(leaderboard): T018 prueba de contrato de ranking y desempate
   feat(leaderboard): T073-T075 ranking, progreso individual y exportación
   feat(activities): T093 métricas de latencia y proporción de check-in manual
   ```
