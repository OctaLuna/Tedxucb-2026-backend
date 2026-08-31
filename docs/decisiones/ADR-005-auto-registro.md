# ADR-005 — Auto-registro de alumnos con verificación

**Fecha:** 2026-08-30 · **Estado:** aceptada

## Contexto

El diseño inicial preveía que el administrador cargara el padrón de alumnos,
individualmente o por importación masiva. La organización pidió en cambio un
formulario público donde cada alumno cree su cuenta con sus datos.

## Decisión

Existe registro público autogestionado con credenciales propias del sistema, no
autenticación federada con la cuenta institucional.

Como contrapartida obligatoria, se incorpora un bloque de verificación: la cuenta
nace **pendiente** y **no acumula puntos** hasta verificarse. Restricción por
dominio institucional, verificación de titularidad del correo, y revisión por
el administrador. (La validación contra un padrón institucional quedó aquí
como condicional — "cuando exista"; se confirmó que no existe y se retiró
formalmente, ver [ADR-007](ADR-007-no-existe-padron-institucional.md).)

El staff **no** se auto-registra: es un rol de confianza que otorga puntos.

## Alternativas

**Alta exclusiva por el administrador.** Máximo control, pero un cuello de
botella importante y una barrera de entrada para los alumnos.

**Autenticación federada con Google Workspace institucional.** Resolvería la
verificación de identidad casi por completo, pero se descartó por decisión del
proyecto.

## Consecuencias

- La campaña puede arrancar en cuanto el sitio esté publicado, sin cargar
  cientos de alumnos a mano.
- **Costo, y es serio:** la organización deja de controlar quién entra al
  sistema. Como los puntos deciden butacas, aparecen dos vectores reales: una
  persona con dos correos institucionales acumulando puntos en dos cuentas, y
  alguien ajeno a la UCB compitiendo por un cupo.
- Ninguna barrera basta sola. El correo se puede prestar; el padrón puede no
  existir. La combinación es lo que sostiene la legitimidad.
- Esta decisión cerró un marcador de clarificación y **abrió seis nuevos**
  (RF-122 a RF-128).

## Requisitos

RF-104, RF-104a, RF-109, RF-122 a RF-128.
