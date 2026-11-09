# Innovation Week: puntos por asistencia

## Fuente de verdad

`point_transactions` es el libro mayor inmutable. Cada asistencia aprobada a
una actividad que otorga puntos produce un movimiento `ACTIVITY` en la misma
transacción que crea la asistencia. `attendance_id` único, el índice de una
asistencia por actividad y la clave de idempotencia impiden duplicar el abono
cuando la actividad no admite registros múltiples.

`event_student_points` es una proyección derivada, separada por evento. El
trigger del libro mayor la actualiza dentro de la misma transacción, por lo que
`GET /me/points?eventSlug=innovation-week` devuelve el saldo ya actualizado al
confirmar el check-in. Los campos globales de `student_profiles` son una
caché heredada y opcional; no son requisito para que una cuenta participe ni
para calcular su saldo de Innovation Week.

## Cuentas existentes y retroactividad

La migración `20261109170000_make_attendance_points_user_owned` cambia las
claves foráneas de asistencia, movimientos y proyección para que apunten a
`users`. Es una ampliación compatible: conserva los UUID existentes y permite
asociar movimientos a cuentas activas que no tienen ficha académica.

La migración agrega al ledger únicamente asistencias aprobadas de Innovation
Week que todavía no tienen un movimiento ligado por `attendance_id`. No
actualiza ni elimina movimientos existentes. El modelo de asistencia no guarda
una instantánea histórica del valor de puntos; para esos registros faltantes,
el backfill usa `activities.points_value` actual. El backfill es idempotente y
reconstruye la proyección desde el ledger al terminar.

## Actualización de la web

Innovation Week consulta su saldo personal desde `/me/points`, al iniciar
sesión, al volver a la pestaña y cada cinco segundos mientras está visible. La
consulta se detiene al cerrar sesión, usar una identidad demo o perder acceso
al evento. El saldo personal se refresca cada cinco segundos; las listas del
ranking de la hero y de Mi perfil, cada diez segundos. La interfaz muestra el
saldo del ledger del evento; el estado local de juegos conserva su propósito
independiente.

El contrato de Avatar 2D solo transporta y guarda la identidad/ilustración del
participante. No almacena ni calcula puntos; Mi perfil los presenta leyendo el
estado de la cuenta en Innovation Week.

## Registro NFC del cronograma

Las confirmaciones NFC de `program_attendances` también otorgan puntos en Innovation Week. La migración `20261109180000_award_points_from_program_attendances` enlaza las actividades puntuables con elementos del mismo evento y título mediante `activities.program_item_id`, asocia la asistencia NFC al ledger y completa abonos históricos faltantes. Si el usuario ya obtuvo puntos por la asistencia operativa de la misma actividad, el backfill y el check-in NFC no le otorgan puntos duplicados. El alta NFC y el movimiento futuro se guardan en la misma transacción. La elegibilidad se rige por el estado publicado del elemento del cronograma, aunque la actividad de configuración permanezca en `DRAFT`.
