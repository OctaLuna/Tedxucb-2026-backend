---
name: modulo-backend
description: Convenciones del backend TEDxUCB — estructura de módulos NestJS, uso de Prisma, migraciones, transacciones, guards, manejo de errores y trabajos en segundo plano. Úsala siempre que vayas a crear o modificar un módulo, servicio, controlador, migración o esquema Prisma en este proyecto; cuando escribas una consulta a base de datos; o cuando tengas que decidir dónde poner una pieza de lógica nueva. También al revisar código backend ajeno.
---

# Convenciones del backend — TEDxUCB

Stack: **NestJS + TypeScript + PostgreSQL + Prisma**. Monolito modular. BullMQ +
Redis para trabajos en segundo plano.

## Antes de escribir

Lee el `plan.md` de la feature. Si lo que vas a construir no está en un contrato
de `contracts/`, no lo escribas todavía: vuelve a la fase Plan. El orden es
contratos → pruebas → código, no al revés (Artículo III).

## Estructura de un módulo

```
modules/nombre/
├── nombre.module.ts
├── nombre.controller.ts
├── nombre.service.ts
├── dto/
│   ├── create-nombre.dto.ts
│   └── update-nombre.dto.ts
└── nombre.service.spec.ts
```

Un módulo hace una cosa. Si el nombre necesita una "y", probablemente son dos.

**Límite de tres módulos por feature** (Artículo VII). La propuesta inicial de
este proyecto declaraba catorce y hubo que justificarlo en el Registro de
complejidad. Si necesitas un cuarto, documenta por qué en `plan.md` antes de
crearlo.

## Anti-abstracción (Artículo VIII)

- **Usa Prisma directamente.** Nada de patrón repositorio encima: el ORM ya es
  esa capa.
- **Una sola representación del modelo.** Los tipos generados por Prisma son la
  representación. Crea un DTO solo cuando el contrato público difiera realmente
  de la entidad, por ejemplo la respuesta del check-in, que compone datos de tres
  tablas.
- No envuelvas funcionalidades del framework sin una razón que puedas escribir.

## Dónde va la lógica

| Pieza | Responsabilidad |
|---|---|
| Controlador | Recibir, validar forma, delegar. Sin lógica de negocio. |
| Servicio | La lógica. Invocable sin levantar HTTP (Artículo I). |
| Guard | Autorización. Nunca decisiones de negocio. |
| Job | Trabajo diferido. Idempotente, porque se reintenta. |

Prueba del Artículo I: ¿puedes ejercitar esta lógica desde una prueba unitaria
sin arrancar el servidor? Si no, está en el lugar equivocado.

## Transacciones

Todo lo que deba ocurrir junto va en un `$transaction`. En particular, el
check-in: asistencia, movimiento de puntos y caché de puntaje.

```ts
await this.prisma.$transaction(async (tx) => {
  // ...
}, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
```

Reglas:

- Nada de llamadas de red dentro de la transacción. Las notificaciones se encolan
  **después** del commit: una caída del servicio de correo no puede impedir que
  un alumno reciba sus puntos.
- Bloquea la fila antes de actualizar un contador (`SELECT ... FOR UPDATE`).
- Mantén la transacción corta: se ejecuta con una fila de gente esperando.

## Migraciones

- Una migración por cambio lógico, con nombre descriptivo.
- **Las garantías van en el esquema, no solo en el servicio.** Verificar antes de
  insertar tiene condición de carrera; una restricción del motor no.
- Toda restricción de negocio que puedas expresar en SQL, exprésala:
  `CHECK`, índices únicos, índices únicos parciales, claves foráneas.
- Nunca edites una migración ya aplicada en producción: crea una nueva.
- Las migraciones destructivas requieren respaldo verificado antes de aplicarse.

Ejemplo de por qué esto importa:

```sql
-- Impide dos asistencias vivas del mismo alumno en la misma actividad.
-- Un SELECT previo en el servicio no lo lograría: dos escaneos simultáneos
-- pasarían ambos.
CREATE UNIQUE INDEX one_attendance_per_activity
  ON attendances (activity_id, student_id)
  WHERE status <> 'REJECTED';
```

## Guards y permisos

- `JwtAuthGuard` para autenticación.
- `RolesGuard` con `@Roles('ADMIN')` para rol.
- `ActivityStaffGuard` para verificar **asignación explícita**, no solo rol. Ser
  staff no basta: hay que estar asignado a esa actividad concreta (Artículo V).

La autorización se aplica con guards, no con comprobaciones dispersas dentro de
los servicios. Disperso significa que alguien la va a olvidar en el próximo
endpoint.

## Errores

Formato uniforme en toda la API:

```json
{ "statusCode": 409, "error": "ALREADY_CHECKED_IN", "message": "...", "details": {} }
```

Usa las excepciones de NestJS (`ConflictException`, `ForbiddenException`) con un
código de error propio. **Un mensaje genérico es inaceptable en el check-in**: el
staff está en un pasillo y debe entender en un vistazo si el problema es el
token, la hora o un registro que ya existía.

Cuando rechaces por duplicado, devuelve los datos del registro previo. Sirven
para resolver la situación en el momento.

## Consultas

- Índice para toda consulta que ordene o filtre en caliente. El ranking ordena
  cientos de filas por puntaje en cada carga.
- Nada de N+1: usa `include` o `select` con intención.
- Pagina todo listado que pueda crecer, con formato uniforme:
  `{ data, meta: { page, limit, total, totalPages } }`.

## Trabajos en segundo plano

- Idempotentes, porque se reintentan.
- Con reintentos y retroceso exponencial.
- Registran su resultado.
- Nunca son el único camino para algo crítico: si el envío de correos se cae, el
  sistema debe seguir funcionando.

## Configuración

- Variables de entorno tipadas y **validadas al arrancar**. Si falta una, la
  aplicación no levanta; enterarse en producción a mitad del evento es peor.
- Ningún secreto en el repositorio.
- Fechas en UTC en base de datos, `America/La_Paz` al presentar.

## Nombres

Documentación y commits en español; código en inglés. Tablas en plural y
`snake_case` (`point_transactions`); clases en `PascalCase`; archivos en
`kebab-case`.

## Antes de dar por terminado

- [ ] ¿Existe la prueba y falló antes de existir el código?
- [ ] ¿Las restricciones están en el esquema, no solo en el servicio?
- [ ] ¿Qué pasa si esta petición llega dos veces?
- [ ] ¿Los errores tienen código propio y mensaje útil?
- [ ] ¿Hay lógica de negocio en un controlador o en un guard?
- [ ] Si toca puntos: carga la skill `motor-de-puntos`.
