import { supabase } from "@/lib/supabase";
import { rutaArchivo } from "./archivos";

export const PUESTOS_SUGERIDOS = [
  "Conductor/a", "Mozo/a de almacén", "Carretillero/a", "Responsable de tráfico",
  "Administrativo/a", "Comercial", "Técnico/a de RRHH",
];

// Deben coincidir con los tipos y el tamaño que permite el bucket "fotos" (ver la migración base)
export const FOTO_TIPOS = ["image/jpeg", "image/png", "image/webp"];
export const FOTO_MAX_BYTES = 2 * 1024 * 1024;

export function validarFoto(f: File): string | null {
  if (!FOTO_TIPOS.includes(f.type)) return "La foto debe ser JPG, PNG o WebP.";
  if (f.size > FOTO_MAX_BYTES) return "La foto no puede pesar más de 2 MB.";
  return null;
}

// Sube la foto al bucket y guarda su ruta en la ficha. Devuelve el mensaje de error, o null si todo fue bien.
export async function subirFoto(empleadoId: string, archivo: File, anterior?: string | null): Promise<string | null> {
  const ruta = rutaArchivo(empleadoId, archivo.name);
  const { error } = await supabase.storage.from("fotos").upload(ruta, archivo, { contentType: archivo.type });
  if (error) return error.message;

  const { data, error: fallo } = await supabase.from("empleados").update({ foto_path: ruta }).eq("id", empleadoId).select("id");
  if (fallo || !data?.length) {
    await supabase.storage.from("fotos").remove([ruta]); // no dejar archivos huérfanos
    return fallo?.message ?? "No se pudo guardar la foto en la ficha.";
  }
  if (anterior) await supabase.storage.from("fotos").remove([anterior]);
  return null;
}
