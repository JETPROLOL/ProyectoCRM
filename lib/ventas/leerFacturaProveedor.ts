// SOLO SERVIDOR. Agente de IA que lee los PDF de las facturas de proveedor (las que tenemos que pagar) y guarda sus datos
// en public.facturas_proveedor. Es la versión integrada en el CRM del agente de Automatizacion_empresa/facturas/agente.py:
// misma cola (estado pendiente_lectura → leyendo → por_pagar / revisar / error_lectura) y mismo cerrojo atómico, así que
// ambos pueden convivir sin leer dos veces la misma factura.
//
// Variables de entorno (nunca con NEXT_PUBLIC_, no deben llegar al navegador):
//   SUPABASE_SERVICE_ROLE_KEY   clave secreta de Supabase (sb_secret_... o service_role)
//   OPENROUTER_API_KEY          clave de OpenRouter
//   AGENTE_FACTURAS_MODELO      modelo con lectura de PDF/imagen (p. ej. anthropic/claude-sonnet-4.5); si falta se usa AGENTE_MODELO
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "facturas-proveedor";
const MINUTOS_ATASCADA = 10;   // una factura "leyendo" más tiempo que esto vuelve a la cola (p. ej. si el servidor se cayó)
const POR_LLAMADA = 5;         // máximo de facturas por llamada: cabe en el tiempo de una función de servidor

export function clienteAdmin(): SupabaseClient {
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!clave) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, clave, { auth: { persistSession: false, autoRefreshToken: false } });
}

const PROMPT = `Eres un asistente de administración.
Lee la factura que te paso (PDF).
Es una factura que NOS ENVÍA un proveedor: el proveedor es quien la emite, no nosotros.
Saca: número, fecha, proveedor, NIF del proveedor, base imponible, IVA (importe en euros, no el porcentaje) y total.
La fecha en formato AAAA-MM-DD. Los importes como números con punto decimal (145.2).
Si un dato no aparece, déjalo vacío (null).
No inventes nada.
Cuando lo tengas, llama a guardar_factura.`;

const HERRAMIENTA = {
  type: "function",
  function: {
    name: "guardar_factura",
    description: "Guarda los datos leídos de una factura de proveedor.",
    parameters: {
      type: "object",
      properties: {
        numero: { type: ["string", "null"], description: "Número de factura" },
        fecha: { type: ["string", "null"], description: "Fecha de la factura, AAAA-MM-DD" },
        proveedor: { type: ["string", "null"], description: "Nombre o razón social del proveedor que emite la factura" },
        nif: { type: ["string", "null"], description: "NIF/CIF del proveedor" },
        base: { type: ["number", "null"], description: "Base imponible en euros" },
        iva: { type: ["number", "null"], description: "Importe del IVA en euros" },
        total: { type: ["number", "null"], description: "Total de la factura en euros" },
      },
      required: ["numero", "fecha", "proveedor", "nif", "base", "iva", "total"],
    },
  },
} as const;

type Datos = { numero?: unknown; fecha?: unknown; proveedor?: unknown; nif?: unknown; base?: unknown; iva?: unknown; total?: unknown };

// Mismo criterio que validacion.py: hay proveedor e importes, y base + IVA = total con un céntimo de margen
export function validar(proveedor: string | null, base: number | null, iva: number | null, total: number | null) {
  if (!proveedor || base === null || iva === null || total === null) return false;
  return Math.abs(base + iva - total) <= 0.01;
}

