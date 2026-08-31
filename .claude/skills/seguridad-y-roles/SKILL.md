---
name: seguridad-y-roles
description: Seguridad del TEDxUCB — modelo de roles y privilegio mínimo, autenticación y sesiones, verificación de identidad en el auto-registro, protección de datos personales de alumnos, auditoría y anti-fraude. Úsala siempre que trabajes con autenticación, permisos, guards, registro de usuarios, manejo de datos personales, tokens, o cualquier endpoint que exponga información de alumnos. También cuando decidas quién puede hacer qué, o cuando algo deba quedar registrado en auditoría.
---

# Seguridad y roles — TEDxUCB

## Qué hay que proteger, y de qué

Dos cosas distintas, con amenazas distintas:

1. **La integridad del ranking.** La amenaza no es un atacante externo: son
   alumnos motivados por conseguir una butaca. Cuentas duplicadas, códigos QR
   compartidos, complicidad con un miembro del staff.
2. **Los datos personales de cientos de alumnos.** Nombres, correos, teléfonos,
   carreras y documentos de identidad de personas reales, recogidos para operar
   un evento universitario.

La primera es la que suele subestimarse. Un sistema de puntos evadible no
produce un ranking discutible: produce uno ilegítimo, y con él una organización
que no puede explicar por qué alguien quedó afuera.

## Roles

| Rol | Alcance |
|---|---|
| `ADMIN` | Control total. Administra y monitorea: es un solo rol, no dos. |
| `STAFF` | Valida participación **solo en las actividades donde está asignado**. |
| `ALUMNO` | Su propio perfil, historial y progreso. Nada más. |

Un usuario puede tener varios roles a la vez: un alumno destacado puede ser staff
de una actividad sin perder su condición de alumno ni su puntaje.

## Privilegio mínimo (Artículo V)

**No existe staff con acceso global.** El permiso se verifica contra la
asignación explícita en `activity_staff`, no contra la pertenencia al rol.

```ts
// ❌ Insuficiente
@Roles('STAFF')

// ✅ Rol + asignación a esta actividad concreta
@Roles('STAFF', 'ADMIN')
@UseGuards(ActivityStaffGuard)
```

Un rol es una categoría; un permiso es una relación concreta. Confundirlos
permite que cualquier voluntario otorgue puntos en cualquier actividad, que es
exactamente el vector de fraude más cómodo.

Aplica los permisos con guards, no con comprobaciones dentro de los servicios.
Dispersas, alguien las va a olvidar en el próximo endpoint.

## Autenticación

- **Argon2id** para contraseñas. Nunca texto plano, nunca algoritmos propios.
- **Token de acceso corto** (15 minutos) + **refresh rotativo persistido y
  revocable**. Un JWT puro no se puede revocar, y aquí hace falta poder cerrar
  una sesión comprometida.
- Reutilizar un refresh ya usado revoca toda la familia de tokens de ese usuario:
  indica que alguien tiene una copia.
- Invitaciones, verificaciones y recuperaciones: **un solo uso y con
  vencimiento**. Se guarda el hash del token, no el token.

## Verificación de identidad en el auto-registro

Los alumnos se registran solos. Eso quita el control de la puerta a la
organización, y por eso existe este bloque.

- Una cuenta nueva nace **pendiente** y **no acumula puntos** hasta verificarse.
- Solo correos del dominio institucional.
- Verificación de titularidad del correo por enlace de un solo uso.
- Código de registro validado contra el padrón cuando exista.
- El administrador puede revisar, aprobar, rechazar y deshabilitar registros.
- Límite de frecuencia en el formulario público.

Ninguna de estas barreras basta sola. El correo institucional se puede prestar;
el padrón puede no existir. Documenta cuál está activa en cada momento, porque de
eso depende cuánta revisión manual hace falta.

## Tokens de QR

- Firmados con HMAC usando el secreto propio del alumno.
- **Vigencia de segundos**, rotando en pantalla.
- Verificados **en el servidor**. Nunca confíes en que el cliente diga que un
  token es válido.
- El staff escanea al alumno, no al revés: así el dispositivo que otorga puntos
  es el autenticado, y queda registro de quién validó a quién.

Una captura de pantalla compartida por WhatsApp debe llegar vencida. Esa es toda
la defensa, y por eso su prueba no es opcional.

## Datos personales

- Se recogen **solo** los necesarios para operar el evento. Cada campo extra es
  un dato más que proteger y una razón más para abandonar el registro.
- El acceso masivo al padrón está restringido a `ADMIN` y queda auditado.
- El alumno solo accede a lo suyo. Usa rutas `/me/*`, nunca `/students/:id/*`
  para consulta propia: eso invita a probar con el id de otro.
- Consentimiento explícito para el tratamiento de datos y para el uso de imagen
  en el registro fotográfico del evento.
- Deshabilitar preserva el historial; no se borran usuarios con transacciones
  asociadas, porque romperían la trazabilidad.
- Definir retención y anonimización posteriores al evento.

## Auditoría

Queda registrado, sin excepción:

- Alta, edición, deshabilitación de usuarios y cambios de rol
- Cambios en el valor en puntos de una actividad
- Ajustes, bonos, penalizaciones y reversiones
- Resolución de reclamos
- Ejecución y reversión de la asignación de cupos
- Registros manuales de asistencia

Cada entrada guarda autor, momento, entidad afectada y detalle del cambio. La
auditoría es lo que permite responder un reclamo con evidencia en lugar de con
memoria.

## Configuración

- Ningún secreto en el repositorio. Todo por variables de entorno **validadas al
  arrancar**: si falta una, la aplicación no levanta. Enterarse en producción a
  mitad del evento es peor que no levantar.
- CORS restringido a los dominios del frontend.
- Cabeceras de seguridad con Helmet.
- Límites de frecuencia **diferenciados**: el endpoint público de postulaciones
  recibe spam; el de check-in recibe picos legítimos. Son problemas distintos y
  el mismo límite no sirve para ambos.
- Subida de archivos con validación de tipo real, límite de tamaño y renombrado
  en el servidor.

## Señales de fraude a vigilar

- Un mismo dispositivo registrando muchos alumnos distintos en poco tiempo
- Proporción alta de registros manuales en una actividad concreta
- Dos cuentas con datos personales muy similares
- Puntos concentrados en actividades validadas siempre por la misma persona
- Cuentas creadas en bloque desde la misma dirección

Ninguna prueba por sí sola, pero todas merecen una mirada antes del corte.

## Antes de exponer un endpoint

- [ ] ¿Está la autorización aplicada por guard?
- [ ] ¿Verifica la relación concreta, no solo el rol?
- [ ] ¿Puede un alumno acceder a datos de otro cambiando un id?
- [ ] ¿Filtra datos personales en la respuesta o en los mensajes de error?
- [ ] ¿Queda auditado si es una acción sensible?
- [ ] ¿Tiene límite de frecuencia si es público?
