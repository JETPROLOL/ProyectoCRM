import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { leerPendientes } from "@/lib/ventas/leerFacturaProveedor";

export const runtime = "nodejs";
export const maxDuration = 60;   // la lectura con IA de varias facturas puede tardar

const igual = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

// Quién puede lanzar la lectura:
//  - un usuario del CRM con rol finanzas o admin (el CRM la llama al subir una factura), con su sesión en Authorization: Bearer
//  - un webhook de Supabase (INSERT en facturas_proveedor) con la cabecera x-agente-secret = AGENTE_WEBHOOK_SECRET (opcional)
async function autorizado(req: NextRequest) {
  const secreto = process.env.AGENTE_WEBHOOK_SECRET;
  const cabecera = req.headers.get("x-agente-secret");
  if (secreto && secreto.length >= 20 && cabecera) return igual(cabecera, secreto);

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const usuario = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user } } = await usuario.auth.getUser(token);
  if (!user) return false;
  const { data } = await usuario.rpc("es_finanzas");
  return data === true;
}

export async function POST(req: NextRequest) {
  if (!(await autorizado(req))) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    return NextResponse.json(await leerPendientes());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error leyendo las facturas" }, { status: 500 });
  }
}
