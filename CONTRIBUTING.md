# Guía de trabajo en equipo (RRHH)

## Reparto
- **A**: Ficha, Check de inicio, Admisión/contratación (`app/crm/rrhh/{ficha,inicio,admision}`)
- **B**: Horarios: fichajes y vacaciones (`app/crm/rrhh/horarios`)
- **C**: Evaluaciones y Archivos/nóminas (`app/crm/rrhh/{evaluaciones,archivos}`)

## Git
- Una rama por función: `feature/rrhh-<seccion>`. Nadie hace push directo a `main`.
- Pull request con al menos una revisión de otra persona. Vercel crea un despliegue de prueba por PR.

## Para no pisarnos
- Cada uno trabaja solo en su carpeta de `app/crm/rrhh/`.
- Estilos: un `.css` propio por sección, con clases prefijadas (`.fichaje-...`). No tocar `globals.css`.
- Tipos: en `lib/rrhh/<seccion>.ts`, no en `lib/tipos.ts`.
- SQL: un archivo por cambio en `supabase/migrations/` con nombre `AAAAMMDD_persona_descripcion.sql`. Avisar por el chat antes de ejecutarlo en Supabase.

## Piezas comunes (no reinventar)
- `usePerfil()` (`app/crm/PerfilContext.tsx`): devuelve `es_rrhh` y `empleado_id` del usuario logueado.
- `<SoloRrhh>` (`app/crm/rrhh/SoloRrhh.tsx`): oculta una sección a quien no sea RRHH. Es solo cosmética.
- En SQL, las políticas RLS de tablas sensibles se escriben con `public.es_rrhh()` y `public.mi_empleado_id()`.
  Ejemplo: un empleado solo ve lo suyo → `using (empleado_id = public.mi_empleado_id() or public.es_rrhh())`.
- Archivos (`lib/rrhh/archivos.ts`): buckets `fotos` (público), `cvs` y `nominas` (privados, solo PDF).
  Nóminas: ruta `<empleado_id>/<archivo>.pdf`. Descarga con `urlFirmada()`.
- La ficha del trabajador es la tabla `empleados`. Todas las tablas de RRHH la referencian con `empleado_id`.

## Seguridad
- La interfaz oculta cosas, pero **la seguridad real son las políticas RLS**: toda tabla nueva lleva `enable row level security` y sus políticas.
- Los registros públicos de usuarios deben estar desactivados en Supabase (Authentication).
