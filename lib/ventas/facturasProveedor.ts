// Facturas de proveedor: las que tenemos que PAGAR nosotros (PDF que sube finanzas; lo lee el agente de IA).
// Son independientes de las facturas que emitimos (lib/ventas/facturas.ts).

export type EstadoProveedor = "pendiente_lectura" | "leyendo" | "por_pagar" | "revisar" | "error_lectura" | "pagada";

export type FacturaProveedor = {
  id: string; created_at: string; updated_at: string;
  archivo_path: string; nombre_archivo: string; hash_archivo: string;
  estado: EstadoProveedor; error_lectura: string | null; leida_en: string | null;
  numero: string | null; fecha: string | null; proveedor: string | null; nif: string | null;
  base: number | null; iva: number | null; total: number | null; correcta: boolean | null;
  pagada_en: string | null;
};

export const ETIQUETA_PROVEEDOR: Record<EstadoProveedor, string> = {
  pendiente_lectura: "Pendiente de lectura", leyendo: "Leyendo…", por_pagar: "Por pagar",
  revisar: "Revisar datos", error_lectura: "Error de lectura", pagada: "Pagada",
};

// Se reutilizan los colores de los estados de las facturas emitidas (crm.css): azul = por pagar, ámbar = revisar,
// rojo = error, verde = pagada y borde discontinuo = aún sin datos.
export const ESTILO_PROVEEDOR: Record<EstadoProveedor, string> = {
  pendiente_lectura: "borrador", leyendo: "borrador", por_pagar: "emitida",
  revisar: "parcial", error_lectura: "vencida", pagada: "pagada",
};

export const FILTROS_PROVEEDOR: ("todos" | EstadoProveedor)[] =
  ["todos", "pendiente_lectura", "por_pagar", "revisar", "error_lectura", "pagada"];

// El agente aún no ha terminado con ellas: la lista se refresca sola mientras haya alguna
export const enLectura = (e: EstadoProveedor) => e === "pendiente_lectura" || e === "leyendo";

export const FACTURA_MAX_BYTES = 10 * 1024 * 1024; // mismo límite que el bucket "facturas-proveedor"

// Comprueba tipo, tamaño y que el contenido sea de verdad un PDF (empieza por "%PDF-")
export async function validarFacturaPdf(f: File): Promise<string | null> {
  if (!f.name.toLowerCase().endsWith(".pdf")) return `«${f.name}» no es un PDF.`;
  if (f.size === 0) return `«${f.name}» está vacío.`;
  if (f.size > FACTURA_MAX_BYTES) return `«${f.name}» pesa más de 10 MB.`;
  const cabecera = new TextDecoder().decode(await f.slice(0, 5).arrayBuffer());
  if (cabecera !== "%PDF-") return `«${f.name}» no parece un PDF válido.`;
  return null;
}

// Huella SHA-256 del archivo: así no se puede subir dos veces el mismo PDF
export async function hashArchivo(f: File): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", await f.arrayBuffer());
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

// Clave para detectar la misma factura leída dos veces (mismo NIF y mismo número), aunque sean PDFs distintos
export const claveDuplicada = (f: Pick<FacturaProveedor, "nif" | "numero">) =>
  f.nif && f.numero ? `${f.nif.replace(/[\s.-]/g, "").toUpperCase()}|${f.numero.trim().toUpperCase()}` : null;
