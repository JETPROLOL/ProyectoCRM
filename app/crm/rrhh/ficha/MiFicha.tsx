"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Empleado } from "@/lib/tipos";
import FotoTrabajador from "./FotoTrabajador";

// Vista de un empleado normal: solo su propia ficha y en modo lectura
export default function MiFicha({ empleadoId }: { empleadoId: string | null }) {
  const [t, setT] = useState<Empleado | null | undefined>(undefined);

  useEffect(() => {
    if (!empleadoId) { setT(null); return; }
    (async () => {
      const { data } = await supabase.from("empleados").select("*").eq("id", empleadoId).maybeSingle();
      setT((data as Empleado | null) ?? null);
    })();
  }, [empleadoId]);

  if (t === undefined) return null;
  if (!t) {
    return <p className="vacio">Tu usuario todavía no está vinculado a una ficha. Pide a RRHH que cree tu ficha con tu mismo correo y vuelve a iniciar sesión.</p>;
  }

  return (
    <article className="tarjeta ficha-mia">
      <FotoTrabajador t={t} tam={96} />
      <div>
        <h2>{t.nombre}</h2>
        <p className="tenue">{t.puesto ?? "Sin puesto asignado"}</p>
        <dl>
          <dt>Correo</dt><dd>{t.email}</dd>
          <dt>Teléfono</dt><dd>{t.telefono}</dd>
          <dt>Estado</dt><dd>{t.estado === "baja" ? "Baja" : "Activo"}</dd>
        </dl>
      </div>
    </article>
  );
}
