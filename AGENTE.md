# Agente de IA en Ventas

## Qué hace
| Cuándo | Qué hace el agente | Qué NO hace |
|---|---|---|
| Entra una **oportunidad** (formulario web) | Lee el mensaje, identifica la empresa y los servicios del catálogo y deja un **presupuesto en borrador** | No lo envía, no pone precios ni descuentos propios |
| Un presupuesto pasa a **aceptado** | Crea el **borrador de factura** (sin IA, es una regla) | No la emite, no la anula, no registra cobros |
| Algo es dudoso (empresa desconocida, servicio que no existe, cantidad rara, faltan datos fiscales) | Lo deja anotado en `agente_acciones` y avisa | No adivina |

Siempre hay una persona que revisa el borrador y lo envía/emite.

## Piezas
- `supabase/migrations/20261026_A_agente_ventas.sql` · tabla de registro `agente_acciones` (auditoría + anti-duplicados).
- `lib/agente/ventas.ts` · la lógica del agente (solo servidor).
- `app/api/agente/ventas/route.ts` · la puerta de entrada (botón y webhook).
- `app/crm/page.tsx` · botón **Preparar con IA** en cada oportunidad.

## Puesta en marcha
1. **SQL**: ejecuta la migración en Supabase > SQL Editor.
2. **Usuarios del agente**: crea dos usuarios en Authentication > Users (con "Auto Confirm User") y asígnales rol con el SQL del final de la migración (`ventas` y `finanzas`). No uses `admin`.
3. **Variables de entorno**: copia lo de `.env.example` a `.env.local` y a Vercel (Settings > Environment Variables). Reinicia `npm run dev`.
4. **Prueba manual** (no necesita webhook): entra al CRM, abre Oportunidades y pulsa **Preparar con IA** en una oportunidad cuya empresa exista en Empresas. Debe abrirse el presupuesto en borrador.
5. **Modo automático** (opcional, requiere la web desplegada en una URL pública): en Supabase > Database > Webhooks crea dos:
   - `oportunidades` · evento **Insert** · método POST · URL `https://TU-DOMINIO/api/agente/ventas` · cabecera `x-agente-secret: <el mismo valor de AGENTE_WEBHOOK_SECRET>`.
   - `presupuestos` · evento **Update** · mismos URL y cabecera. El agente solo actúa cuando el estado pasa a `aceptado`.

## Seguridad (por qué es razonable fiarse)
- El agente es un usuario con rol mínimo, no usa `service_role`: las políticas RLS y las funciones SQL lo limitan igual que a una persona.
- El modelo solo elige empresa, servicio y cantidad. Los **precios e IVA salen del catálogo**, validado en el servidor.
- El texto del formulario web es no fiable (puede traer "ignora tus reglas..."): se trata como dato y, en el peor caso, genera un borrador que una persona ve.
- El webhook se autentica con secreto largo; solo se usa el `id` del evento y los datos se leen de la base de datos.
- `agente_acciones` no se puede borrar ni editar una vez cerrada, y evita duplicados aunque el webhook reintente.
- Pon un **límite de gasto** en OpenRouter por si alguien llena el formulario de basura.

## Si algo falla
| Síntoma | Causa probable |
|---|---|
| "El agente de ventas no pudo iniciar sesión" | Email/contraseña mal en `.env.local`, o usuario sin confirmar |
| "Sin permiso de ventas" (403) | El usuario del navegador no tiene rol ventas |
| `revision`: "No hay ninguna empresa..." | La empresa no está en Empresas, o el nombre es muy distinto |
| `revision`: "El servicio ... no está en el catálogo" | Falta ese servicio en Ventas > Servicios |
| El modelo no responde / 401 / 404 | `OPENROUTER_API_KEY` o `AGENTE_MODELO` incorrectos, o sin crédito |
| Webhook sin efecto | URL no pública, cabecera `x-agente-secret` distinta, o ver Database > Webhooks > Logs |
