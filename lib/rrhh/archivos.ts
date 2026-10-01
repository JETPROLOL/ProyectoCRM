import { supabase } from "@/lib/supabase";

export type BucketPrivado = "cvs" | "nominas";

// Las fotos están en un bucket público: se guarda la ruta en empleados.foto_path y se construye la URL
export function urlFoto(path: string | null | undefined) {
  if (!path) return null;
  return supabase.storage.from("fotos").getPublicUrl(path).data.publicUrl;
}

// Los CVs y nóminas son privados: se descargan con un enlace temporal (5 min por defecto)
export async function urlFirmada(bucket: BucketPrivado, path: string, segundos = 300) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, segundos);
  return error ? null : data.signedUrl;
}

// Ruta de subida: <carpeta>/<marca de tiempo>-<nombre limpio>. Para nóminas y fotos, carpeta = id del empleado
export function rutaArchivo(carpeta: string, nombre: string) {
  return `${carpeta}/${Date.now()}-${nombre.replace(/[^\w.\-]+/g, "_")}`;
}
