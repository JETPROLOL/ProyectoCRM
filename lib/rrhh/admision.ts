export type EstadoSolicitud = "pendiente" | "aceptada" | "denegada";

export type SolicitudAdmision = {
  id: string; created_at: string; nombre: string; apellidos: string; telefono: string; email: string;
  cv_path: string; estado: EstadoSolicitud; motivo: string | null; resuelta_por: string | null;
  resuelta_en: string | null; empleado_id: string | null;
};

// Deben coincidir con el bucket "cvs" (ver la migración base): solo PDF de hasta 5 MB
export const CV_TIPOS = ["application/pdf"];
export const CV_MAX_BYTES = 5 * 1024 * 1024;

export function validarCv(f: File): string | null {
  const esPdf = CV_TIPOS.includes(f.type) || f.name.toLowerCase().endsWith(".pdf");
  if (!esPdf) return "El currículum debe ser un archivo PDF.";
  if (f.size > CV_MAX_BYTES) return "El currículum no puede pesar más de 5 MB.";
  if (f.size === 0) return "El archivo está vacío.";
  return null;
}

export const ETIQUETA_SOLICITUD: Record<EstadoSolicitud, string> = { pendiente: "Pendiente", aceptada: "Aceptada", denegada: "Denegada" };
