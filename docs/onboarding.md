# Incorporarse al proyecto

## Lee en este orden

1. **`CLAUDE.md`** — qué es esto y cómo trabajamos. 5 minutos.
2. **`memory/constitution.md`** — los nueve artículos. No es burocracia: los
   artículos IV, V y VI salen de problemas reales de este proyecto.
3. **`specs/README.md`** — mapa de features y decisiones tomadas.
4. **El spec de la feature que te toque.**
5. **`.claude/skills/`** — la que corresponda a lo que vas a hacer.

Si vas a tocar puntos, `.claude/skills/motor-de-puntos/SKILL.md` no es opcional.

## Lo que hay que entender antes de escribir código

El auditorio tiene cupos limitados y sobran candidatos. Los puntos deciden quién
entra. Un punto duplicado o perdido es un alumno que se queda afuera
injustamente.

Casi todas las decisiones raras del proyecto salen de ahí. Si algo te parece
exagerado, esa es la razón.

## Cómo trabajamos

**Spec-Driven Development.** La especificación manda, el código obedece.

- ¿Vas a construir algo? Debe existir un requisito en un spec.
- ¿No existe? Escríbelo primero, o pide que se decida.
- ¿No está decidido? Márcalo `[NECESITA CLARIFICACIÓN]`. **No lo inventes.**
- ¿La spec dice algo distinto a lo que hace el código? La spec tiene razón hasta
  que se enmiende.

**Test-first.** Prueba primero, confirmar que falla, después el código. Sin
excepción en check-in y asignación de cupos.

## Primeros pasos prácticos

Antes de escribir la primera línea de código del backend:

1. Lee `memory/constitution.md`, en particular el Artículo III (test-first).
2. Lee `specs/003-motor-de-puntos/plan.md`.
3. Carga `.claude/skills/modulo-backend/SKILL.md`.
4. Levanta PostgreSQL en contenedor (las pruebas lo necesitan de verdad). No se
   mockea la base de datos: las garantías del sistema viven en índices y
   restricciones que un doble de prueba no reproduce.
5. Copia las variables de entorno de ejemplo. Si falta una, la app no arranca: es
   a propósito.
6. Aplica migraciones y semillas.
7. Corre las pruebas. Deben pasar todas.
8. Empieza por el **Grupo 1** de `specs/003-motor-de-puntos/tasks.md`: pruebas de
   contrato, que deben fallar antes de que exista el código.

El código vive directo en la raíz del repositorio (todo `Ted_backend` es el
backend), con esta estructura prevista:

```
prisma/
├── schema.prisma
├── migrations/
└── seed.ts
src/
├── main.ts
├── app.module.ts
├── common/       guards, decorators, filters, interceptors
├── config/       env tipado y validado al arrancar
├── modules/      máximo 3 por feature (Artículo VII)
└── jobs/
tests/
├── contract/
├── integration/
└── unit/
```

## Convenciones

- Documentación y commits en **español**; código en **inglés**.
- El commit referencia el requisito o la tarea: `feat(points): RF-314 check-in transaccional`.
- Fechas en UTC en base de datos, `America/La_Paz` al presentar.
- Ningún secreto en el repositorio.

## Errores que ya cometimos

- **Mezclar QUÉ y CÓMO en la spec.** Las decisiones de producto quedaron
  enterradas entre DDL y endpoints, y varias se dieron por resueltas sin haberse
  decidido. Está en `docs/legacy/`.
- **Declarar 14 módulos de entrada.** Violaba el Artículo VII.
- **Olvidar el canal de reclamos.** Con cupos disputados los reclamos llegan
  igual; sin canal formal se resuelven por WhatsApp y de forma desigual.

## Dónde preguntar

- ¿Requisito ambiguo? Marcador en el spec, no una suposición.
- ¿Decisión técnica no tomada? Vuelve a `plan.md`.
- ¿Algo contradice la constitución? Eso se discute antes de codificar, no
  después.
