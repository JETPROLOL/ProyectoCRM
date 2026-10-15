"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { urlFirmada } from "@/lib/rrhh/archivos";
import { ETIQUETA_SOLICITUD, EstadoSolicitud, SolicitudAdmision } from "@/lib/rrhh/admision";
import Modal from "../../Modal";

type Filtro = EstadoSolicitud | "todas";
const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });

export default function ListaSolicitudes() {
  const [lista, setLista] = useState<SolicitudAdmision[]>([]);
  const [cargado, setCargado] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>("pendiente");
  const [q, setQ] = useState("");
  const [denegando, setDenegando] = useState<SolicitudAdmision | null>(null);
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from("solicitudes_admision").select("*").order("created_at", { ascending: false });
    if (error) setAviso({ tipo: "error", texto: `No se pudieron cargar las solicitudes. ${error.message}` });
    setLista((data as SolicitudAdmision[]) ?? []);
    setCargado(true);
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const pendientes = lista.filter((s) => s.estado === "pendiente").length;
  const visibles = useMemo(() => lista.filter((s) =>
    (filtro === "todas" || s.estado === filtro) &&
    `${s.nombre} ${s.apellidos} ${s.email}`.toLowerCase().includes(q.toLowerCase())), [lista, filtro, q]);

  async function verCv(s: SolicitudAdmision) {
    const w = window.open("", "_blank"); // se abre antes de esperar para que el navegador no bloquee la ventana
    const url = await urlFirmada("cvs", s.cv_path);
    if (url && w) w.location.href = url;
    else { w?.close(); setAviso({ tipo: "error", texto: "No se pudo abrir el currículum." }); }
  }

  async function aceptar(s: SolicitudAdmision) {
    if (!window.confirm(`¿Aceptar a ${s.nombre} ${s.apellidos}?\n\nSe creará su ficha de empleado y sus tareas del check de inicio.`)) return;
    setOcupado(s.id);
    const { error } = await supabase.rpc("aceptar_solicitud_admision", { p_id: s.id });
    setOcupado(null);
    if (error) return setAviso({ tipo: "error", texto: error.message });
    setAviso({ tipo: "ok", texto: `${s.nombre} ${s.apellidos} ya es empleado/a. Aparece en Ficha, Empleados y Check de inicio.` });
    cargar();
  }

  async function denegar() {
    if (!denegando) return;
    setOcupado(denegando.id);
    const { error } = await supabase.rpc("denegar_solicitud_admision", { p_id: denegando.id, p_motivo: motivo.trim() || null });
    setOcupado(null);
    if (error) return setAviso({ tipo: "error", texto: error.message });
    setAviso({ tipo: "ok", texto: "Solicitud denegada." });
    setDenegando(null);
    cargar();
  }

  // Elimina la solicitud y su CV (para no conservar datos personales de candidatos descartados)
  async function eliminar(s: SolicitudAdmision) {
    if (!window.confirm(`¿Eliminar la solicitud de ${s.nombre} ${s.apellidos} y su currículum? No se puede deshacer.`)) return;
    const { data, error } = await supabase.from("solicitudes_admision").delete().eq("id", s.id).select("id");
    if (error || !data?.length) return setAviso({ tipo: "error", texto: `No se pudo eliminar. ${error?.message ?? ""}` });
    await supabase.storage.from("cvs").remove([s.cv_path]);
    setAviso(null);
    cargar();
  }

  return (
    <>
      <div className="admision-barra">
        <input type="search" className="buscar" placeholder="Buscar por nombre o correo" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar solicitudes" />
        <select value={filtro} onChange={(e) => setFiltro(e.target.value as Filtro)} aria-label="Filtrar por estado" style={{ width: "auto" }}>
          <option value="pendiente">Pendientes ({pendientes})</option>
          <option value="aceptada">Aceptadas</option>
          <option value="denegada">Denegadas</option>
          <option value="todas">Todas</option>
        </select>
      </div>

      {aviso && (
        <p className="aviso" data-tipo={aviso.tipo} role="status">
          {aviso.texto} <button type="button" className="ficha-cerrar-aviso" onClick={() => setAviso(null)}>Cerrar</button>
        </p>
      )}

      {cargado && visibles.length === 0 && (
        <p className="vacio">{filtro === "pendiente" && !q ? "No hay solicitudes pendientes." : "Ninguna solicitud coincide con el filtro."}</p>
      )}

      <ul className="admision-lista">
        {visibles.map((s) => (
          <li key={s.id} className="tarjeta admision-fila">
            <div className="admision-datos">
              <b>{s.nombre} {s.apellidos}</b>
              <a href={`mailto:${s.email}`}>{s.email}</a>
              <a href={`tel:${s.telefono.replace(/\s/g, "")}`}>{s.telefono}</a>
              <span className="tenue">Recibida el {fecha(s.created_at)}</span>
              {s.motivo && <span className="tenue">Motivo: {s.motivo}</span>}
              {s.estado === "aceptada" && <Link href="/crm/rrhh/ficha" className="admision-enlace">Ver en Ficha</Link>}
            </div>
            <span className="admision-estado" data-estado={s.estado}>{ETIQUETA_SOLICITUD[s.estado]}</span>
            <div className="admision-acciones">
              <button type="button" className="btn peq admision-sec" onClick={() => verCv(s)}>Ver currículum</button>
              {s.estado === "pendiente" ? (
                <>
                  <button type="button" className="btn peq" disabled={ocupado === s.id} onClick={() => aceptar(s)}>Aceptar</button>
                  <button type="button" className="btn peq admision-sec" disabled={ocupado === s.id} onClick={() => { setMotivo(""); setAviso(null); setDenegando(s); }}>Denegar</button>
                </>
              ) : (
                <button type="button" className="btn peq admision-sec" onClick={() => eliminar(s)}>Eliminar</button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <Modal abierto={denegando !== null} titulo="Denegar solicitud" onCerrar={() => setDenegando(null)}>
        {denegando && (
          <div className="form plano">
            <p>Vas a denegar la solicitud de <b>{denegando.nombre} {denegando.apellidos}</b>. No se le enviará ningún aviso.</p>
            <label>Motivo (opcional, solo lo verá RRHH)
              <textarea rows={3} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </label>
            <button type="button" className="btn" disabled={ocupado === denegando.id} onClick={denegar}>Denegar solicitud</button>
          </div>
        )}
      </Modal>
    </>
  );
}
