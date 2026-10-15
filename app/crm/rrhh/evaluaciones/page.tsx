"use client";
import "./evaluaciones.css";
import "../ficha/ficha.css"; // FotoTrabajador usa los estilos .ficha-foto
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Empleado } from "@/lib/tipos";
import { Evaluacion, MediaEval, etiquetaTrimestre, inicioTrimestre, nota, proximoReinicio, trimestresRecientes } from "@/lib/rrhh/evaluaciones";
import { usePerfil } from "../../PerfilContext";
import Modal from "../../Modal";
import FotoTrabajador from "../ficha/FotoTrabajador";
import FormEvaluar from "./FormEvaluar";
import { Estrellas } from "./Estrellas";

// Cualquier usuario evalúa a cualquier empleado (excepto a sí mismo) de 1 a 5. Todos ven la media; se reinicia cada trimestre.
export default function Evaluaciones() {
  const { es_rrhh, empleado_id, cargando } = usePerfil();
  const actual = inicioTrimestre();
  const [trimestre, setTrimestre] = useState(actual);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [medias, setMedias] = useState<Map<string, MediaEval>>(new Map());
  const [evals, setEvals] = useState<Evaluacion[]>([]);
  const [uid, setUid] = useState<string | null>(null);
  const [cargado, setCargado] = useState(false);
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null);
  const [aviso, setAviso] = useState("");

  const cargar = useCallback(async () => {
    const [s, e, m, v] = await Promise.all([
      supabase.auth.getSession(),
      supabase.from("empleados").select("*").eq("estado", "activo").order("nombre"),
      supabase.rpc("medias_evaluaciones", { p_trimestre: trimestre }),
      supabase.from("evaluaciones").select("*").eq("trimestre", trimestre),
    ]);
    setUid(s.data.session?.user.id ?? null);
    setEmpleados((e.data as Empleado[]) ?? []);
    setMedias(new Map(((m.data as MediaEval[]) ?? []).map((x) => [x.evaluado_id, { ...x, media: Number(x.media) }])));
    setEvals((v.data as Evaluacion[]) ?? []);
    const fallo = m.error ?? v.error;
    setAviso(fallo ? `No se pudieron cargar las evaluaciones. ${fallo.message}` : "");
    setCargado(true);
  }, [trimestre]);
  useEffect(() => { cargar(); }, [cargar]);

  const visibles = useMemo(() => empleados.filter((t) => `${t.nombre} ${t.puesto ?? ""}`.toLowerCase().includes(q.toLowerCase())), [empleados, q]);
  // user_id de cada ficha -> nombre (para que RRHH vea quién evaluó)
  const nombres = useMemo(() => new Map(empleados.filter((t) => t.user_id).map((t) => [t.user_id as string, t.nombre])), [empleados]);
  const seleccionado = empleados.find((t) => t.id === abierto) ?? null;
  const editable = trimestre === actual;

  if (cargando) return null;

  return (
    <>
      <p className="eval-intro">
        Evalúa a tus compañeros de 1 a 5. La media que ves es la de todos los usuarios en el trimestre elegido.
        {editable && <> Las evaluaciones se reinician el {proximoReinicio()}.</>}
      </p>

      <div className="eval-barra">
        <input type="search" className="buscar" placeholder="Buscar por nombre o puesto" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar empleados" />
        <select value={trimestre} onChange={(e) => setTrimestre(e.target.value)} aria-label="Trimestre" style={{ width: "auto" }}>
          {trimestresRecientes().map((t) => <option key={t} value={t}>{etiquetaTrimestre(t)}{t === actual ? " · actual" : ""}</option>)}
        </select>
      </div>
      {aviso && <p className="aviso" data-tipo="error" role="alert">{aviso}</p>}

      <div className="grid-tarjetas">
        {visibles.map((t) => {
          const m = medias.get(t.id);
          const mia = evals.find((v) => v.evaluado_id === t.id && v.evaluador_user_id === uid);
          const soyYo = t.id === empleado_id || (!!uid && t.user_id === uid);
          const contenido = (
            <>
              <FotoTrabajador t={t} />
              <span className="eval-info">
                <b>{t.nombre}</b>
                <span className="eval-sub">{t.puesto ?? "Sin puesto"}</span>
                {m ? (
                  <span className="eval-media"><Estrellas valor={m.media} /> <b>{nota(m.media)}</b>
                    <span className="eval-sub"> · {m.total} {m.total === 1 ? "evaluación" : "evaluaciones"}</span></span>
                ) : <span className="eval-sub">Sin evaluaciones</span>}
                {soyYo ? <span className="chip">Eres tú</span>
                  : mia ? <span className="chip">Tu nota: {mia.puntuacion}</span>
                  : editable ? <span className="chip" data-vacio="true">Sin evaluar</span> : null}
              </span>
            </>
          );
          return soyYo
            ? <div key={t.id} className="tarjeta eval-tarjeta sin-enlace">{contenido}</div>
            : <button key={t.id} type="button" className="tarjeta eval-tarjeta" onClick={() => setAbierto(t.id)}>{contenido}</button>;
        })}
      </div>

      {cargado && empleados.length === 0 && <p className="vacio">No hay empleados activos que evaluar.</p>}
      {cargado && empleados.length > 0 && visibles.length === 0 && <p className="vacio">Ningún empleado coincide con la búsqueda.</p>}

      <Modal abierto={seleccionado !== null} titulo={seleccionado ? `Evaluar a ${seleccionado.nombre}` : "Evaluar"} onCerrar={() => setAbierto(null)}>
        {seleccionado && (
          <FormEvaluar
            key={`${seleccionado.id}-${trimestre}`}
            evaluadoId={seleccionado.id}
            mia={evals.find((v) => v.evaluado_id === seleccionado.id && v.evaluador_user_id === uid)}
            editable={editable}
            deRrhh={es_rrhh ? evals.filter((v) => v.evaluado_id === seleccionado.id) : null}
            nombres={nombres}
            onGuardado={() => { setAbierto(null); cargar(); }}
          />
        )}
      </Modal>
    </>
  );
}
