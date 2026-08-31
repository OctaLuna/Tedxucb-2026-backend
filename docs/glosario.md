# Glosario

Términos del dominio con el significado que tienen **en este proyecto**. Cuando
un término se usa de forma distinta a la habitual, se explica por qué.

| Término | Significado |
|---|---|
| **Actividad** | Evento previo al TEDxUCB (taller, conferencia, feria, voluntariado) que otorga puntos a quien participa. |
| **Aforo** | Capacidad total del auditorio. Configurable; la estimación actual es 100 personas, 80 de ellas alumnos. |
| **Asignación de cupos** | Proceso explícito, disparado por el administrador, que congela el ranking y determina quiénes asisten. Nunca es un cálculo en vivo. |
| **Caché de puntaje** | `total_points` en el perfil del alumno. Valor derivado, **no** fuente de verdad. Reconstruible desde el libro mayor. |
| **Check-in** | Registro validado de que un alumno participó en una actividad. Otorga los puntos en la misma operación. |
| **Corte** | Momento en que se congela el ranking para asignar cupos. |
| **Crew / Staff** | Persona autorizada a validar participación, **solo en las actividades donde está asignada**. |
| **Cupo (seat)** | Lugar del evento asignado a una persona concreta, con su propio ciclo de estados. |
| **Entrada (ticket)** | Credencial única de acceso al evento. De un solo uso. |
| **Idempotencia** | Que repetir una operación no produzca un segundo efecto. Central aquí: la red del campus falla y el staff reintenta. |
| **Invariante** | Condición que debe ser verdadera siempre. Ej.: el puntaje es la suma del libro mayor. |
| **Libro mayor (ledger)** | `point_transactions`. Tabla de solo inserción con todos los movimientos de puntos. **Única fuente de verdad del puntaje.** |
| **Lista de espera** | Alumnos ordenados que acceden si alguien libera su cupo. |
| **Marcador de clarificación** | `[NECESITA CLARIFICACIÓN: …]` en un spec. Señala una decisión pendiente, no una duda menor. |
| **Movimiento / Transacción de puntos** | Unidad del libro mayor. Positivo o negativo, con tipo, motivo y autor. |
| **Padrón** | Listado institucional de alumnos habilitados. Se usa para validar registros. |
| **Postulación de speaker** | Expresión de interés recibida por el formulario público. |
| **Reclamo** | Solicitud de un alumno para revisar una participación no acreditada. |
| **Reconciliación** | Verificación de que la caché coincide con la suma del libro mayor. Diaria. |
| **Reversión** | Movimiento que anula otro sin borrarlo. La única forma de corregir puntos. |
| **Snapshot / Fotografía del corte** | Puntaje y posición congelados al asignar cupos. La evidencia que justifica cada decisión. |
| **Ventana de check-in** | Franja horaria en que se admite registrar participación en una actividad. |

## Términos que evitamos

- **"Borrar puntos"** — no existe. Se revierten. La distinción es el Artículo IV.
- **"Corregir el puntaje"** — sugiere editar. Se registra una corrección.
- **"Admin y coordinador"** — es un solo rol (ADR-001).
