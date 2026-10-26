"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { notFound, useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Empresa } from "@/lib/tipos";
import {
  DatosFiscales, Servicio, TIPOS_IVA, UNIDADES, Unidad, direccionCompleta, eur, faltaParaFacturar,
} from "@/lib/ventas/base";
import {
  Linea, Presupuesto, baseLinea, fechaCorta, lineaVacia, mensajeError, totales,
} from "@/lib/ventas/presupuestos";
import Modal from "../../../Modal";
import { usePerfil } from "../../../PerfilContext";
import Estado from "../../Estado";

type Detalle = Presupuesto & {
  empresa: (Empresa & Partial<DatosFiscales>) | null;
  oportunidad: { id: string; nombre: string; servicio: string } | null;
  vendedor: { nombre: string } | null;
};
type Accion = "aceptar" | "rechazar" | "eliminar";

const CONFIRMACION: Record<Accion, { titulo: string; texto: (total: string) => string; boton: string }> = {
  aceptar: {
    titulo: "Aceptar presupuesto", boton: "Marcar como aceptado",
    texto: (t) => `La oportunidad pasará a «ganada» con un valor de ${t} y el presupuesto ya no se podrá modificar.`,
  },
  rechazar: {
    titulo: "Rechazar presupuesto", boton: "Marcar como rechazado",
    texto: () => "Se marcará como rechazado por el cliente. Podrás volver a abrirlo como borrador.",
  },
  eliminar: {
    titulo: "Eliminar borrador", boton: "Eliminar",
    texto: () => "El borrador se borrará definitivamente. Esta acción no se puede deshacer.",
  },
};

const num = (v: string) => (v === "" ? NaN : Number(v));
const valor = (n: number) => (Number.isNaN(n) ? "" : n);

