# Prompts de implementación — TEDxUCB backend

Cada archivo de esta carpeta es un prompt autocontenido pensado para dárselo,
tal cual, a un agente de código (Claude Code u otro) en una sesión dedicada.
Juntos cubren el camino completo desde este repositorio (solo specs y
skills) hasta el backend funcionando. Ejecutarlos fuera de orden, o saltarse
uno, produce trabajo que hay que rehacer: varios dependen de que el anterior
haya dejado migraciones, módulos o decisiones de plan ya resueltas.

## Por qué no todos son "implementa el módulo X"

Solo `003-motor-de-puntos` tiene su ciclo SDD completo (`plan.md` +
`data-model.md` + `contracts/` + `tasks.md`). `001`, `002` y `004` todavía
tienen marcadores `[NECESITA CLARIFICACIÓN]` abiertos en su `spec.md` y no
tienen plan ni tareas. Escribir hoy un prompt de implementación para ellas
sería inventar tareas que la spec no ha decidido — exactamente lo que
`CLAUDE.md` prohíbe ("no adivines"). Por eso esas tres features arrancan con
un prompt **`-a`** (Clarify → Plan → Tasks) que resuelve eso primero, y solo
después tienen un prompt **`-b`** de implementación con tareas reales.

## Orden de ejecución

```
00-bootstrap-infraestructura
        │
        ▼
001-a-clarify-plan-tasks ──▶ 001-b-implementacion-identidad
        │                              │
        │            (001 es la base de todo lo demás)
        │                              │
        ├──────────────┬───────────────┴───────────────┐
        ▼               ▼                               ▼
002-a-clarify-plan-tasks   003-a-modulo-activities   (004 espera a 003)
        │                   ▼
        ▼               003-b-modulo-points
002-b-implementacion-      ▼
sitio-publico           003-c-modulo-leaderboard
                            ▼
                        003-d-integracion-y-pulido
                            ▼
                        004-a-clarify-plan-tasks
                            ▼
                        004-b-implementacion-seleccion-cupos
```

`002` no depende del motor de puntos y puede ejecutarse en paralelo a `003`
(coincide con la recomendación de `specs/README.md`); `004` sí depende de que
`003` esté terminado. Dentro de `003`, el orden `activities → points →
leaderboard → integración` no es arbitrario: `points` reutiliza el guard y
las entidades de `activities`, `leaderboard` lee la caché de `points`, y la
integración cruzada (concurrencia, idempotencia) necesita los tres módulos ya
implementados.

## Qué skill cargar

| Prompt | Skills |
|---|---|
| `00-bootstrap-infraestructura` | `modulo-backend` |
| `*-a-clarify-plan-tasks` | `spec-workflow` |
| `*-b-implementacion-*`, `003-a/b/c` | `modulo-backend` + `contratos-api` + `pruebas`, y `motor-de-puntos` si toca puntos/check-in, y `seguridad-y-roles` si toca auth/permisos/datos personales |
| `003-d-integracion-y-pulido` | `pruebas` + `motor-de-puntos` |

Todas las skills están en `.claude/skills/`. Ante la duda de si aplica
`motor-de-puntos`, cárgala igual — así lo pide la propia skill.

## Cierre estándar

Todo prompt de esta carpeta termina exactamente así, en este orden. Los
prompts individuales no repiten estos pasos: solo dicen "cierre estándar" y
remiten aquí.

1. **Pruebas Jest del módulo** — contrato, integración y unitarias, contra
   PostgreSQL real en contenedor (Artículo IX). Nunca contra mocks de base de
   datos. Deben pasar todas.
2. **Pruebas E2E de Playwright del módulo** — con el servidor real levantado,
   correr `npx playwright test tests/e2e/<modulo>.e2e.spec.ts` (o
   `npm run test:e2e` si el prompt cierra varios módulos a la vez). Si algo
   falla, se corrige — el módulo no se da por cerrado con pruebas en rojo,
   ni Jest ni Playwright.
3. **Actualizar `docs/progress.md`** — marcar la fila del módulo en la tabla
   "Módulos" como ✅ hecho, con el hash del commit y el resultado de las
   pruebas; añadir una entrada nueva al principio de la "Bitácora". Si el
   prompt era `-a` (clarify+plan+tasks), además actualizar la tabla "Estado
   por feature" (columnas Plan/Tasks) y, si se resolvió algún marcador, seguir
   el procedimiento de la skill `spec-workflow` (actualizar `spec.md`,
   `specs/README.md`, y crear ADR en `docs/decisiones/` si la decisión es
   estructural).
4. **Commit** — uno por prompt cerrado, siguiendo la convención de abajo, con
   el árbol en verde (pruebas pasando). Si el prompt es grande y conviene
   partirlo en varios commits, cada uno debe dejar el árbol en un estado
   consistente — nunca un commit a medias con pruebas rotas.

Si en cualquier punto de un prompt aparece una decisión que la spec o el plan
no tomaron, la regla del proyecto aplica igual aquí: se detiene y se pregunta
o se marca `[NECESITA CLARIFICACIÓN]` — no se improvisa (`CLAUDE.md`, regla
2).

## Convención de commits

Conventional Commits, adaptado a lo que este repo ya usa —
`docs/onboarding.md` ya trae el ejemplo `feat(points): RF-314 check-in
transaccional` y `CLAUDE.md` ya pide "referencia el requisito o la tarea"; lo
que sigue lo formaliza:

```
<tipo>(<scope>): <RF-xxx o Txxx> <resumen en imperativo, español>

[cuerpo opcional — el porqué, no el qué; obligatorio si la razón no es obvia
 leyendo el diff]

[footer opcional — BREAKING CHANGE: ... ; Refs: RF-xxx, ADR-00x]
```

- **Tipos:** `feat` (funcionalidad nueva), `fix` (corrección), `test`
  (pruebas sin cambiar comportamiento), `docs` (specs/docs/ADR/prompts),
  `chore` (tooling, dependencias, scaffolding), `refactor`, `perf`, `build`,
  `ci`.
- **Scope:** el nombre del módulo NestJS afectado (`activities`, `points`,
  `leaderboard`, el que corresponda una vez exista para 001/002/004), o
  `repo` para cambios transversales (bootstrap, prompts, progress.md).
- **Referencia:** el RF que satisface o el/los ID de tarea de `tasks.md`
  (`T060`, o un rango `T060-T068` si el commit cierra varias tareas
  relacionadas). Los commits de un prompt `-a` referencian el ADR si generó
  uno.
- Un commit no mezcla dos módulos ni dos tipos sin relación. Preferible varios
  commits pequeños y correctos a uno grande que hay que diseccionar después.

Ejemplos reales que deberían salir de estos prompts:

```
feat(activities): T060-T064 check-in transaccional con idempotencia
test(activities): T010-T013 pruebas de contrato de check-in
chore(repo): T019 levanta PostgreSQL real para pruebas de integración
docs(points): T046 documenta points-cli reconcile en contracts/
```

## Convenciones dentro de cada prompt

- Cita IDs de tarea reales (`Txxx`) cuando el prompt los tiene; si el módulo
  todavía no tiene `tasks.md` (caso de los `-b` de 001/002/004 antes de
  ejecutar su `-a`), el prompt dice explícitamente que hay que generarlos
  primero, no inventa números.
- Nunca repite el cierre estándar completo — apunta aquí.
- Nunca repite la lista de artículos de la constitución — apunta a
  `memory/constitution.md` y cita solo el artículo puntual que aplica al paso
  en cuestión.
