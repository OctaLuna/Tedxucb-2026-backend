# Quickstart: validación manual del motor de puntos

**Feature:** `003-motor-de-puntos`

Estos escenarios se ejecutan a mano contra un entorno real antes de dar la
feature por terminada. Complementan las pruebas automatizadas: verifican que el
sistema funciona **para las personas que lo van a usar**, no solo que las
aserciones pasan.

Los escenarios 6 y 7 deben ejecutarse en el campus, con la red del campus y con
un teléfono de gama media. Validarlos en una laptop conectada por cable no
prueba nada sobre las condiciones reales de uso (Artículo VI).

---

## Preparación

1. Base de datos limpia con migraciones aplicadas.
2. Un administrador, dos miembros de staff, tres alumnos activos con avatar.
3. Una actividad publicada de 10 puntos, con ventana de check-in abierta,
   con el staff A asignado y el staff B **sin** asignar.

---

## Escenario 1 — Ciclo feliz

**Objetivo:** RF-314, RF-318. Historia 1, escenario 1.

1. El alumno 1 abre su perfil y muestra su código.
2. El staff A lo escanea.
3. Verificar que el staff ve el nombre, la fotografía, el código de registro del
   alumno, los puntos otorgados y el nuevo total.
4. El alumno 1 recarga su perfil.

**Se espera:** puntaje 10, y en el historial una entrada con la actividad, la
fecha y el validador.

**Falla si:** el staff no puede confirmar visualmente a quién registró, o el
alumno debe recargar más de una vez para ver sus puntos.

## Escenario 2 — Doble escaneo

**Objetivo:** RF-315, RF-317. Historia 1, escenario 2.

1. El staff A escanea de nuevo al alumno 1.

**Se espera:** rechazo indicando la hora del registro previo y quién lo hizo. El
puntaje sigue en 10.

**Falla si:** el error es genérico. El staff debe entender en un vistazo que no
es un fallo del sistema sino un registro que ya existía.

## Escenario 3 — Token vencido

**Objetivo:** RF-312, RF-313. Historia 6, escenario 1.

1. Capturar el código del alumno 2 en pantalla.
2. Esperar a que supere su vigencia.
3. Intentar escanear la captura.

**Se espera:** rechazo por vencimiento. Sin puntos otorgados.

**Falla si:** el token sigue siendo válido. Es la defensa central contra el
fraude: una captura que circula por WhatsApp no puede servir.

## Escenario 4 — Staff sin asignar

**Objetivo:** RF-305, Artículo V.

1. El staff B intenta escanear al alumno 2.

**Se espera:** acceso denegado.

## Escenario 5 — Fuera de ventana

**Objetivo:** RF-316.

1. El administrador cierra la ventana de check-in.
2. El staff A intenta escanear al alumno 3.

**Se espera:** rechazo indicando el horario de la ventana.

## Escenario 6 — Reintento por caída de red

**Objetivo:** RF-317. El caso que más va a ocurrir en producción.

1. Con el escáner abierto, cortar la conectividad justo tras enviar el escaneo
   del alumno 2 (modo avión durante el envío).
2. Restablecer la conexión y reintentar la misma operación.

**Se espera:** puntaje 10, **no 20**. Un solo registro en el historial.

**Falla si:** aparecen puntos duplicados. Es el escenario que hace ilegítimo
todo el ranking y no admite ninguna tolerancia.

## Escenario 7 — Concurrencia

**Objetivo:** RF-315, garantía de atomicidad.

1. El staff A y el administrador escanean al alumno 3 **simultáneamente**, desde
   dos dispositivos.

**Se espera:** uno registra, el otro recibe el rechazo por duplicado. Puntaje 10.

**Falla si:** ambos tienen éxito. Indica que la protección está en el código de
aplicación y no en el índice único de la base de datos.

## Escenario 8 — Registro manual

**Objetivo:** RF-319.

1. El staff A intenta un registro manual sin justificación.
2. Repetir con justificación.

**Se espera:** el primer intento se rechaza; el segundo funciona y el historial
del alumno muestra el registro identificado como manual, con su nota.

## Escenario 9 — Reversión

**Objetivo:** RF-325, RF-326, RF-329. Historia 4.

1. El administrador revierte la carga del alumno 1, indicando el motivo.
2. El alumno 1 abre su historial.

**Se espera:** puntaje 0, y **dos** movimientos visibles: la carga original y su
reversión, con el motivo.

**Falla si:** el movimiento original desapareció. Borrar la evidencia es
exactamente lo que el Artículo IV prohíbe.

3. Intentar revertir el mismo movimiento otra vez.

**Se espera:** rechazo por reversión ya existente. El puntaje no baja a -10.

## Escenario 10 — Penalización mayor que el saldo

**Objetivo:** RF-328.

1. Aplicar una penalización de 50 puntos a un alumno con 10.

**Se espera:** puntaje 0, nunca negativo, y la respuesta indica el truncamiento.

## Escenario 11 — Reconciliación

**Objetivo:** RF-332, RF-333, CE-303.

1. Alterar directamente en base de datos la caché de puntaje de un alumno.
2. Ejecutar `points-cli reconcile --all --json`.

**Se espera:** la inconsistencia se reporta. Con `--fix` la caché se recalcula
desde el libro mayor y queda constancia en auditoría.

**Falla si:** el proceso no detecta la diferencia. Sin esta red de seguridad, una
desincronización puede llegar sin ser vista hasta el día del corte.

## Escenario 12 — Cambio de valor de una actividad

**Objetivo:** RF-306. Historia 3, escenario 3.

1. Con puntos ya otorgados, el administrador cambia el valor de la actividad de
   10 a 20.
2. Revisar el puntaje de los alumnos ya registrados.
3. Registrar a un alumno nuevo.

**Se espera:** los anteriores conservan 10; el nuevo recibe 20.

## Escenario 13 — Prueba de campo

**Objetivo:** CE-301, Artículo VI. **Obligatoria antes de la primera actividad
real.**

1. Simular una fila de 20 alumnos con dos miembros del staff escaneando, en el
   lugar físico donde ocurrirán las actividades, usando la red del campus y
   teléfonos de gama media.

**Se espera:** cada registro se completa en menos de 5 segundos y ningún
escaneo se pierde.

**Falla si:** se forma cuello de botella o el staff necesita reintentar a
menudo. Un sistema correcto que en la práctica hace esperar veinte minutos a
una fila termina siendo abandonado por registros manuales, y con ello se pierde
toda la trazabilidad.
