// Tipos y cálculos de presupuestos. Los totales definitivos los calcula Postgres (recalcular_presupuesto);
// aquí se repite la misma aritmética, en céntimos enteros, para mostrar los totales mientras se edita.
import type { Unidad } from "./base";

export const ESTADOS_PRESUPUESTO = ["borrador", "enviado", "aceptado", "rechazado", "caducado"] as const;
export type EstadoPresupuesto = (typeof ESTADOS_PRESUPUESTO)[number];

export const ETIQUETA_ESTADO: Record<EstadoPresupuesto, string> = {
  borrador: "Borrador", enviado: "Enviado", aceptado: "Aceptado", rechazado: "Rechazado", caducado: "Caducado",
};

export type Presupuesto = {
  id: string; created_at: string; updated_at: string; numero: string;
  empresa_id: string; oportunidad_id: string | null; vendedor_id: string | null;
  estado: EstadoPresupuesto; fecha: string; validez_hasta: string; notas: string | null;
  base_imponible: number; iva_total: number; total: number;
  enviado_en: string | null; resuelto_en: string | null;
};

export type Linea = {
  clave: string;                       // identificador local para React (no se guarda)
  servicio_id: string | null; descripcion: string; cantidad: number; unidad: Unidad;
  precio_unitario: number; descuento_pct: number; tipo_iva: number;
};

// Importe en céntimos. Con BigInt no se pierde precisión: cantidad × precio × (1 − descuento) / 1.000.000 de las centésimas
const cent = (n: number) => BigInt(Math.round((Number.isFinite(n) ? n : 0) * 100));

export function baseLinea(l: Pick<Linea, "cantidad" | "precio_unitario" | "descuento_pct">): number {
  const num = cent(l.cantidad) * cent(l.precio_unitario) * (BigInt(10000) - cent(l.descuento_pct));
  return Number((num + BigInt(500000)) / BigInt(1000000));       // redondeo "half up" a céntimos, como round() de Postgres
}

export type Totales = {
  desglose: { tipo: number; base: number; iva: number }[];       // importes en euros
  base: number; iva: number; total: number;
};

// El IVA se calcula sobre la suma de bases de cada tipo (no línea a línea), igual que en la base de datos
export function totales(lineas: Pick<Linea, "cantidad" | "precio_unitario" | "descuento_pct" | "tipo_iva">[]): Totales {
  const porTipo = new Map<number, number>();
  for (const l of lineas) porTipo.set(l.tipo_iva, (porTipo.get(l.tipo_iva) ?? 0) + baseLinea(l));
  const desglose = [...porTipo.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([tipo, base]) => ({ tipo, base: base / 100, iva: Math.floor((base * tipo + 50) / 100) / 100 }));
  const base = desglose.reduce((s, d) => s + Math.round(d.base * 100), 0);
  const iva = desglose.reduce((s, d) => s + Math.round(d.iva * 100), 0);
  return { desglose, base: base / 100, iva: iva / 100, total: (base + iva) / 100 };
}

export const lineaVacia = (): Linea => ({
  clave: crypto.randomUUID(), servicio_id: null, descripcion: "", cantidad: 1, unidad: "servicio",
  precio_unitario: 0, descuento_pct: 0, tipo_iva: 21,
});

// "2026-10-24" → "24/10/2026" (sin pasar por zonas horarias)
export const fechaCorta = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
export const hoyISO = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
export const sumarDias = (iso: string, dias: number) => {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

// Mensaje legible para el usuario a partir de un error de Supabase (los RAISE de nuestras funciones ya van en castellano)
export const mensajeError = (e: { message: string; code?: string }) =>
  e.code === "P0001" ? e.message : `No se pudo completar la operación. ${e.message}`;
