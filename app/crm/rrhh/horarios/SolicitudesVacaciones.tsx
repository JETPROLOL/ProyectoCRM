"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import Modal from "../../Modal";
import { ETIQUETA_VAC, EstadoVacaciones, Vacacion, diasLaborables, rangoFechas, seSolapan } from "@/lib/rrhh/horarios";
import Icono from "../../Icono";

type Filtro = EstadoVacaciones | "todas";

// Vista de RRHH: cola de solicitudes de vacaciones para aprobar o rechazar
export default function SolicitudesVacaciones() {
  const [lista, setLista] = useState<Vacacion[]>([]);
  const [nombres, setNombres] = useState<Map<string, string>>(new Map());
  const [cargado, setCargado] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>("pendiente");
  const [revisando, setRevisando] = useState<Vacacion | null>(null);
  const [respuesta, setRespuesta] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    const [v, e] = await Promise.all([
      supabase.from("vacaciones").select("*").order("desde", { ascending: true }),
      supabase.from("empleados").select("id,nombre"),
    ]);
    if (v.error) setError(`No se pudieron cargar las solicitudes. ${v.error.message}`);
    setLista((v.data as Vacacion[]) ?? []);
    setNombres(new Map(((e.data as { id: string; nombre: string }[]) ?? []).map((x) => [x.id, x.nombre])));
    setCargado(true);
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const visibles = useMemo(() => lista.filter((v) => filtro === "todas" || v.estado === filtro), [lista, filtro]);
  const pendientes = lista.filter((v) => v.estado === "pendiente").length;

  // Otros trabajadores con vacaciones aprobadas que coinciden con la solicitud que se está revisando
  const coinciden = revisando
    ? lista.filter((o) => o.id !== revisando.id && o.estado === "aprobada" && o.empleado_id !== revisando.empleado_id && seSolapan(o, revisando))
    : [];

  function abrir(v: Vacacion) { setRespuesta(""); setError(""); setRevisando(v); }

  async function resolver(aprobar: boolean) {
    if (!revisando) return;
    setOcupado(true);
    const { error: fallo } = await supabase.rpc("resolver_vacaciones", { p_id: revisando.id, p_aprobar: aprobar, p_respuesta: respuesta.trim() || null });
    setOcupado(false);
    if (fallo) return setError(fallo.message);
    setRevisando(null);
    cargar();
  }

  return (
    <>
      <div className="horarios-barra">
        <select value={filtro} onChange={(e) => setFiltro(e.target.value as Filtro)} aria-label="Filtrar solicitudes" style={{ width: "auto" }}>
          <option value="pendiente">Pendientes ({pendientes})</option>
          <option value="aprobada">Aprobadas</option>
          <option value="rechazada">Rechazadas</option>
          <option value="todas">Todas</option>
        </select>
      </div>
      {error && !revisando && <p className="aviso" data-tipo="error" role="alert">{error}</p>}

      {cargado && visibles.length === 0 && (
        <p className="vacio">{filtro === "pendiente" ? "No hay solicitudes pendientes." : "No hay solicitudes con este filtro."}</p>
      )}
      <ul className="horarios-lista">
        {visibles.map((v) => (
          <li key={v.id}>
            <div>
              <b>{nombres.get(v.empleado_id) ?? "Trabajador eliminado"}</b>
              <p>{rangoFechas(v)} <span className="tenue">· {diasLaborables(v.desde, v.hasta)} d laborables</span></p>
              {v.comentario && <p className="tenue">{v.comentario}</p>}
              {v.respuesta && <p className="tenue">Respuesta: {v.respuesta}</p>}
            </div>
            <span className="horarios-estado-vac" data-estado={v.estado}>{ETIQUETA_VAC[v.estado]}</span>
            {v.estado === "pendiente" && <button type="button" className="btn peq" onClick={() => abrir(v)}><Icono nombre="eye" />Revisar</button>}
          </li>
        ))}
      </ul>

      <Modal abierto={revisando !== null} titulo="Revisar solicitud" onCerrar={() => setRevisando(null)}>
        {revisando && (
          <div className="form plano">
            <p><b>{nombres.get(revisando.empleado_id)}</b><br />{rangoFechas(revisando)} · {diasLaborables(revisando.desde, revisando.hasta)} días laborables</p>
            {revisando.comentario && <p className="tenue">“{revisando.comentario}”</p>}
            {coinciden.length > 0 && (
              <p className="aviso" data-tipo="error">
                Coincide con vacaciones aprobadas de: {coinciden.map((o) => nombres.get(o.empleado_id) ?? "—").join(", ")}.
              </p>
            )}
            <label>Respuesta (opcional)<textarea rows={2} maxLength={500} value={respuesta} onChange={(e) => setRespuesta(e.target.value)} /></label>
            <div className="horarios-botones">
              <button type="button" className="btn" disabled={ocupado} onClick={() => resolver(true)}><Icono nombre="check" />Aprobar</button>
              <button type="button" className="btn horarios-sec" disabled={ocupado} onClick={() => resolver(false)}><Icono nombre="x" />Rechazar</button>
            </div>
            <p className="aviso" role="alert" data-tipo="error">{error}</p>
          </div>
        )}
      </Modal>
    </>
  );
}
