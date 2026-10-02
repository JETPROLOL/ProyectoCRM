import { colorDe, iniciales } from "@/lib/avatar";
import { urlFoto } from "@/lib/rrhh/archivos";
import type { Empleado } from "@/lib/tipos";

// Muestra la foto del trabajador o, si no tiene, un círculo con sus iniciales
export default function FotoTrabajador({ t, tam = 56 }: { t: Pick<Empleado, "id" | "nombre" | "foto_path">; tam?: number }) {
  const url = urlFoto(t.foto_path);
  const medidas = { width: tam, height: tam, fontSize: tam * 0.36 };
  if (url) return <img className="ficha-foto" src={url} alt={`Foto de ${t.nombre}`} style={medidas} />;
  return (
    <span className="ficha-foto ficha-iniciales" style={{ ...medidas, background: colorDe(t.id) }} aria-hidden>
      {iniciales(t.nombre)}
    </span>
  );
}
