"use client";
import "./archivos.css";
import "../ficha/ficha.css"; // FotoTrabajador usa los estilos .ficha-foto
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Empleado } from "@/lib/tipos";
import type { Nomina } from "@/lib/rrhh/nominas";
import { usePerfil } from "../../PerfilContext";
import Modal from "../../Modal";
import FotoTrabajador from "../ficha/FotoTrabajador";
import NominasEmpleado from "./NominasEmpleado";

// Se muestran todos los empleados. Cada uno abre SOLO su carpeta para subir y firmar sus nóminas; RRHH puede abrir cualquiera.
// La privacidad la garantizan las políticas RLS de la base de datos, no solo esta pantalla.
export default function Archivos() {
  const { es_rrhh, empleado_id, cargando } = usePerfil();
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [nominas, setNominas] = useState<Nomina[]>([]);
  const [cargado, setCargado] = useState(false);
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null);
  const [aviso, setAviso] = useState("");

  const cargar = useCallback(async () => {
    const [e, n] = await Promise.all([
      supabase.from("empleados").select("*").eq("estado", "activo").order("nombre"),
      supabase.from("nominas").select("*").order("periodo", { ascending: false }),
    ]);
    setEmpleados((e.data as Empleado[]) ?? []);
    setNominas((n.data as Nomina[]) ?? []);
    setAviso(n.error ? `No se pudieron cargar las nóminas. ${n.error.message}` : "");
    setCargado(true);
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const porEmpleado = useMemo(() => {
    const m = new Map<string, Nomina[]>();
    for (const n of nominas) m.set(n.empleado_id, [...(m.get(n.empleado_id) ?? []), n]);
    return m;
  }, [nominas]);

  // Primero tú; después el resto por nombre
  const visibles = useMemo(() => empleados
    .filter((t) => `${t.nombre} ${t.puesto ?? ""}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Number(b.id === empleado_id) - Number(a.id === empleado_id) || a.nombre.localeCompare(b.nombre, "es")),
  [empleados, q, empleado_id]);

  const seleccionado = empleados.find((t) => t.id === abierto) ?? null;
  if (cargando) return null;

  return (
    <>
      <p className="arch-intro">
        {empleado_id || es_rrhh
          ? "Abre tu tarjeta para subir tu nómina en PDF y firmarla. Las nóminas son privadas: cada empleado solo accede a la suya."
          : "Tu usuario todavía no está vinculado a una ficha, así que no puedes subir nóminas. Pide a RRHH que cree tu ficha con tu mismo correo."}
      </p>
      <div className="arch-barra">
        <input type="search" className="buscar" placeholder="Buscar por nombre o puesto" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar empleados" />
      </div>
      {aviso && <p className="aviso" data-tipo="error" role="alert">{aviso}</p>}

      <div className="grid-tarjetas">
        {visibles.map((t) => {
          const mias = porEmpleado.get(t.id) ?? [];
          const sinFirmar = mias.filter((n) => !n.firmada).length;
          const accesible = es_rrhh || t.id === empleado_id;
          const contenido = (
            <>
              <FotoTrabajador t={t} />
              <span className="arch-info">
                <b>{t.nombre}</b>
                <span className="arch-sub">{t.puesto ?? "Sin puesto"}</span>
                {accesible ? (
                  <span className="arch-sub">
                    {mias.length === 0 ? "Sin nóminas" : `${mias.length} ${mias.length === 1 ? "nómina" : "nóminas"}`}
                    {sinFirmar > 0 && <> · <b className="arch-pendiente">{sinFirmar} sin firmar</b></>}
                  </span>
                ) : <span className="arch-sub">Archivos privados</span>}
                {t.id === empleado_id && <span className="chip">Tú</span>}
              </span>
            </>
          );
          return accesible
            ? <button key={t.id} type="button" className="tarjeta arch-tarjeta" onClick={() => setAbierto(t.id)}>{contenido}</button>
            : <div key={t.id} className="tarjeta arch-tarjeta sin-enlace" data-bloqueada="true">{contenido}</div>;
        })}
      </div>

      {cargado && empleados.length === 0 && <p className="vacio">No hay empleados activos.</p>}
      {cargado && empleados.length > 0 && visibles.length === 0 && <p className="vacio">Ningún empleado coincide con la búsqueda.</p>}

      <Modal abierto={seleccionado !== null} titulo={seleccionado ? `Nóminas de ${seleccionado.nombre}` : "Nóminas"} onCerrar={() => setAbierto(null)}>
        {seleccionado && (
          <NominasEmpleado
            key={seleccionado.id}
            trabajador={seleccionado}
            nominas={porEmpleado.get(seleccionado.id) ?? []}
            esMia={seleccionado.id === empleado_id}
            esRrhh={es_rrhh}
            onCambio={cargar}
          />
        )}
      </Modal>
    </>
  );
}
