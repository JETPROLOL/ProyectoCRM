"use client";
import { usePerfil } from "../PerfilContext";

// TEMPORAL: cada responsable lo sustituye por su sección real
export default function Pendiente({ titulo, persona, pasos }: { titulo: string; persona: string; pasos: string[] }) {
  const p = usePerfil();
  const rol = p.cargando ? "cargando" : p.es_rrhh ? "RRHH" : "empleado";
  return (
    <section className="pendiente">
      <h2>{titulo}</h2>
      <p>Sección pendiente. Responsable: persona {persona}.</p>
      <ul>{pasos.map((s) => <li key={s}>{s}</li>)}</ul>
      <p className="sesion">
        Tu sesión: rol {rol}, {p.empleado_id ? "vinculada a una ficha de empleado" : "sin ficha de empleado vinculada"}.
      </p>
    </section>
  );
}
