# Análisis SDD — Estado del proyecto TEDxUCB

**Fecha:** 30 de agosto de 2026
**Insumo auditado:** `SPEC-legacy.md` (el documento producido antes de aplicar SDD)
**Metodología:** github/spec-kit — fases `constitution → specify → clarify → plan → tasks → analyze → implement`

---

## 1. Diagnóstico general

El documento existente es **sólido como plan técnico, pero no es un spec** en términos SDD. Contiene DDL de PostgreSQL, elección de framework, rutas HTTP y estructura de carpetas: todo eso es material de `plan.md`, no de `spec.md`. La consecuencia práctica no es cosmética: al mezclar QUÉ con CÓMO, las decisiones de producto quedaron enterradas entre decisiones técnicas, y varias de ellas se dieron por resueltas cuando en realidad nunca se decidieron.

También trata el proyecto como una sola unidad. Son al menos cuatro features con dependencias distintas, riesgos distintos y fechas de entrega distintas. El sitio público puede salir en septiembre; el motor de puntos no sirve de nada si sale una semana antes del evento.

## 2. Hallazgos

| # | Severidad | Hallazgo | Acción |
|---|---|---|---|
| H-01 | Alta | El spec mezcla QUÉ y CÓMO: DDL, stack, endpoints y árbol de carpetas dentro del documento de requisitos. | Separado: requisitos → `specs/NNN/spec.md`; técnica → `plan.md`, `data-model.md`, `contracts/`. |
| H-02 | Alta | No existe constitución del proyecto. Sin ella no hay gates que verificar en la fase Plan. | Creado `memory/constitution.md` con los Artículos IV–VI propios del proyecto. |
| H-03 | Alta | Proyecto monolítico sin descomponer: no se puede entregar ni probar por partes. | Descompuesto en 4 features numeradas con dependencias explícitas. |
| H-04 | Alta | **No existe canal de reclamo de puntos.** Con 80 cupos disputados, un alumno que cree que le falta un punto no tiene a dónde ir. Es el hueco más grande del diseño anterior. | Añadido como RF explícito en `003-motor-de-puntos`. |
| H-05 | Alta | La escala de puntos por tipo de actividad nunca se definió, pero todo el sistema de selección depende de ella. | Marcado `[NECESITA CLARIFICACIÓN]` — bloquea la Fase 3. |
| H-06 | Media | Requisitos redactados como funcionalidades narradas (F-01…F-23), no como afirmaciones verificables. | Reescritos como RF-xxx en formato "El sistema DEBE…", cada uno comprobable. |
| H-07 | Media | Sin historias de usuario ni escenarios Dado/Cuando/Entonces: nada es probable de forma independiente. | Añadidas historias P1/P2/P3 con escenarios de aceptación por feature. |
| H-08 | Media | Criterios de éxito ausentes. Los "criterios de aceptación" del documento anterior son funcionales, no medibles a nivel de producto. | Añadidos CE-xxx medibles por feature. |
| H-09 | Media | Las 7 "decisiones pendientes" estaban al final, en prosa, desconectadas de los requisitos que bloquean. | Convertidas en marcadores `[NECESITA CLARIFICACIÓN]` incrustados en el requisito concreto que afectan. |
| H-10 | Media | Artículo IX (integration-first): no hay pruebas de contrato planificadas, y el check-in es una operación transaccional que **no** puede validarse con mocks. | Contrato de check-in escrito antes que el código; pruebas contra PostgreSQL real. |
| H-11 | Media | Artículo VII (simplicidad): 14 módulos NestJS declarados de entrada supera con creces el límite de 3. | Documentado en el Registro de complejidad del plan, con la agrupación reducida y justificada. |
| H-12 | Baja | No hay política de retención ni eliminación de datos personales tras el evento. Se manejan padrones de alumnos identificables. | Añadido como requisito en `001-identidad-y-usuarios`. |
| H-13 | Baja | Sin requisitos de accesibilidad en el sitio público, siendo un evento institucional universitario. | Añadido como RF en `002-sitio-publico`. |
| H-14 | Baja | Ambigüedad no detectada antes: qué ocurre con los puntos si una actividad se cancela **después** de haberlos otorgado. | Marcado y resuelto como caso límite explícito. |

## 3. Descomposición en features

| ID | Feature | Depende de | Por qué existe separada |
|---|---|---|---|
| `001` | Identidad, usuarios y perfiles | — | Base de todo. Sin usuarios y roles no hay nada más. |
| `002` | Sitio público TEDxUCB | 001 (solo para el panel de edición) | **No depende del motor de puntos.** Puede publicarse mucho antes y es lo que da presencia al evento mientras se construye el resto. |
| `003` | Motor de puntos y participación | 001 | El corazón del sistema y el de mayor riesgo. Merece su propio ciclo completo de spec, contratos y pruebas. |
| `004` | Selección y gestión de cupos | 003 | Se ejecuta una sola vez, cerca del evento, pero su corrección es crítica: define quién entra y quién no. |

## 4. Ambigüedades abiertas que bloquean el avance

Trece marcadores `[NECESITA CLARIFICACIÓN]` repartidos en los cuatro specs. Los tres que bloquean más trabajo aguas abajo:

1. **Escala de puntos por actividad** (`003`) — sin esto no se puede sembrar el catálogo ni probar el ranking.
2. **Cuota por carrera o facultad** (`004`) — cambia el algoritmo de asignación, no solo un parámetro.
3. **Método de autenticación** (`001`) — correo institucional vía Google o credenciales propias cambia todo el módulo de auth y el alta masiva.

## 5. Estado de las fases

| Fase | Estado |
|---|---|
| Constitution | ✅ Completa — `memory/constitution.md` |
| Specify | ✅ Completa — 4 specs redactados |
| Clarify | ⏳ **Pendiente** — 13 marcadores abiertos |
| Plan | 🟡 Parcial — `003` planificado; `001`, `002`, `004` pendientes |
| Tasks | 🟡 Parcial — `003` desglosado |
| Analyze | ✅ Este documento |
| Implement | ⛔ Bloqueada hasta cerrar Clarify |

## 6. Trazabilidad: documento anterior → nueva estructura

| Sección de `SPEC-legacy.md` | Destino |
|---|---|
| Propósito, alcance, glosario | `specs/*/spec.md` (contexto) + este análisis |
| Roles y matriz de permisos | `specs/001-identidad-y-usuarios/spec.md` |
| F-01 a F-05 (sitio público) | `specs/002-sitio-publico/spec.md` |
| F-06 a F-16 (perfiles, actividades, puntos) | `specs/001` y `specs/003` |
| F-17 a F-20 (cupos) | `specs/004-seleccion-de-cupos/spec.md` |
| Decisiones técnicas, DDL, endpoints, arquitectura | `specs/003-motor-de-puntos/plan.md`, `data-model.md`, `contracts/` |
| Reglas de negocio RN-01…RN-14 | Distribuidas como RF y casos límite en cada spec |
| Seguridad, jobs, no funcionales | `memory/constitution.md` (Artículos IV–VI) + `plan.md` |
| Fases de entrega | Reemplazadas por el orden de features y `tasks.md` |
| Decisiones pendientes | Marcadores `[NECESITA CLARIFICACIÓN]` en los specs |

`SPEC-legacy.md` se conserva como referencia histórica. **No es la fuente de verdad.** A partir de ahora manda el árbol `specs/`.
