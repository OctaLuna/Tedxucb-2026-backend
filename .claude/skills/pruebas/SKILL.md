---
name: pruebas
description: Estrategia de pruebas del TEDxUCB — test-first obligatorio, pruebas contra PostgreSQL real en lugar de mocks, pruebas de contrato, concurrencia e idempotencia, y validación manual en campo. Úsala siempre que vayas a escribir, modificar o revisar cualquier prueba; antes de implementar cualquier funcionalidad nueva; cuando dudes si algo necesita prueba o de qué tipo; o cuando una prueba falle y no sepas si el problema es la prueba o el código. También si alguien propone mockear la base de datos.
---

# Pruebas — TEDxUCB

## Test-first no es negociable

Artículo III de la constitución. El orden es:

1. Escribir la prueba
2. Que el responsable la valide
3. **Confirmar que falla** (fase Red)
4. Escribir el código mínimo para ponerla en verde

Sin excepción en el check-in y en la asignación de cupos: son las dos
operaciones donde un error es irreversible en términos de confianza.

Una prueba escrita después del código valida lo que el código hace, no lo que
debería hacer. Es el error más fácil de cometer y el más difícil de detectar
después.

## Nada de mocks de base de datos

Artículo IX. Las pruebas corren contra **PostgreSQL real** en contenedor.

Esto no es purismo. La corrección de este sistema depende de garantías que solo
existen en el motor:

- El índice único parcial que impide el doble check-in
- La restricción de idempotencia que neutraliza reintentos
- El `CHECK` que impide puntaje negativo
- El trigger que prohíbe mutar el libro mayor

Un doble de prueba no reproduce ninguna. Probar el check-in contra un mock valida
que tu código llama a las funciones que esperas, no que el sistema es correcto.

Mockea solo lo que está fuera de tu control: envío de correos, reloj cuando
necesites viajar en el tiempo, servicios externos.

## Tipos y cuándo usarlos

| Tipo | Qué prueba | Contra qué |
|---|---|---|
| Contrato | Que la API cumple lo escrito en `contracts/` | HTTP + base real |
| Integración | Escenarios de aceptación del spec | HTTP + base real |
| Unitaria | Lógica pura: cálculos, validaciones, tokens | Nada externo |
| Manual | `quickstart.md`, incluidos escenarios de campo | Entorno real |

Las de contrato se escriben primero y se derivan directamente de los archivos de
`contracts/`. Si el contrato no existe, no escribas la prueba todavía: falta una
decisión.

## Las tres pruebas que este proyecto no puede no tener

### 1. Idempotencia

```
Dado un check-in exitoso
Cuando se reintenta la misma operación
Entonces el puntaje no cambia y se devuelve el mismo registro
```

Es el escenario que **más va a ocurrir en producción**: la red del campus falla y
el staff reintenta. Sin esta prueba, el primer día de actividades genera puntos
duplicados.

### 2. Concurrencia

```
Dado dos peticiones de check-in simultáneas para el mismo alumno
Cuando llegan a la vez
Entonces una prospera y la otra recibe 409. Nunca ambas
```

Simultáneas de verdad (`Promise.all`), no una tras otra. Si ambas prosperan, la
protección está en el código de aplicación y tiene condición de carrera.

### 3. Trazabilidad de la reversión

```
Dada una carga de puntos revertida
Cuando el alumno consulta su historial
Entonces ve ambos movimientos, cada uno con su motivo
```

Si el movimiento original desapareció, se rompió el Artículo IV y con él la
capacidad de defender el ranking ante un reclamo.

## Qué probar, más allá del camino feliz

Los caminos de error son los que sostienen la legitimidad del sistema. Para cada
operación:

- Cada modo de fallo del contrato, con su código propio
- Los límites: cero puntos, penalización mayor que el saldo, alumno sin
  actividades, actividad sin asistentes
- Los permisos: staff sin asignación, alumno accediendo a datos de otro, cuenta
  pendiente de verificación
- El tiempo: token vencido, ventana cerrada, plazo de reclamos superado

## Nombres

Que describan el comportamiento esperado, no la función:

- ✅ `rechaza el check-in cuando el staff no está asignado a la actividad`
- ❌ `test checkin 2`

Alguien va a leer la salida de las pruebas un martes a las once de la noche,
buscando qué se rompió.

## Datos de prueba

- Cada prueba crea lo que necesita y no depende de otra.
- Base limpia entre pruebas: transacción con rollback, o truncado.
- Nombres verosímiles y locales. `Juan Pérez` sirve; `Test User 1` esconde
  problemas de visualización con nombres largos o con dos apellidos, que es lo
  normal en el padrón real.

## Validación manual

Las pruebas automatizadas no cubren todo. `quickstart.md` tiene 14 escenarios
para ejecutar a mano antes de dar la feature por terminada.

**El escenario 13 es obligatorio antes de la primera actividad real:** 20 alumnos
en fila, dos dispositivos, red del campus, teléfonos de gama media. Un sistema
correcto que hace esperar veinte minutos a una fila termina reemplazado por
registros manuales, y con ellos se pierde toda la trazabilidad. Eso no lo detecta
ninguna prueba automatizada corriendo en una laptop conectada por cable.

## Cuando una prueba falla

Antes de tocarla, pregúntate si está mal la prueba o el código. Cambiar la prueba
para que pase es la forma más rápida de perder la garantía que aportaba.

Si la prueba refleja la spec y el código no la cumple, el código está mal. Si la
spec cambió, enmiéndala primero, con fecha y motivo, y después ajusta ambos.

## Antes de dar por terminada una feature

- [ ] ¿Cada modo de fallo del contrato tiene su prueba?
- [ ] ¿Cada escenario de aceptación del spec tiene su prueba de integración?
- [ ] ¿Existe la prueba de idempotencia?
- [ ] ¿Existe la prueba de concurrencia, con peticiones realmente simultáneas?
- [ ] ¿Las pruebas corren contra PostgreSQL real?
- [ ] ¿Se ejecutaron los escenarios de `quickstart.md`?
- [ ] ¿Fallaron todas antes de existir el código?
