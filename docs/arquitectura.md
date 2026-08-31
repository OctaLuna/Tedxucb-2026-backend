# Arquitectura

Visión técnica del sistema. Las decisiones y su justificación están en los
`plan.md` de cada feature y en `docs/decisiones/`.

## Forma general

**Monolito modular.** El evento tiene fecha fija y el equipo es acotado;
microservicios serían sobreingeniería. La modularidad interna deja la puerta
abierta si algún día hiciera falta separar.

```
┌─────────────────┐   ┌─────────────────┐
│  Sitio público  │   │  App interna    │
│  (visitantes)   │   │ (alumnos/staff) │
└────────┬────────┘   └────────┬────────┘
         └──────────┬───────────┘
              ┌─────▼──────┐
              │  API REST  │  NestJS
              └─────┬──────┘
        ┌───────────┼───────────┐
   ┌────▼────┐ ┌────▼────┐ ┌───▼────┐
   │Postgres │ │  Redis  │ │ Objetos│
   │  datos  │ │ colas   │ │imágenes│
   └─────────┘ └─────────┘ └────────┘
```

Este repositorio implementa solo la caja **API REST** (+ Postgres, Redis y
almacenamiento de objetos). "Sitio público" y "App interna" son superficies
cliente que consumen esta API desde fuera de este repositorio — ver
`docs/decisiones/ADR-006-repositorio-solo-backend.md`.

## Piezas

| Pieza | Rol |
|---|---|
| API NestJS | Toda la lógica. Módulos por dominio. |
| PostgreSQL | Datos y, sobre todo, **las garantías de integridad**. |
| Redis + BullMQ | Correos, expiración de cupos, reconciliación diaria. |
| Almacenamiento de objetos | Avatares y fotos de speakers. Nunca en el disco del servidor. |

## Las garantías viven en la base de datos

Es la decisión de arquitectura más importante del proyecto. Verificar antes de
insertar tiene condición de carrera: dos escaneos simultáneos pasan ambos. Un
índice único no.

Por eso están en el esquema, no en el servicio:

- Índice único parcial de asistencias vivas
- Clave de idempotencia única en el libro mayor
- `reverses_id` única, que impide revertir dos veces
- `CHECK` de puntaje no negativo
- Trigger que prohíbe mutar el libro mayor

Consecuencia directa: las pruebas corren contra PostgreSQL real. Un mock no
reproduce nada de esto (Artículo IX).

## Flujo crítico: check-in

Una sola transacción:

```
validar token → verificar asignación del staff → verificar ventana
  → INSERT asistencia → INSERT movimiento de puntos → UPDATE caché
  → COMMIT → encolar notificación
```

La notificación va **después** del commit: una caída del servicio de correo no
puede impedir que un alumno reciba sus puntos.

## Módulos

Máximo tres por feature (Artículo VII). Para `003`:

| Módulo | Responsabilidad |
|---|---|
| `activities` | Actividades, staff asignado, asistencias |
| `points` | Libro mayor, ajustes, reversiones, reclamos |
| `leaderboard` | Ranking y consultas agregadas |

## Trabajos en segundo plano

| Job | Frecuencia |
|---|---|
| Envío de correos | Bajo demanda |
| Expiración de invitaciones a cupos | Cada 15 min |
| Reconciliación de puntos | Diaria |
| Cierre de actividades vencidas | Horaria |
| Recordatorio de confirmación | Diaria |

Todos idempotentes: se reintentan.

## Condiciones de operación

El check-in ocurre en un pasillo, desde un teléfono de gama media, con wifi
saturado y una fila esperando. El diseño se valida contra ese escenario
(Artículo VI): respuesta por debajo de 500 ms en p95, confirmación visual
inequívoca y reintento seguro por construcción.
