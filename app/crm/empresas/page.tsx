"use client";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { iniciales, colorDe } from "@/lib/avatar";
import type { Empleado, Empresa } from "@/lib/tipos";
import Modal from "../Modal";

export default function Empresas() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    const [c, e] = await Promise.all([
      supabase.from("empresas").select("*").order("created_at", { ascending: false }),
      supabase.from("empleados").select("*").order("nombre"),
    ]);
    setEmpresas((c.data as Empresa[]) ?? []);
    setEmpleados((e.data as Empleado[]) ?? []);
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const equipoDe = useMemo(() => {
    const m = new Map<string, Empleado[]>();
    for (const e of empleados) {
      if (!e.empresa_id) continue;
      m.set(e.empresa_id, [...(m.get(e.empresa_id) ?? []), e]);
    }
    return m;
  }, [empleados]);
  const sinEmpresa = empleados.filter((m) => !m.empresa_id);

  async function crear(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const d = new FormData(form);
    setError("");
    const { error } = await supabase.rpc("crear_empresa", {
      p_nombre: String(d.get("nombre")).trim(),
      p_ubicacion: String(d.get("ubicacion")).trim(),
      p_empleado_id: String(d.get("empleado")) || null,
    });
    if (error) return setError(`No se pudo crear la empresa. ${error.message}`);
    form.reset();
    setAbierto(false);
    cargar();
  }

  return (
    <>
      <div className="cab">
        <h1>Empresas</h1>
        <button className="btn" onClick={() => { setError(""); setAbierto(true); }}>Nueva empresa</button>
      </div>

      <div className="grid-tarjetas">
        {empresas.map((c) => {
          const equipo = equipoDe.get(c.id) ?? [];
          return (
            <Link key={c.id} href={`/crm/empresas/${c.id}`} className="tarjeta tarjeta-empresa">
              <div className="tarjeta-cab">
                <span className="icono-empresa" aria-hidden>🏢</span>
                <div>
                  <h3>{c.nombre}</h3>
                  <p className="ubicacion">📍 {c.ubicacion}</p>
                </div>
              </div>
              <div className="tarjeta-pie">
                <div className="avatares">
                  {equipo.slice(0, 4).map((m) => (
                    <span key={m.id} className="avatar" style={{ background: colorDe(m.id) }} title={m.nombre}>{iniciales(m.nombre)}</span>
                  ))}
                  {equipo.length > 4 && <span className="avatar avatar-mas">+{equipo.length - 4}</span>}
                </div>
                <span className="contador">{equipo.length} {equipo.length === 1 ? "empleado" : "empleados"}</span>
              </div>
            </Link>
          );
        })}
      </div>
      {empresas.length === 0 && <p className="vacio">Aún no hay empresas. Crea la primera con el botón Nueva empresa.</p>}

      <Modal abierto={abierto} titulo="Nueva empresa" onCerrar={() => setAbierto(false)}>
        <form className="form plano" onSubmit={crear}>
          <label>Nombre de la empresa<input name="nombre" required minLength={2} maxLength={120} /></label>
          <label>Ubicación<input name="ubicacion" required minLength={2} maxLength={160} placeholder="Ciudad y país" /></label>
          <label>Empleado
            <select name="empleado" defaultValue="">
              <option value="">{sinEmpresa.length ? "Sin empleado por ahora" : "No hay empleados sin empresa"}</option>
              {sinEmpresa.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>
          </label>
          <button className="btn">Crear empresa</button>
          <p className="aviso" role="alert" data-tipo="error">{error}</p>
        </form>
      </Modal>
    </>
  );
}