export default function EditorPresupuesto() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { es_finanzas } = usePerfil();
  const [factura, setFactura] = useState<{ id: string; numero: string | null; estado: string } | null>(null);
  const [p, setP] = useState<Detalle | null | undefined>(undefined);
  const [catalogo, setCatalogo] = useState<Servicio[]>([]);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [fecha, setFecha] = useState("");
  const [validez, setValidez] = useState("");
  const [notas, setNotas] = useState("");
  const [sucio, setSucio] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [confirmar, setConfirmar] = useState<Accion | null>(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  const cargar = useCallback(async () => {
    const [pr, ls, sv] = await Promise.all([
      supabase.from("presupuestos")
        .select("*, empresa:empresas(*), oportunidad:oportunidades(id,nombre,servicio), vendedor:empleados(nombre)")
        .eq("id", id).maybeSingle(),
      supabase.from("lineas_presupuesto").select("*").eq("presupuesto_id", id).order("orden"),
      supabase.from("servicios").select("*").eq("activo", true).order("nombre"),
    ]);
    const d = (pr.data as unknown as Detalle | null) ?? null;
    setP(d);
    if (!d) return;
    // Factura "viva" de este presupuesto, si existe (la migración de facturación puede no estar aplicada: entonces no hay)
    const fa = await supabase.from("facturas").select("id,numero,estado").eq("presupuesto_id", id)
      .eq("tipo", "ordinaria").neq("estado", "anulada").maybeSingle();
    setFactura((fa.data as { id: string; numero: string | null; estado: string } | null) ?? null);
    setFecha(d.fecha); setValidez(d.validez_hasta); setNotas(d.notas ?? "");
    setLineas(((ls.data as Omit<Linea, "clave">[]) ?? []).map((l) => ({
      clave: crypto.randomUUID(), servicio_id: l.servicio_id, descripcion: l.descripcion, cantidad: Number(l.cantidad),
      unidad: l.unidad, precio_unitario: Number(l.precio_unitario), descuento_pct: Number(l.descuento_pct), tipo_iva: Number(l.tipo_iva),
    })));
    setCatalogo((sv.data as Servicio[]) ?? []);
    setSucio(false);
  }, [id]);
  useEffect(() => { cargar(); }, [cargar]);

  // Avisa si se intenta cerrar la pestaña con cambios sin guardar
  useEffect(() => {
    if (!sucio) return;
    const f = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", f);
    return () => window.removeEventListener("beforeunload", f);
  }, [sucio]);

  const tot = useMemo(() => totales(lineas), [lineas]);

  if (p === null) notFound();
  if (p === undefined) return null;

  const editable = p.estado === "borrador";
  const empresa = p.empresa;
  const faltan = empresa ? faltaParaFacturar(empresa) : [];

  function cambiar(clave: string, parche: Partial<Linea>) {
    setLineas((prev) => prev.map((l) => (l.clave === clave ? { ...l, ...parche } : l)));
    setSucio(true);
  }
  function quitar(clave: string) {
    setLineas((prev) => prev.filter((l) => l.clave !== clave));
    setSucio(true);
  }
  function anadirDelCatalogo(servicioId: string) {
    const s = catalogo.find((x) => x.id === servicioId);
    if (!s) return;
    setLineas((prev) => [...prev, {
      ...lineaVacia(), servicio_id: s.id, descripcion: s.nombre, unidad: s.unidad,
      precio_unitario: Number(s.precio_unitario), tipo_iva: Number(s.tipo_iva),
    }]);
    setSucio(true);
  }

  // Misma validación que la base de datos, pero con mensajes que dicen qué línea falla
  function validar(): string {
    if (!fecha || !validez) return "Indica la fecha del presupuesto y hasta cuándo es válido.";
    if (validez < fecha) return "La fecha de validez no puede ser anterior a la fecha del presupuesto.";
    for (const [i, l] of lineas.entries()) {
      const n = i + 1;
      if (!l.descripcion.trim()) return `La línea ${n} necesita una descripción.`;
      if (!(l.cantidad >= 0.01 && l.cantidad <= 100000)) return `La cantidad de la línea ${n} debe estar entre 0,01 y 100.000.`;
      if (!(l.precio_unitario >= 0 && l.precio_unitario <= 1000000)) return `El precio de la línea ${n} debe estar entre 0 y 1.000.000 €.`;
      if (!(l.descuento_pct >= 0 && l.descuento_pct <= 100)) return `El descuento de la línea ${n} debe estar entre 0 y 100 %.`;
    }
    return "";
  }

  async function guardar(): Promise<boolean> {
    const msg = validar();
    if (msg) { setError(msg); setAviso(""); return false; }
    setOcupado(true); setError("");
    const { error } = await supabase.rpc("guardar_presupuesto", {
      p_id: id, p_fecha: fecha, p_validez: validez, p_notas: notas,
      p_lineas: lineas.map(({ clave: _clave, ...l }) => l),
    });
    setOcupado(false);
    if (error) { setError(mensajeError(error)); setAviso(""); return false; }
    await cargar();
    setAviso("Cambios guardados.");
    return true;
  }

  async function pasarA(estado: string, mensaje: string) {
    if (editable && sucio && !(await guardar())) { setConfirmar(null); return; }
    setOcupado(true); setError("");
    const { error } = await supabase.rpc("cambiar_estado_presupuesto", { p_id: id, p_estado: estado });
    setOcupado(false); setConfirmar(null);
    if (error) { setError(mensajeError(error)); setAviso(""); return; }
    await cargar();
    setAviso(mensaje);
  }

  async function eliminar() {
    setOcupado(true); setError("");
    const { data, error } = await supabase.from("presupuestos").delete().eq("id", id).select("id");
    setOcupado(false); setConfirmar(null);
    if (error || !data?.length) return setError("No se pudo eliminar el presupuesto. Solo se pueden borrar los borradores.");
    setSucio(false);
    router.push("/crm/ventas/presupuestos");
  }

  async function crearFactura() {
    setOcupado(true); setError("");
    const { data, error } = await supabase.rpc("crear_factura_desde_presupuesto", { p_presupuesto_id: id });
    setOcupado(false);
    if (error) return setError(mensajeError(error));
    router.push(`/crm/ventas/facturas/${data as string}`);
  }

  function ejecutarConfirmacion() {
    if (confirmar === "aceptar") pasarA("aceptado", "Presupuesto aceptado. La oportunidad se ha marcado como ganada.");
    if (confirmar === "rechazar") pasarA("rechazado", "Presupuesto marcado como rechazado.");
    if (confirmar === "eliminar") eliminar();
  }

  const situacion: Record<Presupuesto["estado"], string> = {
    borrador: "Borrador: edítalo y envíalo cuando esté listo.",
    enviado: `Enviado el ${fechaCorta(p.enviado_en)}. A la espera de la respuesta del cliente.`,
    aceptado: `Aceptado el ${fechaCorta(p.resuelto_en)}. Ya no se puede modificar.`,
    rechazado: `Rechazado el ${fechaCorta(p.resuelto_en)}. Puedes reabrirlo como borrador para renegociar.`,
    caducado: `Caducó el ${fechaCorta(p.validez_hasta)}. Reábrelo como borrador para ampliar la validez.`,
  };

  return (
    <>
      <Link href="/crm/ventas/presupuestos" className="volver">← Presupuestos</Link>

      <div className="ventas-pantalla">
        <header className="ventas-cab-doc">
          <div>
            <h2>{p.numero} <Estado estado={p.estado} /></h2>
            <p className="ventas-contexto">
              Cliente: {empresa ? <Link href={`/crm/empresas/${empresa.id}`}>{empresa.nombre}</Link> : "—"}
              {p.oportunidad && <> · Oportunidad: <Link href="/crm">{p.oportunidad.nombre}</Link></>}
              {p.vendedor && <> · Vendedor: {p.vendedor.nombre}</>}
            </p>
            <p className="ventas-situacion">{situacion[p.estado]}</p>
            {p.estado === "aceptado" && (
              <p className="ventas-situacion">
                {factura
                  ? <>Factura: <Link href={`/crm/ventas/facturas/${factura.id}`}>{factura.numero ?? "borrador de factura"}</Link></>
                  : es_finanzas
                    ? <button type="button" className="btn peq" disabled={ocupado} onClick={crearFactura}>Crear factura</button>
                    : "Pendiente de facturar por finanzas."}
              </p>
            )}
          </div>
        </header>

        {faltan.length > 0 && ["borrador", "enviado", "aceptado"].includes(p.estado) && empresa && (
          <p className="ventas-aviso-fiscal">
            Para facturar a este cliente faltan datos fiscales: {faltan.join(", ")}.{" "}
            <Link href={`/crm/empresas/${empresa.id}`}>Completarlos</Link>
          </p>
        )}

        <fieldset className="ventas-datos" disabled={!editable}>
          <legend className="ventas-solo-lectores">Datos del presupuesto</legend>
          <label>Fecha
            <input type="date" required value={fecha} onChange={(e) => { setFecha(e.target.value); setSucio(true); }} />
          </label>
          <label>Válido hasta
            <input type="date" required min={fecha} value={validez} onChange={(e) => { setValidez(e.target.value); setSucio(true); }} />
          </label>
          <label className="ancho">Notas para el cliente (opcional)
            <textarea maxLength={2000} value={notas} onChange={(e) => { setNotas(e.target.value); setSucio(true); }} />
          </label>
        </fieldset>

        <h3 className="subtitulo">Líneas</h3>
        {editable && (
          <div className="ventas-barra">
            <label className="ventas-filtro">Añadir servicio del catálogo
              <select value="" onChange={(e) => anadirDelCatalogo(e.target.value)}>
                <option value="">Elige un servicio…</option>
                {catalogo.map((s) => <option key={s.id} value={s.id}>{s.codigo} · {s.nombre} ({eur(Number(s.precio_unitario))})</option>)}
              </select>
            </label>
            <button type="button" className="btn peq" onClick={() => { setLineas((prev) => [...prev, lineaVacia()]); setSucio(true); }}>
              Añadir línea libre
            </button>
          </div>
        )}

        {lineas.length === 0 ? (
          <p className="vacio">{editable ? "Este presupuesto aún no tiene líneas. Añade un servicio del catálogo o una línea libre." : "Este presupuesto no tiene líneas."}</p>
        ) : (
          <div className="tabla ventas-tabla ventas-lineas">
            <table>
              <caption className="ventas-solo-lectores">Líneas del presupuesto {p.numero}</caption>
              <thead>
                <tr>
                  <th scope="col">Descripción</th><th scope="col" className="num">Cantidad</th><th scope="col">Unidad</th>
                  <th scope="col" className="num">Precio (€)</th><th scope="col" className="num">Dto. (%)</th>
                  <th scope="col" className="num">IVA</th><th scope="col" className="num">Importe</th>
                  {editable && <th scope="col"><span className="ventas-solo-lectores">Quitar</span></th>}
                </tr>
              </thead>
              <tbody>
                {lineas.map((l, i) => {
                  const n = i + 1;
                  return (
                    <tr key={l.clave}>
                      <td>{editable
                        ? <input className="desc" value={l.descripcion} maxLength={300} aria-label={`Descripción de la línea ${n}`}
                            onChange={(e) => cambiar(l.clave, { descripcion: e.target.value })} />
                        : l.descripcion}</td>
                      <td className="num">{editable
                        ? <input type="number" min={0.01} max={100000} step="0.01" value={valor(l.cantidad)} aria-label={`Cantidad de la línea ${n}`}
                            onChange={(e) => cambiar(l.clave, { cantidad: num(e.target.value) })} />
                        : l.cantidad.toLocaleString("es-ES")}</td>
                      <td>{editable
                        ? <select value={l.unidad} aria-label={`Unidad de la línea ${n}`}
                            onChange={(e) => cambiar(l.clave, { unidad: e.target.value as Unidad })}>
                            {UNIDADES.map((u) => <option key={u}>{u}</option>)}
                          </select>
                        : l.unidad}</td>
                      <td className="num">{editable
                        ? <input type="number" min={0} max={1000000} step="0.01" value={valor(l.precio_unitario)} aria-label={`Precio unitario de la línea ${n}, en euros`}
                            onChange={(e) => cambiar(l.clave, { precio_unitario: num(e.target.value) })} />
                        : eur(l.precio_unitario)}</td>
                      <td className="num">{editable
                        ? <input type="number" min={0} max={100} step="0.01" value={valor(l.descuento_pct)} aria-label={`Descuento de la línea ${n}, en porcentaje`}
                            onChange={(e) => cambiar(l.clave, { descuento_pct: num(e.target.value) })} />
                        : `${l.descuento_pct.toLocaleString("es-ES")} %`}</td>
                      <td className="num">{editable
                        ? <select value={l.tipo_iva} aria-label={`IVA de la línea ${n}`}
                            onChange={(e) => cambiar(l.clave, { tipo_iva: Number(e.target.value) })}>
                            {TIPOS_IVA.map((t) => <option key={t} value={t}>{t} %</option>)}
                          </select>
                        : `${l.tipo_iva} %`}</td>
                      <td className="num"><b>{eur(baseLinea(l) / 100)}</b></td>
                      {editable && (
                        <td><div className="acciones">
                          <button type="button" onClick={() => quitar(l.clave)} aria-label={`Quitar la línea ${n}: ${l.descripcion || "sin descripción"}`}>Quitar</button>
                        </div></td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <dl className="ventas-totales" aria-label="Totales del presupuesto">
          <div><dt>Base imponible</dt><dd>{eur(tot.base)}</dd></div>
          {tot.desglose.map((d) => (
            <div key={d.tipo}><dt>IVA {d.tipo} % <span className="sub">sobre {eur(d.base)}</span></dt><dd>{eur(d.iva)}</dd></div>
          ))}
          <div className="total"><dt>Total</dt><dd>{eur(tot.total)}</dd></div>
        </dl>

        <p className="aviso" role="alert" data-tipo="error">{error}</p>
        <p className="aviso" role="status" data-tipo="ok">{aviso}</p>

        <div className="ventas-acciones">
          {editable && <>
            <button type="button" className="btn" disabled={ocupado || !sucio} onClick={guardar}>Guardar cambios</button>
            <button type="button" className="btn sec" disabled={ocupado}
              onClick={() => pasarA("enviado", "Presupuesto marcado como enviado.")}>Marcar como enviado</button>
            <button type="button" className="btn sec" disabled={ocupado} onClick={() => { setError(""); setConfirmar("eliminar"); }}>Eliminar borrador</button>
          </>}
          {p.estado === "enviado" && <>
            <button type="button" className="btn" disabled={ocupado} onClick={() => { setError(""); setConfirmar("aceptar"); }}>Aceptar</button>
            <button type="button" className="btn sec" disabled={ocupado} onClick={() => { setError(""); setConfirmar("rechazar"); }}>Rechazar</button>
          </>}
          {["enviado", "caducado", "rechazado"].includes(p.estado) &&
            <button type="button" className="btn sec" disabled={ocupado}
              onClick={() => pasarA("borrador", "El presupuesto vuelve a ser un borrador.")}>Volver a borrador</button>}
          <button type="button" className="btn sec" disabled={sucio} onClick={() => window.print()}
            title={sucio ? "Guarda los cambios antes de imprimir" : undefined}>Imprimir / PDF</button>
        </div>
      </div>

      <Modal abierto={confirmar !== null} titulo={confirmar ? CONFIRMACION[confirmar].titulo : ""} onCerrar={() => setConfirmar(null)}>
        {confirmar && (
          <div className="ventas-form">
            <p>{CONFIRMACION[confirmar].texto(eur(tot.total))}</p>
            <div className="ventas-acciones">
              <button type="button" className="btn" disabled={ocupado} onClick={ejecutarConfirmacion}>{CONFIRMACION[confirmar].boton}</button>
              <button type="button" className="btn sec" onClick={() => setConfirmar(null)}>Cancelar</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Documento para imprimir o guardar como PDF: en pantalla está oculto */}
      <section className="ventas-impresion" aria-hidden="true">
        <div className="imp-cab">
          <div><b className="imp-marca">Meridiano Logística</b></div>
          <div className="imp-num"><b>PRESUPUESTO</b><span>{p.numero}</span></div>
        </div>
        <div className="imp-bloques">
          <div>
            <b>Cliente</b>
            <span>{empresa?.razon_social || empresa?.nombre}</span>
            {empresa?.nif && <span>NIF/CIF: {empresa.nif}</span>}
            <span>{empresa?.direccion_fiscal
              ? direccionCompleta({ direccion_fiscal: empresa.direccion_fiscal, codigo_postal: empresa.codigo_postal ?? null,
                  ciudad: empresa.ciudad ?? null, pais: empresa.pais ?? "España" })
              : empresa?.ubicacion}</span>
          </div>
          <div>
            <b>Fecha:</b> {fechaCorta(p.fecha)}<br />
            <b>Válido hasta:</b> {fechaCorta(p.validez_hasta)}<br />
            {p.vendedor && <><b>Atendido por:</b> {p.vendedor.nombre}</>}
          </div>
        </div>
        <table>
          <thead><tr><th>Descripción</th><th>Cant.</th><th>Precio</th><th>Dto.</th><th>IVA</th><th>Importe</th></tr></thead>
          <tbody>
            {lineas.map((l) => (
              <tr key={l.clave}>
                <td>{l.descripcion}</td>
                <td>{l.cantidad.toLocaleString("es-ES")} {l.unidad}</td>
                <td>{eur(l.precio_unitario)}</td>
                <td>{l.descuento_pct ? `${l.descuento_pct.toLocaleString("es-ES")} %` : "—"}</td>
                <td>{l.tipo_iva} %</td>
                <td>{eur(baseLinea(l) / 100)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="imp-totales">
          <div><dt>Base imponible</dt><dd>{eur(tot.base)}</dd></div>
          {tot.desglose.map((d) => <div key={d.tipo}><dt>IVA {d.tipo} %</dt><dd>{eur(d.iva)}</dd></div>)}
          <div className="total"><dt>Total</dt><dd>{eur(tot.total)}</dd></div>
        </dl>
        {notas && <p className="imp-notas"><b>Notas:</b> {notas}</p>}
        {empresa?.dias_pago !== undefined && <p className="imp-notas">Plazo de pago: {empresa.dias_pago === 0 ? "al contado" : `${empresa.dias_pago} días`}.</p>}
      </section>
    </>
  );
}
