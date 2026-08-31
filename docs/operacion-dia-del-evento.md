# Operación — día del evento

Guía para el 9 de noviembre y los días previos. Se ejecuta una sola vez, delante
de todo el mundo.

## Una semana antes

- [ ] Respaldo de base de datos verificado, con restauración probada
- [ ] Reconciliación de puntos ejecutada y sin discrepancias
- [ ] Todos los reclamos resueltos
- [ ] Asignación de cupos ejecutada y confirmaciones enviadas
- [ ] Lista de espera activa y promoción automática funcionando

## Dos días antes

- [ ] Aforo confirmado contra cupos confirmados
- [ ] **Lista impresa de asistentes como contingencia**
- [ ] Dispositivos de puerta probados con la red del venue, no con la del campus
- [ ] Staff de puerta con sesión iniciada y probada
- [ ] Promoción automática congelada según el margen definido

La lista impresa no es pesimismo. Si falla la conectividad en la puerta, la
alternativa es cien personas esperando en la vereda.

## El día

### Antes de abrir

- [ ] Verificar que la API responde
- [ ] Verificar el escaneo de entradas con una de prueba
- [ ] Tener a mano `points-cli` por si hay que resolver un caso en vivo
- [ ] Alguien con acceso de administrador presente y localizable

### Durante el ingreso

- Escanear la entrada. El sistema muestra el nombre y autoriza.
- Entrada ya usada → el sistema indica la hora del primer ingreso. **No es un
  fallo:** es exactamente lo que debe pasar. Verificar identidad antes de decidir.
- Persona sin entrada → aplicar el criterio de la organización. No improvisar en
  la puerta.
- Monitorear el aforo ocupado en tiempo real.

### Si falla la conectividad

1. Pasar a la lista impresa.
2. Marcar ingresos a mano.
3. Registrarlos en el sistema al restablecerse.
4. No detener el ingreso esperando que vuelva la red.

## Después

- [ ] Registrar asistencia real (quién confirmó y no vino)
- [ ] Respaldo final
- [ ] Exportar reportes: asistentes, ranking final, distribución por carrera
- [ ] Reunión de cierre: qué falló y qué corregir para la próxima edición
- [ ] Aplicar la política de retención de datos personales acordada

## Contactos

`[NECESITA CLARIFICACIÓN: completar antes del evento — responsable técnico de guardia, responsable de organización y responsable de puerta, con sus teléfonos.]`
