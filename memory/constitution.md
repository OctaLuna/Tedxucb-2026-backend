# Constitución del Proyecto: TEDxUCB

> Principios no negociables que rigen cómo las especificaciones se convierten
> en código en este proyecto. Estable en el tiempo; su aplicación concreta
> puede evolucionar mediante el proceso de enmienda al final.

**Contexto que justifica esta constitución:** el sistema decide quién de entre
cientos de alumnos ocupa 80 asientos. Cualquier punto mal otorgado, duplicado o
perdido es una decisión injusta con nombre y apellido. La exigencia de rigor
aquí no es preferencia de estilo: es el requisito central del producto.

---

## Artículo I — Library-First

Cada feature nace como módulo independiente y reutilizable antes de integrarse
en la aplicación. La lógica de negocio no vive en controladores ni en el punto
de entrada. Concretamente: el cálculo de puntos, la validación de tokens QR y
el algoritmo de asignación de cupos deben ser invocables sin levantar el
servidor HTTP.

## Artículo II — Interfaz observable

Cada módulo expone su funcionalidad de forma verificable desde fuera: API HTTP
documentada en OpenAPI, o función pura con entrada y salida claras. Nada de
cajas negras que solo se puedan probar a través de la interfaz gráfica.

Corolario obligatorio para este proyecto: el motor de puntos expone un comando
de consola que recalcula y reconcilia el puntaje de un alumno desde el ledger e
imprime el resultado en JSON. Debe poder ejecutarse en producción por un
operador durante el evento, sin depender de la interfaz web.

## Artículo III — Test-First (no negociable)

No se escribe código de implementación antes de:

1. Escribir las pruebas.
2. Que el responsable del proyecto las valide y apruebe.
3. Confirmar que fallan (fase Red).

Solo entonces se escribe el código mínimo para ponerlas en verde.

Sin excepción para el flujo de check-in y para la asignación de cupos. Son las
dos operaciones donde un error es irreversible en términos de confianza.

## Artículo IV — Auditabilidad del puntaje

**El puntaje de un alumno es siempre la suma de su ledger. Sin excepción.**

- El ledger de puntos es de solo inserción: prohibido `UPDATE` y `DELETE`.
- Todo error se corrige con una transacción de reversión que apunta a la
  original. Ambas quedan visibles en el historial.
- Cualquier campo de puntaje agregado es caché derivada, nunca fuente de
  verdad, y debe poder reconstruirse desde cero.
- Toda transacción registra quién la originó, cuándo y por qué. Una transacción
  sin autor identificable solo es admisible si fue automática, y aun así debe
  apuntar al evento que la disparó.
- Cualquier alumno debe poder responderse "¿de dónde salió cada punto que
  tengo?" leyendo su propio historial, sin intervención de un administrador.

Toda operación que otorgue o retire puntos es **idempotente**: reintentarla con
la misma clave no produce un segundo efecto. La red del campus fallará durante
las actividades; el diseño lo asume.

## Artículo V — Privilegio mínimo y datos personales

- El acceso se concede por rol y por asignación explícita, nunca por
  conveniencia. Un miembro del staff solo valida en las actividades que tiene
  asignadas; no hay staff con acceso global.
- Ninguna acción sensible ocurre sin quedar registrada en auditoría: alta de
  usuarios, cambio en el valor de una actividad, ajuste o reversión de puntos,
  y ejecución de la asignación de cupos.
- Los datos personales de alumnos se recogen únicamente para operar el evento.
  Su acceso masivo está restringido y auditado.
- Ningún secreto vive en el repositorio. Toda credencial entra por variable de
  entorno validada al arrancar.

## Artículo VI — Fiabilidad bajo condiciones de campo

El check-in ocurre en un pasillo, desde el celular de gama media de un
voluntario, con wifi saturado y una fila de estudiantes esperando. El diseño se
valida contra ese escenario, no contra el laboratorio.

- Respuesta del check-in por debajo de 500 ms en el percentil 95.
- Confirmación visual inequívoca del resultado: a quién se registró y cuántos
  puntos recibió.
- Ante fallo de red, el reintento es seguro por construcción (Artículo IV).
- Un intento de registro duplicado devuelve un error explicativo con la hora del
  registro previo, nunca un fallo genérico ni un doble abono.
- Todas las fechas se almacenan en UTC y se presentan en `America/La_Paz`.

## Artículo VII — Simplicidad

- Máximo 3 proyectos/módulos para la implementación inicial.
- Cualquier módulo adicional requiere justificación documentada en el Registro
  de complejidad del plan correspondiente.
- Prohibido el future-proofing. No se construye para requisitos hipotéticos:
  el evento es el 9 de noviembre y el tiempo es el recurso escaso.

## Artículo VIII — Anti-abstracción

- Usar las funcionalidades del framework directamente, sin envolverlas en capas
  propias sin razón demostrable.
- Una sola representación del modelo de datos. Los DTO existen solo donde el
  contrato público difiere realmente de la entidad.
- Sin patrón repositorio sobre el ORM: el ORM ya es esa capa.

## Artículo IX — Integration-First Testing

- Pruebas contra PostgreSQL real, no mocks. La corrección del sistema de puntos
  depende de restricciones e índices únicos que un mock no reproduce; probar el
  check-in contra un doble de prueba valida exactamente nada.
- Las pruebas de contrato de la API se escriben antes que la implementación.
- El flujo completo —crear actividad, escanear, otorgar puntos, revertir,
  asignar cupo, confirmar, ingresar— debe existir como prueba de integración
  end-to-end antes de considerar el sistema listo.

---

## Proceso de enmienda

Modificar esta constitución requiere documentar la razón del cambio, obtener la
aprobación de quien mantiene el proyecto y evaluar el impacto sobre lo ya
construido.

| Fecha | Artículo modificado | Razón |
|---|---|---|
| 2026-08-30 | Creación inicial | Adopción de SDD para el proyecto TEDxUCB |
