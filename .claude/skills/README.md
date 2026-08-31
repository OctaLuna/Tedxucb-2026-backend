# Skills del proyecto TEDxUCB

Skills escritas exclusivamente para este proyecto. Codifican las decisiones y
los invariantes que ya se tomaron, para no volver a discutirlos en cada tarea.

| Skill | Cárgala cuando |
|---|---|
| [`spec-workflow`](spec-workflow/SKILL.md) | Crees o modifiques specs, planes, contratos o tareas |
| [`motor-de-puntos`](motor-de-puntos/SKILL.md) | Toques puntos, check-in, ledger, reclamos o ranking |
| [`modulo-backend`](modulo-backend/SKILL.md) | Crees módulos NestJS, servicios o migraciones Prisma |
| [`contratos-api`](contratos-api/SKILL.md) | Definas o cambies endpoints |
| [`pruebas`](pruebas/SKILL.md) | Escribas o revises cualquier prueba |
| [`seguridad-y-roles`](seguridad-y-roles/SKILL.md) | Trabajes con permisos, auth o datos personales |

## Cuál cargar

`motor-de-puntos` es la más importante. Si el cambio roza los puntos aunque sea
de lejos, cárgala: un error ahí decide injustamente quién entra al evento.

Varias pueden aplicar a la vez. Un endpoint nuevo de check-in toca las cuatro:
`contratos-api` para definirlo, `motor-de-puntos` para los invariantes,
`modulo-backend` para implementarlo y `pruebas` para validarlo.

## Estructura

```
.claude/skills/
├── spec-workflow/SKILL.md
├── motor-de-puntos/
│   ├── SKILL.md
│   └── references/invariantes.md      Checklist de revisión
├── modulo-backend/SKILL.md
├── contratos-api/
│   ├── SKILL.md
│   └── references/codigos-de-error.md Catálogo único de códigos
├── pruebas/SKILL.md
└── seguridad-y-roles/SKILL.md
```

Las skills tienen frontmatter con `name` y `description`. La descripción es lo
que determina cuándo se activan, así que está redactada de forma deliberadamente
insistente: el problema habitual no es que una skill se active de más, sino que
no se active cuando hacía falta.

## Mantenerlas vivas

Una skill que contradice la spec es peor que no tenerla. Cuando cambie una
decisión:

1. Actualiza el spec (fuente de verdad).
2. Actualiza la skill que la refleja.
3. Registra la decisión en `docs/decisiones/`.

Al añadir un código de error nuevo, agrégalo a
`contratos-api/references/codigos-de-error.md` en el mismo commit. Dos códigos
para la misma situación obligan al frontend a manejar ambos para siempre.
