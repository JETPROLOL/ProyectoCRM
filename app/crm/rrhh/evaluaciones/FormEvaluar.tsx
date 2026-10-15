"use client";
import { FormEvent, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Evaluacion } from "@/lib/rrhh/evaluaciones";
import { Estrellas, SelectorNota } from "./Estrellas";

// Contenido de la ventana de evaluación de un empleado
export default function FormEvaluar({ evaluadoId, mia, editable, deRrhh, nombres, onGuardado }: {
  evaluadoId: string;
  mia: Evaluacion | undefined;          // la nota que yo ya di en este trimestre
  editable: boolean;                    // solo se puede evaluar en el trimestre en curso
  deRrhh: Evaluacion[] | null;          // RRHH: todas las evaluaciones de este empleado en el trimestre
  nombres: Map<string, string>;         // user_id -> nombre del evaluador
  onGuardado: () => void;
}) {
  const [puntos, setPuntos] = useState(mia?.puntuacion ?? 0);
  const [comentario, setComentario] = useState(mia?.comentario ?? "");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!puntos) return setError("Elige una nota de 1 a 5.");
    setEnviando(true);
    setError("");
    const { error: fallo } = await supabase.rpc("evaluar", { p_evaluado: evaluadoId, p_puntuacion: puntos, p_comentario: comentario.trim() || null });
    setEnviando(false);
    if (fallo) return setError(fallo.message);
    onGuardado();
  }

  return (
    <>
      <form className="form plano" onSubmit={guardar}>
        {!editable && <p className="aviso" data-tipo="error">Este trimestre ya está cerrado: solo puedes consultarlo.</p>}
        <div>
          <p className="eval-etiqueta">Tu nota</p>
          <SelectorNota valor={puntos} onCambio={setPuntos} deshabilitado={!editable} />
        </div>
        <label>Comentario (opcional)
          <textarea rows={3} maxLength={1000} value={comentario} disabled={!editable} onChange={(e) => setComentario(e.target.value)}
            placeholder="¿Qué ha ido bien? ¿Qué podría mejorar?" />
        </label>
        {editable && (
          <button className="btn" disabled={enviando}>{enviando ? "Guardando…" : mia ? "Actualizar evaluación" : "Guardar evaluación"}</button>
        )}
        <p className="aviso" role="alert" data-tipo="error">{error}</p>
        {editable && <p className="eval-ayuda">Solo RRHH puede ver tu comentario. Puedes cambiar tu nota mientras dure el trimestre.</p>}
      </form>

      {deRrhh && (
        <section className="eval-rrhh">
          <h3>Evaluaciones recibidas ({deRrhh.length})</h3>
          {deRrhh.length === 0 && <p className="tenue">Nadie ha evaluado todavía a este empleado en este trimestre.</p>}
          <ul>
            {deRrhh.map((ev) => (
              <li key={ev.id}>
                <div className="eval-rrhh-cab">
                  <b>{nombres.get(ev.evaluador_user_id) ?? "Usuario sin ficha"}</b>
                  <Estrellas valor={ev.puntuacion} />
                </div>
                {ev.comentario && <p>{ev.comentario}</p>}
                <small className="tenue">{new Date(ev.updated_at).toLocaleDateString("es-ES")}</small>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
