"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams, notFound } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { iniciales, colorDe } from "@/lib/avatar";
import type { Empleado, Empresa, Oportunidad } from "@/lib/tipos";
import { DatosFiscales, direccionCompleta, faltaParaFacturar } from "@/lib/ventas/base";
import Modal from "../../Modal";
import "../../ventas/ventas.css";

type EmpleadoConOp = Empleado & { oportunidad: Pick<Oportunidad, "nombre" | "servicio" | "estado"> | null };

export default function DetalleEmpresa() {
  const { id } = useParams<{ id: string }>();
  const [empresa, setEmpresa] = useState<(Empresa & Partial<DatosFiscales>) | null | undefined>(undefined);
  const [equipo, setEquipo] = useState<EmpleadoConOp[]>([]);
  const [editando, setEditando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  const cargar = useCallback(async () => {
    const [{ data: c }, { data: e }] = await Promise.all([
      supabase.from("empresas").select("*").eq("id", id).maybeSingle(),
      supabase.from("empleados").select("*, oportunidad:oportunidades!oportunidades_empleado_id_fkey(nombre,servicio,estado)").eq("empresa_id", id).order("nombre"),
    ]);
    setEmpresa(c ?? null);
    setEquipo((e as unknown as EmpleadoConOp[]) ?? []);
  }, [id]);
  useEffect(() => { cargar(); }, [cargar]);

  async function guardarFiscales(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const d = new FormData(ev.currentTarget);
    const t = (k: string) => String(d.get(k) ?? "").trim() || null;
    setError("");
    const { error } = await supabase.from("empresas").update({
      razon_social: t("razon_social"), nif: t("nif")?.toUpperCase() ?? null, direccion_fiscal: t("direccion_fiscal"),
      codigo_postal: t("codigo_postal"), ciudad: t("ciudad"), pais: t("pais") ?? "España",
      email_facturacion: t("email_facturacion"), telefono: t("telefono"), dias_pago: Number(d.get("dias_pago")),
    }).eq("id", id);
    if (error) {
      return setError(error.code === "23505" ? "Ya hay otra empresa con ese NIF/CIF." : `No se pudieron guardar los datos. ${error.message}`);
    }
    setEditando(false);
    setAviso("Datos fiscales guardados.");
    cargar();
  }

  if (empresa === null) notFound();
  if (empresa === undefined) return null;

  const faltan = faltaParaFacturar(empresa);
  const dir = direccionCompleta({ direccion_fiscal: empresa.direccion_fiscal ?? null, codigo_postal: empresa.codigo_postal ?? null, ciudad: empresa.ciudad ?? null, pais: empresa.pais ?? "España" });
  const datos: [string, string | null | undefined][] = [
    ["Razón social", empresa.razon_social], ["NIF/CIF", empresa.nif], ["Dirección fiscal", dir || null],
    ["Correo de facturación", empresa.email_facturacion], ["Teléfono", empresa.telefono],
    ["Plazo de pago", empresa.dias_pago === undefined ? null : empresa.dias_pago === 0 ? "Al contado" : `${empresa.dias_pago} días`],
  ];

  return (
    <>
      <Link href="/crm/empresas" className="volver">← Empresas</Link>
      <div className="detalle-cab">
        <span className="icono-empresa grande" aria-hidden>🏢</span>
        <div>
          <h1>{empresa.nombre}</h1>
          <p className="ubicacion">📍 {empresa.ubicacion}</p>
        </div>
      </div>

      <h2 className="subtitulo">Datos fiscales</h2>
      <section className="ventas-fiscal" aria-label="Datos fiscales de la empresa">
        <dl>
          {datos.map(([t, v]) => (
            <div key={t}><dt>{t}</dt><dd>{v || <span className="ventas-falta">Sin indicar</span>}</dd></div>
          ))}
        </dl>
        {faltan.length > 0 && (
          <p className="ventas-aviso-fiscal">Para poder facturar a esta empresa falta: {faltan.join(", ")}.</p>
        )}
        <button type="button" className="btn peq" onClick={() => { setError(""); setAviso(""); setEditando(true); }}>Editar datos fiscales</button>
        <p className="aviso" role="status" data-tipo="ok">{editando ? "" : aviso}</p>
      </section>

      <Modal abierto={editando} titulo="Datos fiscales" onCerrar={() => setEditando(false)}>
        {editando && (
          <form className="form plano ventas-form" onSubmit={guardarFiscales}>
            <label>Razón social<input name="razon_social" maxLength={160} defaultValue={empresa.razon_social ?? ""} /></label>
            <div className="fila">
              <label>NIF/CIF<input name="nif" minLength={5} maxLength={20} defaultValue={empresa.nif ?? ""} autoComplete="off" /></label>
              <label>Plazo de pago (días)
                <input name="dias_pago" type="number" required min={0} max={120} defaultValue={empresa.dias_pago ?? 30} />
              </label>
            </div>
            <label>Dirección fiscal<input name="direccion_fiscal" maxLength={200} defaultValue={empresa.direccion_fiscal ?? ""} autoComplete="street-address" /></label>
            <div className="fila">
              <label>Código postal<input name="codigo_postal" minLength={4} maxLength={10} defaultValue={empresa.codigo_postal ?? ""} autoComplete="postal-code" /></label>
              <label>Ciudad<input name="ciudad" maxLength={100} defaultValue={empresa.ciudad ?? ""} /></label>
            </div>
            <div className="fila">
              <label>País<input name="pais" required minLength={2} maxLength={60} defaultValue={empresa.pais ?? "España"} /></label>
              <label>Teléfono<input name="telefono" type="tel" minLength={5} maxLength={30} defaultValue={empresa.telefono ?? ""} autoComplete="tel" /></label>
            </div>
            <label>Correo de facturación<input name="email_facturacion" type="email" maxLength={160} defaultValue={empresa.email_facturacion ?? ""} /></label>
            <button className="btn">Guardar datos fiscales</button>
            <p className="aviso" role="alert" data-tipo="error">{error}</p>
          </form>
        )}
      </Modal>

      <h2 className="subtitulo">Empleados ({equipo.length})</h2>
      <div className="grid-tarjetas">
        {equipo.map((m) => (
          <Link key={m.id} href={`/crm/empleados/${m.id}`} className="tarjeta tarjeta-empleado">
            <span className="avatar grande" style={{ background: colorDe(m.id) }}>{iniciales(m.nombre)}</span>
            <div>
              <h3>{m.nombre}</h3>
              <p className="correo">{m.email}</p>
              <span className="chip" data-vacio={!m.oportunidad}>
                {m.oportunidad ? `${m.oportunidad.servicio} · ${m.oportunidad.estado}` : "Sin oportunidad"}
              </span>
            </div>
          </Link>
        ))}
      </div>
      {equipo.length === 0 && <p className="vacio">Esta empresa aún no tiene empleados asociados.</p>}
    </>
  );
}
