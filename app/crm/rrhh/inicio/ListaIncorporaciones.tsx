"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Empleado } from "@/lib/tipos";
import { CheckInicio, ordenar, progreso } from "@/lib/rrhh/inicio";
import Modal from "../../Modal";
import FotoTrabajador from "../ficha/FotoTrabajador";
import Barra from "./Barra";
import Checklist from "./Checklist";

type Filtro = "todos" | "en_curso" | "completados" | "sin_tareas";

// 0 = en curso, 1 = sin tareas, 2 = completado. Se usa para ordenar: primero lo que requiere atención.
const rango = (hechas: number, total: number) => (total === 0 ? 1 : hechas < total ? 0 : 2);

// Vista de RRHH: progreso de incorporación de cada trabajador activo
export default function ListaIncorporaciones() {
  const [trabajadores, setTrabajadores] = useState<Empleado[]>([]);
  const [checks, setChecks] = useState<CheckInicio[]>([]);
  const [cargado, setCargado] = useState(false);
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [abierto, setAbierto] = useState<string | null>(null); // id del trabajador cuya lista está abierta
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    const [e, c] = await Promise.all([
      supabase.from("empleados").select("*").eq("estado", "activo").order("nombre"),
      supabase.from("checks_inicio").select("*"),
    ]);
    setTrabajadores((e.data as Empleado[]) ?? []);
    setChecks((c.data as CheckInicio[]) ?? []);
    if (c.error) setError(`No se pudieron cargar las tareas. ${c.error.message}`);
    setCargado(true);
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const porTrabajador = useMemo(() => {
    const m = new Map<string, CheckInicio[]>();
    for (const c of checks) m.set(c.empleado_id, [...(m.get(c.empleado_id) ?? []), c]);
    return m;
  }, [checks]);

  const visibles = useMemo(() => trabajadores
    .map((t) => { const p = progreso(porTrabajador.get(t.id) ?? []); return { t, ...p, r: rango(p.hechas, p.total) }; })
    .filter(({ t, r }) =>
      (filtro === "todos" || (filtro === "en_curso" && r === 0) || (filtro === "completados" && r === 2) || (filtro === "sin_tareas" && r === 1)) &&
      `${t.nombre} ${t.puesto ?? ""}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.r - b.r || a.t.nombre.localeCompare(b.t.nombre, "es")),
  [trabajadores, porTrabajador, filtro, q]);

  const seleccionado = trabajadores.find((t) => t.id === abierto) ?? null;

  function abrir(id: string) { setError(""); setAbierto(id); }

  async function alternar(tarea: CheckInicio) {
    const completada = !tarea.completada;
    // Se actualiza la pantalla al instante y después se confirma en la base de datos
    setChecks((prev) => prev.map((c) => (c.id === tarea.id
      ? { ...c, completada, completada_en: completada ? new Date().toISOString() : null } : c)));
    const { data, error: fallo } = await supabase.from("checks_inicio").update({ completada }).eq("id", tarea.id).select("id");
    if (fallo || !data?.length) {
      setError(`No se pudo actualizar la tarea. ${fallo?.message ?? "No tienes permiso o la tarea ya no existe."}`);
      cargar();
    }
  }

  async function anadir(empleadoId: string, titulo: string): Promise<boolean> {
    const orden = (porTrabajador.get(empleadoId) ?? []).reduce((m, c) => Math.max(m, c.orden), 0) + 1;
    const { data, error: fallo } = await supabase.from("checks_inicio")
      .insert({ empleado_id: empleadoId, titulo, orden }).select("*").single();
    if (fallo || !data) {
      setError(fallo?.code === "23505" ? "Esa tarea ya existe para este trabajador." : `No se pudo añadir la tarea. ${fallo?.message ?? ""}`);
      return false;
    }
    setError("");
    setChecks((prev) => [...prev, data as CheckInicio]);
    return true;
  }

  async function quitar(tarea: CheckInicio) {
    if (!window.confirm(`¿Quitar la tarea "${tarea.titulo}"?`)) return;
    const { data, error: fallo } = await supabase.from("checks_inicio").delete().eq("id", tarea.id).select("id");
    if (fallo || !data?.length) {
      return setError(`No se pudo quitar la tarea. ${fallo?.message ?? "No tienes permiso o la tarea ya no existe."}`);
    }
    setError("");
    setChecks((prev) => prev.filter((c) => c.id !== tarea.id));
  }

  async function estandar(empleadoId: string) {
    const { error: fallo } = await supabase.rpc("crear_checks_inicio", { p_empleado_id: empleadoId });
    if (fallo) return setError(`No se pudieron crear las tareas estándar. ${fallo.message}`);
    setError("");
    cargar();
  }

  return (
    <>
      <div className="inicio-filtros">
        <input type="search" className="buscar" placeholder="Buscar por nombre o puesto" value={q}
          onChange={(e) => setQ(e.target.value)} aria-label="Buscar trabajadores" />
        <select value={filtro} onChange={(e) => setFiltro(e.target.value as Filtro)} aria-label="Filtrar por progreso">
          <option value="todos">Todos</option>
          <option value="en_curso">En curso</option>
          <option value="completados">Completados</option>
          <option value="sin_tareas">Sin tareas</option>
        </select>
      </div>

      {error && abierto === null && <p className="aviso" role="alert" data-tipo="error">{error}</p>}

      <div className="grid-tarjetas">
        {visibles.map(({ t, hechas, total }) => (
          <button key={t.id} type="button" className="tarjeta inicio-tarjeta" onClick={() => abrir(t.id)}>
            <FotoTrabajador t={t} />
            <span className="inicio-info">
              <b>{t.nombre}</b>
              <span className="inicio-estado">{t.puesto ?? "Sin puesto"}</span>
              <Barra hechas={hechas} total={total} />
              <span className="inicio-estado">
                {total === 0 ? "Sin tareas" : hechas === total ? "Completado" : `${hechas} de ${total} tareas`}
              </span>
            </span>
          </button>
        ))}
      </div>

      {cargado && trabajadores.length === 0 && <p className="vacio">No hay trabajadores activos. Créalos en la pestaña Ficha.</p>}
      {cargado && trabajadores.length > 0 && visibles.length === 0 && <p className="vacio">Ningún trabajador coincide con el filtro.</p>}

      <Modal abierto={seleccionado !== null} titulo={seleccionado ? `Check de inicio: ${seleccionado.nombre}` : "Check de inicio"} onCerrar={() => setAbierto(null)}>
        {seleccionado && (
          <Checklist
            tareas={ordenar(porTrabajador.get(seleccionado.id) ?? [])}
            error={error}
            onAlternar={alternar}
            onAnadir={(titulo) => anadir(seleccionado.id, titulo)}
            onQuitar={quitar}
            onEstandar={() => estandar(seleccionado.id)}
          />
        )}
      </Modal>
    </>
  );
}
