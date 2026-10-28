"use client";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { iniciales, colorDe } from "@/lib/avatar";
import type { Empleado, Empresa } from "@/lib/tipos";
import Modal from "../Modal";
import Icono from "../Icono";
import "../ventas/ventas.css";

export default function Empresas() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

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
    const t = (k: string) => String(d.get(k) ?? "").trim() || null;
    const nif = t("nif")?.toUpperCase() ?? null;
    setError("");
    setAviso("");

    // Comprobamos el NIF antes de crear nada, para no dejar una empresa a medias
    if (nif) {
      const { data: repetida } = await supabase.from("empresas").select("nombre").ilike("nif", nif).limit(1);
      if (repetida && repetida.length > 0) return setError(`Ya existe una empresa con ese NIF/CIF (${repetida[0].nombre}).`);
    }

    const { data: id, error } = await supabase.rpc("crear_empresa", {
      p_nombre: String(d.get("nombre")).trim(),
      p_ubicacion: String(d.get("ubicacion")).trim(),
      p_empleado_id: String(d.get("empleado")) || null,
    });
    if (error) return setError(`No se pudo crear la empresa. ${error.message}`);

    const fiscales = {
      razon_social: t("razon_social"), nif, direccion_fiscal: t("direccion_fiscal"),
      codigo_postal: t("codigo_postal"), ciudad: t("ciudad"), pais: t("pais") ?? "España",
      email_facturacion: t("email_facturacion"), telefono: t("telefono"), dias_pago: Number(d.get("dias_pago")),
    };
    const { error: errFiscal } = await supabase.from("empresas").update(fiscales).eq("id", id);
    form.reset();
    setAbierto(false);
    if (errFiscal) setAviso("La empresa se ha creado, pero no se pudieron guardar sus datos fiscales. Complétalos desde su ficha.");
    cargar();
  }

  return (
    <>
      <div className="cab">
        <h1>Empresas</h1>
        <button className="btn" onClick={() => { setError(""); setAbierto(true); }}><Icono nombre="plus" />Nueva empresa</button>
      </div>

      <p className="aviso" role="status" data-tipo="ok">{aviso}</p>

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
        <form className="form plano ventas-form" onSubmit={crear}>
          <label>Nombre de la empresa<input name="nombre" required minLength={2} maxLength={120} /></label>
          <label>Ubicación<input name="ubicacion" required minLength={2} maxLength={160} placeholder="Ciudad y país" /></label>
          <label>Empleado
            <select name="empleado" defaultValue="">
              <option value="">{sinEmpresa.length ? "Sin empleado por ahora" : "No hay empleados sin empresa"}</option>
              {sinEmpresa.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>
          </label>
          <fieldset className="ventas-fiscal-campos">
            <legend>Datos fiscales <span className="ayuda">(opcionales ahora; hacen falta para facturar)</span></legend>
            <label>Razón social<input name="razon_social" maxLength={160} /></label>
            <div className="fila">
              <label>NIF/CIF<input name="nif" minLength={5} maxLength={20} autoComplete="off" /></label>
              <label>Plazo de pago (días)<input name="dias_pago" type="number" required min={0} max={120} defaultValue={30} /></label>
            </div>
            <label>Dirección fiscal<input name="direccion_fiscal" maxLength={200} autoComplete="street-address" /></label>
            <div className="fila">
              <label>Código postal<input name="codigo_postal" minLength={4} maxLength={10} autoComplete="postal-code" /></label>
              <label>Ciudad<input name="ciudad" maxLength={100} /></label>
            </div>
            <div className="fila">
              <label>País<input name="pais" required minLength={2} maxLength={60} defaultValue="España" /></label>
              <label>Teléfono<input name="telefono" type="tel" minLength={5} maxLength={30} autoComplete="tel" /></label>
            </div>
            <label>Correo de facturación<input name="email_facturacion" type="email" maxLength={160} /></label>
          </fieldset>
          <button className="btn"><Icono nombre="plus" />Crear empresa</button>
          <p className="aviso" role="alert" data-tipo="error">{error}</p>
        </form>
      </Modal>
    </>
  );
}
