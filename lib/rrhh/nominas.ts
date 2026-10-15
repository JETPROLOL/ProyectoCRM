export type Nomina = {
  id: string; created_at: string; empleado_id: string; periodo: string; archivo_path: string; nombre_archivo: string;
  firmada: boolean; firmada_en: string | null; firmada_por: string | null; firma_nombre: string | null;
};

export const NOMINA_TIPOS = ["application/pdf"];
export const NOMINA_MAX_BYTES = 5 * 1024 * 1024; // mismo límite que el bucket "nominas"

export function validarNomina(f: File): string | null {
  const esPdf = NOMINA_TIPOS.includes(f.type) || f.name.toLowerCase().endsWith(".pdf");
  if (!esPdf) return "La nómina debe ser un archivo PDF.";
  if (f.size > NOMINA_MAX_BYTES) return "La nómina no puede pesar más de 5 MB.";
  if (f.size === 0) return "El archivo está vacío.";
  return null;
}

// "2026-09-01" -> "septiembre de 2026"
export function etiquetaPeriodo(iso: string) {
  const [a, m] = iso.split("-").map(Number);
  return new Date(a, m - 1, 1).toLocaleDateString("es-ES", { month: "long", year: "numeric" });
}

// Compara nombres sin tener en cuenta mayúsculas, tildes ni espacios repetidos
export const normalizar = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
