---
name: contratos-api
description: Convenciones de la API del TEDxUCB — formato de respuestas y errores, paginación, códigos HTTP, nomenclatura de rutas, versionado, idempotencia y cómo redactar un contrato antes de implementar. Úsala siempre que definas, modifiques o documentes un endpoint; cuando decidas qué código HTTP devolver; cuando escribas un archivo en contracts/; o cuando el frontend pregunte qué devuelve una ruta. También al revisar un endpoint existente.
---

# Contratos de API — TEDxUCB

## El contrato va primero

Se escribe en `specs/NNN-feature/contracts/` **antes** de la implementación, y
las pruebas de contrato se derivan de él y deben fallar antes de que exista el
código (Artículo IX).

Un contrato no es documentación de lo que se construyó: es la definición de lo
que se va a construir. Si lo escribes después, es un resumen, y sirve para poco.

## Qué lleva un contrato

1. Ruta, método y a qué requisitos responde
2. Autorización requerida, con precisión
3. Cuerpo de la petición, campo por campo
4. Respuesta exitosa con ejemplo real
5. **Todos los modos de fallo**, con su código y su significado
6. Garantías transaccionales, si las hay
7. Comportamiento ante reintento, si la operación escribe

El punto 5 es el que más se omite y el que más problemas evita. Cada modo de
fallo necesita su prueba.

## Convenciones

**Prefijo:** `/api/v1`. El versionado va en la ruta.

**Rutas** en sustantivos plurales y `kebab-case`. Recursos anidados cuando la
relación es real:

```
GET    /api/v1/activities
POST   /api/v1/activities/:id/checkin
GET    /api/v1/me/points
```

`/me` para todo lo que sea del propio usuario autenticado. Nunca expongas
`/students/:id/points` para que el alumno consulte lo suyo: invita a probar con
el id de otro.

**Fechas** en ISO 8601 con zona UTC: `2026-09-15T19:32:04Z`.

**Identificadores** UUID. Nunca enteros secuenciales en la API: revelan volumen y
se pueden recorrer.

## Códigos HTTP

| Código | Cuándo |
|---|---|
| `200` | Consulta exitosa, o **reintento idempotente de una operación ya realizada** |
| `201` | Recurso creado |
| `400` | Petición malformada o validación de forma |
| `401` | Sin autenticar, o credencial vencida |
| `403` | Autenticado pero sin permiso |
| `404` | No existe, o no debe revelarse que existe |
| `409` | Conflicto de estado: duplicado, ventana cerrada, ya revertido |
| `410` | Plazo vencido: reclamos cerrados, invitación expirada |
| `422` | Semánticamente inválido pese a estar bien formado |
| `429` | Límite de frecuencia superado |

El `200` de la primera fila es deliberado: un reintento tras caída de red **no es
un error**. Devolver `409` ahí obligaría al staff a distinguir entre "ya estaba
registrado por otro" y "mi propio reintento", que es exactamente lo que no puede
hacer con una fila esperando.

## Formato de error

Siempre igual:

```json
{
  "statusCode": 409,
  "error": "ALREADY_CHECKED_IN",
  "message": "Este alumno ya fue registrado en esta actividad.",
  "details": { "checkedInAt": "2026-09-15T19:28:11Z", "validatedBy": "Carlos Mendoza" }
}
```

- `error` en `SCREAMING_SNAKE_CASE`, estable, pensado para que el cliente decida.
- `message` en español, para mostrar a una persona.
- `details` con lo necesario para resolver la situación en el momento.

`error` es parte del contrato: cambiarlo rompe clientes. Trátalo como una API
pública.

## Paginación

```json
{ "data": [], "meta": { "page": 1, "limit": 20, "total": 312, "totalPages": 16 } }
```

Parámetros `?page=1&limit=20`. Límite máximo definido y aplicado en el servidor,
no confiado al cliente.

## Idempotencia

Toda operación que otorga puntos es idempotente. **La clave la deriva el
servidor**, nunca llega del cliente: si el cliente la elige, puede eludir la
protección enviando una distinta en cada reintento.

Comportamiento exigido:

| Escenario | Resultado |
|---|---|
| Primera petición | `201` |
| Reintento tras fallo de red | `200` con el mismo resultado, sin efecto nuevo |
| Dos peticiones concurrentes | Una `201`, otra `409`. Nunca dos `201` |

## Autorización en el contrato

Escribe la condición completa, no solo el rol. La diferencia importa:

- ❌ "Requiere rol STAFF"
- ✅ "Requiere rol STAFF o ADMIN, **y además** estar asignado a `activityId`"

Un rol es una categoría; un permiso es una relación concreta. En este proyecto no
existe staff con acceso global (Artículo V).

## Respuestas útiles, no mínimas

La respuesta del check-in devuelve nombre, código de registro, fotografía, puntos
otorgados y nuevo total. Podría devolver solo un id, pero el staff necesita
confirmar visualmente a quién registró, con gente esperando y homónimos en el
padrón.

Diseña la respuesta pensando en la persona que la va a mirar, no en el mínimo
técnico suficiente.

## Endpoints públicos

Los de `/api/v1/public/*` no requieren autenticación y son los que van a recibir
abuso. Necesitan límite de frecuencia propio y, en formularios, captcha. El
límite del endpoint público de postulaciones y el del check-in son problemas
distintos: uno recibe spam, el otro recibe picos legítimos.

## Antes de dar el contrato por cerrado

- [ ] ¿Están todos los modos de fallo, cada uno con su código propio?
- [ ] ¿Está escrita la condición de autorización completa?
- [ ] ¿Dice qué pasa si la petición llega dos veces?
- [ ] ¿Los ejemplos son datos reales y verosímiles?
- [ ] ¿La respuesta sirve a quien la va a leer en pantalla?
- [ ] ¿Existe ya la prueba de contrato, y falla?
