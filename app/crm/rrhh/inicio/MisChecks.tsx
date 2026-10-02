"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { CheckInicio, ordenar, progreso } from "@/lib/rrhh/inicio";
import Barra from "./Barra";

// Vista de un empleado normal: sus propias tareas de inicio, solo lectura
export default function MisChecks({ empleadoId }: { empleadoId: string | null }) {
  const [tareas, setTareas] = useState<CheckInicio[] | null>(null);

  useEffect(() => {
    if (!empleadoId) return;
    (async () => {
      const { data } = await supabase.from("checks_inicio").select("*").eq("empleado_id", empleadoId);
      setTareas(ordenar((data as CheckInicio[]) ?? []));
    })();
  }, [empleadoId]);

  if (!empleadoId) {
    return <p className="vacio">Tu usuario todavía no está vinculado a una ficha. Pide a RRHH que cree tu ficha con tu mismo correo y vuelve a iniciar sesión.</p>;
  }
  if (tareas === null) return null;
  if (tareas.length === 0) return <p className="vacio">RRHH aún no te ha asignado tareas de inicio.</p>;

  const { hechas, total } = progreso(tareas);
  return (
    <section className="tarjeta inicio-mias">
      <h2>Mi check de inicio</h2>
      <Barra hechas={hechas} total={total} />
      <p className="inicio-estado">{hechas === total ? "Todo hecho" : `${hechas} de ${total} tareas hechas`}</p>
      <ul>
        {tareas.map((t) => (
          <li key={t.id} data-hecha={t.completada}>
            <span role="img" aria-label={t.completada ? "Hecha" : "Pendiente"}>{t.completada ? "✅" : "⬜"}</span>
            <span className="inicio-titulo">{t.titulo}</span>
            {t.completada_en && <small>{new Date(t.completada_en).toLocaleDateString("es-ES")}</small>}
          </li>
        ))}
      </ul>
    </section>
  );
}
