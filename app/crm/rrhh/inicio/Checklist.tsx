"use client";
import { FormEvent, useState } from "react";
import { CheckInicio, progreso } from "@/lib/rrhh/inicio";
import Barra from "./Barra";

type Props = {
  tareas: CheckInicio[];
  error: string;
  onAlternar: (t: CheckInicio) => void;
  onAnadir: (titulo: string) => Promise<boolean>;
  onQuitar: (t: CheckInicio) => void;
  onEstandar: () => void;
};

// Lista editable de tareas de un trabajador (vista de RRHH)
export default function Checklist({ tareas, error, onAlternar, onAnadir, onQuitar, onEstandar }: Props) {
  const [nueva, setNueva] = useState("");
  const { hechas, total } = progreso(tareas);

  async function anadir(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const titulo = nueva.trim();
    if (titulo.length < 2) return;
    if (await onAnadir(titulo)) setNueva("");
  }

  return (
    <div className="inicio-lista">
      <Barra hechas={hechas} total={total} />
      <p className="inicio-estado">{total === 0 ? "Este trabajador aún no tiene tareas." : `${hechas} de ${total} tareas hechas`}</p>

      {total === 0 ? (
        <button type="button" className="btn" onClick={onEstandar}>Añadir tareas estándar</button>
      ) : (
        <ul>
          {tareas.map((t) => (
            <li key={t.id} data-hecha={t.completada}>
              <label>
                <input type="checkbox" checked={t.completada} onChange={() => onAlternar(t)} />
                <span className="inicio-titulo">{t.titulo}</span>
              </label>
              {t.completada_en && <small>Hecha el {new Date(t.completada_en).toLocaleDateString("es-ES")}</small>}
              <button type="button" className="inicio-quitar" onClick={() => onQuitar(t)} aria-label={`Quitar la tarea ${t.titulo}`}>✕</button>
            </li>
          ))}
        </ul>
      )}

      <form className="inicio-nueva" onSubmit={anadir}>
        <input value={nueva} onChange={(e) => setNueva(e.target.value)} maxLength={120} placeholder="Añadir otra tarea" aria-label="Nueva tarea" />
        <button className="btn peq">Añadir</button>
      </form>
      <p className="aviso" role="alert" data-tipo="error">{error}</p>
    </div>
  );
}
