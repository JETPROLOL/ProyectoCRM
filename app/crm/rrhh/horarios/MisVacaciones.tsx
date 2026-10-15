"use client";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ETIQUETA_VAC, Vacacion, diasLaborables, hoyISO, rangoFechas } from "@/lib/rrhh/horarios";

// Vista del trabajador: pedir vacaciones y seguir el estado de sus solicitudes
export default function MisVacaciones({ empleadoId }: { empleadoId: string }) {
  const [lista, setLista] = useState<Vacacion[]>([]);
  const [cargado, setCargado] = useState(false);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [comentario, setComentario] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  const cargar = useCallback(async () => {
    const { data } = await supabase.from("vacaciones").select("*").eq("empleado_id", empleadoId).order("desde", { ascending: false });
    setLista((data as Vacacion[]) ?? []);
    setCargado(true);
  }, [empleadoId]);
  useEffect(() => { cargar(); }, [cargar]);

  const dias = diasLaborables(desde, hasta);
  const resumen = useMemo(() => {
    const anio = String(new Date().getFullYear());
    const delAnio = lista.filter((v) => v.desde.startsWith(anio));
    const suma = (e: Vacacion["estado"]) => delAnio.filter((v) => v.estado === e).reduce((s, v) => s + diasLaborables(v.desde, v.hasta), 0);
    return { aprobados: suma("aprobada"), pendientes: suma("pendiente") };
  }, [lista]);

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (hasta < desde) return setAviso({ tipo: "error", texto: "La fecha de fin no puede ser anterior a la de inicio." });
    setEnviando(true);
    setAviso(null);
    const { error } = await supabase.from("vacaciones").insert({ empleado_id: empleadoId, desde, hasta, comentario: comentario.trim() || null });
    setEnviando(false);
    if (error) return setAviso({ tipo: "error", texto: error.message });
    setDesde(""); setHasta(""); setComentario("");
    setAviso({ tipo: "ok", texto: "Solicitud enviada. RRHH la revisará en breve." });
    cargar();
  }

  async function cancelar(v: Vacacion) {
    if (!window.confirm("¿Cancelar esta solicitud?")) return;
    const { data, error } = await supabase.from("vacaciones").delete().eq("id", v.id).select("id");
    if (error || !data?.length) return setAviso({ tipo: "error", texto: `No se pudo cancelar. ${error?.message ?? "Quizá ya fue resuelta."}` });
    setAviso(null);
    cargar();
  }

  return (
    <div className="horarios-vac">
      <form className="form" onSubmit={enviar}>
        <h2 className="subtitulo">Pedir vacaciones</h2>
        <div className="fila">
          <label>Desde<input type="date" required min={hoyISO()} value={desde}
            onChange={(e) => { setDesde(e.target.value); if (hasta && e.target.value > hasta) setHasta(e.target.value); }} /></label>
          <label>Hasta<input type="date" required min={desde || hoyISO()} value={hasta} onChange={(e) => setHasta(e.target.value)} /></label>
        </div>
        {dias > 0 && <p className="tenue">{dias} {dias === 1 ? "día laborable" : "días laborables"} (lunes a viernes)</p>}
        <label>Comentario (opcional)<textarea rows={2} maxLength={500} value={comentario} onChange={(e) => setComentario(e.target.value)} /></label>
        <button className="btn" disabled={enviando}>{enviando ? "Enviando…" : "Enviar solicitud"}</button>
        <p className="aviso" role="status" data-tipo={aviso?.tipo}>{aviso?.texto}</p>
      </form>

      <section>
        <div className="horarios-kpis">
          <div><span>Aprobados este año</span><b>{resumen.aprobados} d</b></div>
          <div><span>Pendientes de respuesta</span><b>{resumen.pendientes} d</b></div>
        </div>
        <h2 className="subtitulo">Mis solicitudes</h2>
        {cargado && lista.length === 0 && <p className="vacio">Todavía no has pedido vacaciones.</p>}
        <ul className="horarios-lista">
          {lista.map((v) => (
            <li key={v.id}>
              <div>
                <b>{rangoFechas(v)}</b>
                <span className="tenue"> · {diasLaborables(v.desde, v.hasta)} d laborables</span>
                {v.comentario && <p className="tenue">{v.comentario}</p>}
                {v.respuesta && <p>Respuesta de RRHH: {v.respuesta}</p>}
              </div>
              <span className="horarios-estado-vac" data-estado={v.estado}>{ETIQUETA_VAC[v.estado]}</span>
              {v.estado === "pendiente" && <button type="button" className="horarios-link" onClick={() => cancelar(v)}>Cancelar</button>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