const texto = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const importe = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
function fechaValida(v: unknown) {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return null;
  const f = v.trim();
  const d = new Date(`${f}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === f ? f : null;   // descarta 2026-02-30
}

async function leerConIA(pdf: Uint8Array, nombre: string): Promise<Datos> {
  const modelo = process.env.AGENTE_FACTURAS_MODELO || process.env.AGENTE_MODELO;
  if (!process.env.OPENROUTER_API_KEY || !modelo) throw new Error("Faltan OPENROUTER_API_KEY o AGENTE_FACTURAS_MODELO en el servidor.");
  const respuesta = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: modelo,
      max_tokens: 1000,
      messages: [
        { role: "system", content: PROMPT },
        { role: "user", content: [
          { type: "text", text: "Aquí tienes la factura." },
          { type: "file", file: { filename: nombre.replace(/[^\w. -]/g, "_") || "factura.pdf", file_data: `data:application/pdf;base64,${Buffer.from(pdf).toString("base64")}` } },
        ] },
      ],
      tools: [HERRAMIENTA],
      tool_choice: { type: "function", function: { name: "guardar_factura" } },
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!respuesta.ok) throw new Error(`OpenRouter respondió ${respuesta.status}: ${(await respuesta.text()).slice(0, 200)}`);
  const json = await respuesta.json();
  const args = json?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("El modelo no devolvió datos de factura.");
  return JSON.parse(args) as Datos;
}

type Fila = { id: string; archivo_path: string; nombre_archivo: string };

async function procesar(admin: SupabaseClient, fila: Fila) {
  try {
    const { data: blob, error } = await admin.storage.from(BUCKET).download(fila.archivo_path);
    if (error || !blob) throw new Error(`No se pudo descargar el PDF. ${error?.message ?? ""}`);
    const d = await leerConIA(new Uint8Array(await blob.arrayBuffer()), fila.nombre_archivo);
    const proveedor = texto(d.proveedor, 200), base = importe(d.base), iva = importe(d.iva), total = importe(d.total);
    const correcta = validar(proveedor, base, iva, total);   // "correcta" la calcula nuestro código, no el modelo
    const { error: e2 } = await admin.from("facturas_proveedor").update({
      numero: texto(d.numero, 80), fecha: fechaValida(d.fecha), proveedor, nif: texto(d.nif, 30), base, iva, total, correcta,
      estado: correcta ? "por_pagar" : "revisar", leida_en: new Date().toISOString(), error_lectura: null,
    }).eq("id", fila.id);
    if (e2) throw new Error(`No se pudieron guardar los datos. ${e2.message}`);
    return { id: fila.id, estado: correcta ? "por_pagar" : "revisar" };
  } catch (e) {
    const motivo = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    await admin.from("facturas_proveedor").update({ estado: "error_lectura", error_lectura: motivo }).eq("id", fila.id);
    return { id: fila.id, estado: "error_lectura", error: motivo };
  }
}

// Lee las facturas pendientes (hasta POR_LLAMADA). Devuelve cuántas quedan por leer para que quien llame pueda insistir.
export async function leerPendientes() {
  const admin = clienteAdmin();

  const limite = new Date(Date.now() - MINUTOS_ATASCADA * 60_000).toISOString();
  await admin.from("facturas_proveedor").update({ estado: "pendiente_lectura", lectura_iniciada_en: null })
    .eq("estado", "leyendo").lt("lectura_iniciada_en", limite);

  const { data: pendientes, error } = await admin.from("facturas_proveedor").select("id, archivo_path, nombre_archivo")
    .eq("estado", "pendiente_lectura").order("created_at").limit(POR_LLAMADA);
  if (error) throw new Error(error.message);

  // Cerrojo: solo se queda con la factura quien consiga pasarla de pendiente_lectura a leyendo
  const mias: Fila[] = [];
  for (const p of (pendientes ?? []) as Fila[]) {
    const { data } = await admin.from("facturas_proveedor").update({ estado: "leyendo", lectura_iniciada_en: new Date().toISOString() })
      .eq("id", p.id).eq("estado", "pendiente_lectura").select("id");
    if (data?.length) mias.push(p);
  }

  const resultados = await Promise.all(mias.map((f) => procesar(admin, f)));
  const { count } = await admin.from("facturas_proveedor").select("id", { count: "exact", head: true }).eq("estado", "pendiente_lectura");
  return { leidas: resultados.length, restantes: count ?? 0, resultados };
}
