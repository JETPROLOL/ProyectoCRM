// Punto de entrada del agente de ventas. Lo puede llamar:
//   · una persona del CRM, desde el botón "Preparar con IA" (cabecera Authorization: Bearer <sesión>)
//   · un Database Webhook de Supabase (cabecera x-agente-secret), para que sea automático
// Body manual:   { "accion": "presupuesto" | "factura", "id": "<uuid>" }
// Body webhook:  el JSON estándar de Supabase ({ type, table, record, old_record }).
import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "crypto";
import { prepararFactura, prepararPresupuesto, Origen, Resultado } from "@/lib/agente/ventas";

export const runtime = "nodejs";
export const maxDuration = 60;          // el modelo puede tardar unos segundos

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (cuerpo: unknown, status = 200) => Response.json(cuerpo, { status, headers: { "Cache-Control": "no-store" } });

function secretoValido(recibido: string | null): boolean {
  const esperado = process.env.AGENTE_WEBHOOK_SECRET;
  if (!esperado || esperado.length < 20 || !recibido) return false;      // sin secreto largo configurado, el webhook queda desactivado
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ¿Quién llama? Una persona con permisos de ventas (y de finanzas para facturar), o el webhook.
async function permisos(req: Request): Promise<{ origen: Origen; ventas: boolean; finanzas: boolean } | null> {
  if (secretoValido(req.headers.get("x-agente-secret"))) return { origen: "webhook", ventas: true, finanzas: true };
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await sb.rpc("mi_perfil");        // la base de datos dice qué rol tiene ese token
  if (error || !data) return null;
  return { origen: "manual", ventas: data.es_ventas === true, finanzas: data.es_finanzas === true };
}

type Tarea = { accion: "presupuesto" | "factura"; id: string } | { ignorar: string } | { error: string };

function leerTarea(body: Record<string, unknown>): Tarea {
  // Webhook de Supabase
  if (typeof body.type === "string" && typeof body.table === "string") {
    const rec = (body.record ?? {}) as Record<string, unknown>;
    const old = (body.old_record ?? {}) as Record<string, unknown>;
    if (body.table === "oportunidades" && body.type === "INSERT" && typeof rec.id === "string") return { accion: "presupuesto", id: rec.id };
    if (body.table === "presupuestos" && body.type === "UPDATE" && rec.estado === "aceptado" && old.estado !== "aceptado" && typeof rec.id === "string") {
      return { accion: "factura", id: rec.id };
    }
    return { ignorar: "Evento que no interesa al agente" };
  }
  // Llamada manual
  if ((body.accion === "presupuesto" || body.accion === "factura") && typeof body.id === "string") return { accion: body.accion, id: body.id };
  return { error: "Petición no válida" };
}

export async function POST(req: Request) {
  const quien = await permisos(req);
  if (!quien) return json({ error: "No autorizado" }, 401);

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return json({ error: "JSON no válido" }, 400);

  const tarea = leerTarea(body);
  if ("error" in tarea) return json(tarea, 400);
  if ("ignorar" in tarea) return json({ resultado: "omitida", detalle: tarea.ignorar });
  if (!UUID.test(tarea.id)) return json({ error: "Identificador no válido" }, 400);   // solo se usa el id: los datos se leen de la base de datos

  if (tarea.accion === "presupuesto" && !quien.ventas) return json({ error: "Sin permiso de ventas" }, 403);
  if (tarea.accion === "factura" && !quien.finanzas) return json({ error: "Sin permiso de finanzas" }, 403);

  try {
    const r: Resultado = tarea.accion === "presupuesto"
      ? await prepararPresupuesto(tarea.id, quien.origen)
      : await prepararFactura(tarea.id, quien.origen);
    return json(r);
  } catch (e) {
    // Fallos de infraestructura (clave caducada, sin red...): 500 para que el webhook reintente
    return json({ resultado: "error", detalle: e instanceof Error ? e.message : "Error desconocido" }, 500);
  }
}
