// Tipos y utilidades de facturación. Las reglas de verdad (numeración, inmutabilidad, cobros) viven en Postgres;
// aquí solo se presentan los datos y se anticipan los avisos.
import { hoyISO } from "./presupuestos";

export const FORMAS_PAGO = ["transferencia", "domiciliación", "tarjeta", "efectivo"] as const;
export const METODOS_COBRO = [...FORMAS_PAGO, "otro"] as const;

export type EstadoFactura = "borrador" | "emitida" | "pagada" | "anulada";
export type Factura = {
  id: string; created_at: string; updated_at: string; numero: string | null;
  tipo: "ordinaria" | "rectificativa"; estado: EstadoFactura;
  empresa_id: string; presupuesto_id: string | null; rectifica_id: string | null; motivo: string | null;
  fecha_emision: string | null; dias_pago: number; fecha_vencimiento: string | null;
  forma_pago: (typeof FORMAS_PAGO)[number]; notas: string | null;
  base_imponible: number; iva_total: number; total: number; pagado: number;
  cliente_nombre: string | null; cliente_nif: string | null; cliente_direccion: string | null; cliente_email: string | null;
  emisor_nombre: string | null; emisor_nif: string | null; emisor_direccion: string | null; emisor_email: string | null;
  emisor_iban: string | null; emisor_pie: string | null;
  emitida_en: string | null; pagada_en: string | null;
};
export type Pago = {
  id: string; created_at: string; factura_id: string; fecha: string; importe: number;
  metodo: (typeof METODOS_COBRO)[number]; referencia: string | null;
};
export type DatosEmisor = {
  razon_social: string | null; nif: string | null; direccion: string | null; codigo_postal: string | null;
  ciudad: string | null; pais: string; email: string | null; telefono: string | null; iban: string | null; texto_pie: string | null;
};

// Lo que ve el usuario: añade "vencida" y "cobro parcial", que se deducen de las fechas y de lo cobrado
export type EstadoVisible = "borrador" | "emitida" | "parcial" | "vencida" | "pagada" | "anulada" | "rectificativa";
export const ETIQUETA_FACTURA: Record<EstadoVisible, string> = {
  borrador: "Borrador", emitida: "Emitida", parcial: "Cobro parcial", vencida: "Vencida",
  pagada: "Pagada", anulada: "Anulada", rectificativa: "Rectificativa",
};

type Base = Pick<Factura, "tipo" | "estado" | "total" | "pagado" | "fecha_vencimiento">;

export function estadoVisible(f: Base, hoy: string = hoyISO()): EstadoVisible {
  if (f.tipo === "rectificativa") return "rectificativa";
  if (f.estado !== "emitida") return f.estado;
  if (f.fecha_vencimiento && f.fecha_vencimiento < hoy) return "vencida";
  return f.pagado > 0 ? "parcial" : "emitida";
}

// Pendiente de cobro, en euros (solo facturas ordinarias emitidas)
export const pendiente = (f: Base) =>
  f.tipo === "ordinaria" && f.estado === "emitida" ? Math.round((f.total - f.pagado) * 100) / 100 : 0;

// Días desde hoy hasta una fecha ISO (negativo si ya pasó)
export const diasHasta = (iso: string, hoy: string = hoyISO()) =>
  Math.round((Date.parse(iso + "T12:00:00Z") - Date.parse(hoy + "T12:00:00Z")) / 86400000);

// Datos que faltan en la empresa emisora para poder emitir facturas
export const faltaEmisor = (e: Partial<DatosEmisor> | null) => {
  const f: string[] = [];
  if (!e?.razon_social?.trim()) f.push("razón social");
  if (!e?.nif?.trim()) f.push("NIF");
  if (!e?.direccion?.trim() || !e?.codigo_postal || !e?.ciudad) f.push("dirección");
  return f;
};

// Estado de la cartera de cobro (en euros): lo cobrado y lo pendiente, separando lo ya vencido
export function cartera(filas: Base[], hoy: string = hoyISO()) {
  let pend = 0, venc = 0, cobrado = 0;
  for (const f of filas) {
    const p = Math.round(pendiente(f) * 100);
    pend += p;
    if (f.fecha_vencimiento && f.fecha_vencimiento < hoy) venc += p;
    if (f.tipo === "ordinaria" && f.estado !== "anulada") cobrado += Math.round(f.pagado * 100);
  }
  return { pendiente: pend / 100, vencido: venc / 100, enPlazo: (pend - venc) / 100, cobrado: cobrado / 100 };
}
