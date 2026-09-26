"use client";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { iniciales, colorDe } from "@/lib/avatar";
import type { Empleado, Empresa, Oportunidad } from "@/lib/tipos";
import Modal from "../Modal";

type Op = Pick<Oportunidad, "id" | "nombre" | "servicio" | "empleado_id">;

export default function Empleados() {
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [ops, setOps] = useState<Op[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    const [e, c, o] = await Promise.all([
      supabase.from("empleados").select("*").order("created_at", { ascending: false }),
      supabase.from("empresas").select("*").order("nombre"),
      supabase.from("oportunidades").select("id,nombre,servicio,empleado_id").order("created_at", { ascending: false }),
    ]);
    setEmpleados((e.data as Empleado[]) ?? []);
    setEmpresas((c.data as Empresa[]) ?? []);
    setOps((o.data as Op[]) ?? []);
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const empresaDe = useMemo(() => new Map(empresas.map((c) => [c.id, c.nombre])), [empresas]);
  const opDe = useMemo(() => new Map(ops.filter((o) => o.empleado_id).map((o) => [o.empleado_id as string, o])), [ops]);
  const libres = ops.filter((o) => !o.empleado_id);

  async function crear(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const d = new FormData(form);
    setError("");
    const { error } = await supabase.rpc("crear_empleado", {
      p_nombre: String(d.get("nombre")).trim(),
      p_email: String(d.get("email")).trim(),
      p_telefono: String(d.get("telefono")).trim(),
      p_empresa_id: String(d.get("empresa")) || null,
      p_oportunidad_id: String(d.get("oportunidad")) || null,
    });
    if (error) return setError(`No se pudo crear el empleado. ${error.message}`);
    form.reset();
    setAbierto(false);
    cargar();
  }

  return (
    <>
      <div className="cab">
        <h1>Empleados</h1>
        <button className="btn" onClick={() => { setError(""); setAbierto(true); }}>Nuevo empleado</button>
      </div>

      <div className="grid-tarjetas">
        {empleados.map((m) => {
          const op = opDe.get(m.id);
          return (
            <Link key={m.id} href={`/crm/empleados/${m.id}`} className="tarjeta tarjeta-empleado">
              <span className="avatar grande" style={{ background: colorDe(m.id) }} aria-hidden>{iniciales(m.nombre)}</span>
              <div>
                <h3>{m.nombre}</h3>
                <p className="correo">{m.email}</p>
                <div className="chips">
                  <span className="chip" data-vacio={!m.empresa_id}>{m.empresa_id ? empresaDe.get(m.empresa_id) : "Sin empresa"}</span>
                  <span className="chip" data-vacio={!op}>{op ? op.servicio : "Sin oportunidad"}</span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
      {empleados.length === 0 && <p className="vacio">Aún no hay empleados. Crea el primero con el botón Nuevo empleado.</p>}

      <Modal abierto={abierto} titulo="Nuevo empleado" onCerrar={() => setAbierto(false)}>
        <form className="form plano" onSubmit={crear}>
          <label>Nombre<input name="nombre" required minLength={2} maxLength={120} /></label>
          <label>Correo electrónico<input name="email" type="email" required /></label>
          <label>Número de teléfono<input name="telefono" type="tel" required minLength={5} maxLength={30} /></label>
          <label>Empresa asociada
            <select name="empresa" defaultValue="">
              <option value="">Sin empresa por ahora</option>
              {empresas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </label>
          <label>Oportunidad que ha redactado
            <select name="oportunidad" defaultValue="">
              <option value="">{libres.length ? "Sin oportunidad por ahora" : "No hay oportunidades sin asociar"}</option>
              {libres.map((o) => <option key={o.id} value={o.id}>{o.nombre}, {o.servicio}</option>)}
            </select>
          </label>
          <button className="btn">Crear empleado</button>
          <p className="aviso" role="alert" data-tipo="error">{error}</p>
        </form>
      </Modal>
    </>
  );
}
