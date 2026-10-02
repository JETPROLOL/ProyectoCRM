"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Empleado } from "@/lib/tipos";
import Modal from "../../Modal";
import FichaForm from "./FichaForm";
import FotoTrabajador from "./FotoTrabajador";

// Vista de RRHH: toda la plantilla, con alta y edición
export default function ListaFichas() {
  const [lista, setLista] = useState<Empleado[]>([]);
  const [cargado, setCargado] = useState(false);
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<"activo" | "baja" | "todos">("activo");
  const [editando, setEditando] = useState<Empleado | "nuevo" | null>(null);
  const [aviso, setAviso] = useState("");

  const cargar = useCallback(async () => {
    const { data } = await supabase.from("empleados").select("*").order("nombre");
    setLista((data as Empleado[]) ?? []);
    setCargado(true);
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const visibles = useMemo(() => lista.filter((t) =>
    (filtro === "todos" || t.estado === filtro) &&
    `${t.nombre} ${t.puesto ?? ""} ${t.email}`.toLowerCase().includes(q.toLowerCase())), [lista, q, filtro]);

  return (
    <>
      <div className="ficha-barra">
        <input type="search" className="buscar" placeholder="Buscar por nombre, puesto o correo" value={q}
          onChange={(e) => setQ(e.target.value)} aria-label="Buscar trabajadores" />
        <select value={filtro} onChange={(e) => setFiltro(e.target.value as "activo" | "baja" | "todos")} aria-label="Filtrar por estado">
          <option value="activo">Activos</option>
          <option value="baja">Bajas</option>
          <option value="todos">Todos</option>
        </select>
        <button className="btn" onClick={() => setEditando("nuevo")}>Nuevo trabajador</button>
      </div>

      {aviso && (
        <p className="aviso" data-tipo="error" role="status">
          {aviso} <button type="button" className="ficha-cerrar-aviso" onClick={() => setAviso("")}>Cerrar</button>
        </p>
      )}

      <div className="grid-tarjetas">
        {visibles.map((t) => (
          <button key={t.id} type="button" className="tarjeta ficha-tarjeta" data-baja={t.estado === "baja"} onClick={() => setEditando(t)}>
            <FotoTrabajador t={t} />
            <span className="ficha-datos">
              <b>{t.nombre}</b>
              <span>{t.puesto ?? "Sin puesto"}</span>
              <span>{t.email}</span>
            </span>
            {t.estado === "baja" && <span className="chip">Baja</span>}
          </button>
        ))}
      </div>

      {cargado && lista.length === 0 && <p className="vacio">Aún no hay trabajadores. Crea el primero con el botón Nuevo trabajador.</p>}
      {cargado && lista.length > 0 && visibles.length === 0 && <p className="vacio">Ningún trabajador coincide con la búsqueda.</p>}

      <Modal abierto={editando !== null} titulo={editando === "nuevo" ? "Nuevo trabajador" : "Ficha del trabajador"} onCerrar={() => setEditando(null)}>
        {editando !== null && (
          <FichaForm
            key={editando === "nuevo" ? "nuevo" : editando.id}
            trabajador={editando === "nuevo" ? null : editando}
            todos={lista}
            onGuardado={(av) => { setEditando(null); if (av) setAviso(av); cargar(); }}
          />
        )}
      </Modal>
    </>
  );
}
