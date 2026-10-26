"use client";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { notFound, useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Empresa } from "@/lib/tipos";
import { DatosFiscales, Servicio, TIPOS_IVA, UNIDADES, Unidad, direccionCompleta, eur, faltaParaFacturar } from "@/lib/ventas/base";
import {
  DatosEmisor, FORMAS_PAGO, Factura, METODOS_COBRO, Pago, diasHasta, estadoVisible, faltaEmisor, pendiente,
} from "@/lib/ventas/facturas";
import { Linea, baseLinea, fechaCorta, hoyISO, lineaVacia, mensajeError, totales } from "@/lib/ventas/presupuestos";
import Modal from "../../../Modal";
import { usePerfil } from "../../../PerfilContext";
import EstadoFactura from "../../EstadoFactura";

type Detalle = Factura & {
  empresa: (Empresa & Partial<DatosFiscales>) | null;
  presupuesto: { id: string; numero: string } | null;
};
type Enlace = { id: string; numero: string | null };
type Accion = "emitir" | "anular" | "cobro" | "eliminar" | null;

const num = (v: string) => (v === "" ? NaN : Number(v));
const valor = (n: number) => (Number.isNaN(n) ? "" : n);

export default function DetalleFactura() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { es_finanzas } = usePerfil();
  const [f, setF] = useState<Detalle | null | undefined>(undefined);
  const [emisor, setEmisor] = useState<DatosEmisor | null>(null);
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [catalogo, setCatalogo] = useState<Servicio[]>([]);
  const [original, setOriginal] = useState<Enlace | null>(null);        // factura que corrige esta rectificativa
  const [rectificativa, setRectificativa] = useState<Enlace | null>(null);   // rectificativa que anula esta factura
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [dias, setDias] = useState(30);
  const [forma, setForma] = useState<string>("transferencia");
  const [notas, setNotas] = useState("");
  const [sucio, setSucio] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [accion, setAccion] = useState<Accion>(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const hoy = hoyISO();

  const cargar = useCallback(async () => {
    const [fr, ls, pg, em, sv] = await Promise.all([
      supabase.from("facturas").select("*, empresa:empresas(*), presupuesto:presupuestos(id,numero)").eq("id", id).maybeSingle(),
      supabase.from("lineas_factura").select("*").eq("factura_id", id).order("orden"),
      supabase.from("pagos").select("*").eq("factura_id", id).order("fecha").order("created_at"),
      supabase.from("datos_emisor").select("*").maybeSingle(),
      supabase.from("servicios").select("*").eq("activo", true).order("nombre"),
    ]);
    const d = (fr.data as unknown as Detalle | null) ?? null;
    setF(d);
    if (!d) return;
    setDias(d.dias_pago); setForma(d.forma_pago); setNotas(d.notas ?? "");
    setLineas(((ls.data as Omit<Linea, "clave">[]) ?? []).map((l) => ({
      clave: crypto.randomUUID(), servicio_id: l.servicio_id, descripcion: l.descripcion, cantidad: Number(l.cantidad),
      unidad: l.unidad, precio_unitario: Number(l.precio_unitario), descuento_pct: Number(l.descuento_pct), tipo_iva: Number(l.tipo_iva),
    })));
    setPagos((pg.data as Pago[]) ?? []);
    setEmisor((em.data as DatosEmisor | null) ?? null);
    setCatalogo((sv.data as Servicio[]) ?? []);
    // Enlaces entre una factura y su rectificativa (en los dos sentidos)
    const [o, r] = await Promise.all([
      d.rectifica_id ? supabase.from("facturas").select("id,numero").eq("id", d.rectifica_id).maybeSingle() : Promise.resolve({ data: null }),
      d.tipo === "ordinaria" ? supabase.from("facturas").select("id,numero").eq("rectifica_id", d.id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    setOriginal((o.data as Enlace | null) ?? null);
    setRectificativa((r.data as Enlace | null) ?? null);
    setSucio(false);
  }, [id]);
  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    if (!sucio) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [sucio]);

  const tot = useMemo(() => totales(lineas), [lineas]);

  if (f === null) notFound();
  if (f === undefined) return null;

  const editable = f.estado === "borrador" && es_finanzas;
  const emitida = f.estado !== "borrador";
  const visible = estadoVisible(f, hoy);
  const empresa = f.empresa;
  const pend = pendiente(f);
  const faltanCliente = !emitida && empresa ? faltaParaFacturar(empresa) : [];
  const faltanEmisor = !emitida ? faltaEmisor(emisor) : [];
  const esRect = f.tipo === "rectificativa";

  function cambiar(clave: string, parche: Partial<Linea>) {
    setLineas((prev) => prev.map((l) => (l.clave === clave ? { ...l, ...parche } : l)));
    setSucio(true);
  }
  function anadirDelCatalogo(servicioId: string) {
    const s = catalogo.find((x) => x.id === servicioId);
    if (!s) return;
    setLineas((prev) => [...prev, { ...lineaVacia(), servicio_id: s.id, descripcion: s.nombre, unidad: s.unidad,
      precio_unitario: Number(s.precio_unitario), tipo_iva: Number(s.tipo_iva) }]);
    setSucio(true);
  }

  function validar(): string {
    if (!(dias >= 0 && dias <= 120)) return "El plazo de pago debe estar entre 0 y 120 días.";
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
    const { error } = await supabase.rpc("guardar_factura", {
      p_id: id, p_dias_pago: dias, p_forma_pago: forma, p_notas: notas,
      p_lineas: lineas.map(({ clave: _clave, ...l }) => l),
    });
    setOcupado(false);
    if (error) { setError(mensajeError(error)); setAviso(""); return false; }
    await cargar(); setAviso("Cambios guardados.");
    return true;
  }

  async function ejecutar(fn: string, args: Record<string, unknown>, mensaje: string) {
    setOcupado(true); setError("");
    const r = await supabase.rpc(fn, args);
    setOcupado(false);
    if (r.error) { setError(mensajeError(r.error)); setAviso(""); return null; }
    setAccion(null);
    await cargar(); setAviso(mensaje);
    return r.data;
  }

  async function emitir() {
    if (sucio && !(await guardar())) { setAccion(null); return; }
    const numero = await ejecutar("emitir_factura", { p_id: id }, "");
    if (numero) setAviso(`Factura emitida con el número ${numero}.`); else setAccion(null);
  }
  async function anular(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const motivo = String(new FormData(e.currentTarget).get("motivo")).trim();
    const rid = await ejecutar("anular_factura", { p_id: id, p_motivo: motivo }, "Factura anulada. Se ha emitido la rectificativa correspondiente.");
    if (rid) router.push(`/crm/ventas/facturas/${rid as string}`);
  }
  async function cobrar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    await ejecutar("registrar_pago", {
      p_factura_id: id, p_fecha: String(d.get("fecha")), p_importe: Number(d.get("importe")),
      p_metodo: String(d.get("metodo")), p_referencia: String(d.get("referencia")).trim() || null,
    }, "Cobro registrado.");
  }
  async function quitarPago(p: Pago) {
    await ejecutar("eliminar_pago", { p_pago_id: p.id }, "Cobro eliminado.");
  }
  async function eliminar() {
    setOcupado(true); setError("");
    const { data, error } = await supabase.from("facturas").delete().eq("id", id).select("id");
    setOcupado(false); setAccion(null);
    if (error || !data?.length) return setError("No se pudo eliminar. Solo finanzas puede borrar borradores.");
    setSucio(false);
    router.push("/crm/ventas/facturas");
  }

  // En borrador se muestran los datos actuales; al emitir quedan copiados y ya no cambian
  const cliente = emitida
    ? { nombre: f.cliente_nombre, nif: f.cliente_nif, dir: f.cliente_direccion, email: f.cliente_email }
    : { nombre: empresa?.razon_social || empresa?.nombre || null, nif: empresa?.nif ?? null,
        dir: empresa?.direccion_fiscal ? direccionCompleta({ direccion_fiscal: empresa.direccion_fiscal, codigo_postal: empresa.codigo_postal ?? null,
          ciudad: empresa.ciudad ?? null, pais: empresa.pais ?? "España" }) : null,
        email: empresa?.email_facturacion ?? null };
  const em = emitida
    ? { nombre: f.emisor_nombre, nif: f.emisor_nif, dir: f.emisor_direccion, email: f.emisor_email, iban: f.emisor_iban, pie: f.emisor_pie }
    : { nombre: emisor?.razon_social ?? null, nif: emisor?.nif ?? null,
        dir: emisor?.direccion ? [emisor.direccion, `${emisor.codigo_postal ?? ""} ${emisor.ciudad ?? ""}`.trim(), emisor.pais].filter(Boolean).join(", ") : null,
        email: emisor?.email ?? null, iban: emisor?.iban ?? null, pie: emisor?.texto_pie ?? null };

  const venc = f.fecha_vencimiento && !esRect ? diasHasta(f.fecha_vencimiento, hoy) : null;

  return (
    <>
      <Link href="/crm/ventas/facturas" className="volver">← Facturas</Link>

      <div className="ventas-pantalla">
        <header className="ventas-cab-doc">
          <h2>
            {esRect ? "Rectificativa " : "Factura "}{f.numero ?? "(borrador)"} <EstadoFactura estado={visible} />
          </h2>
          <p className="ventas-contexto">
            Cliente: {empresa ? <Link href={`/crm/empresas/${empresa.id}`}>{empresa.nombre}</Link> : "—"}
            {f.presupuesto && <> · Presupuesto: <Link href={`/crm/ventas/presupuestos/${f.presupuesto.id}`}>{f.presupuesto.numero}</Link></>}
            {original && <> · Rectifica la factura <Link href={`/crm/ventas/facturas/${original.id}`}>{original.numero}</Link></>}
            {rectificativa && <> · Anulada por <Link href={`/crm/ventas/facturas/${rectificativa.id}`}>{rectificativa.numero}</Link></>}
          </p>
          {esRect && f.motivo && <p className="ventas-situacion">Motivo: {f.motivo}</p>}
        </header>

        {emitida && (
          <dl className="ventas-resumen">
            <div><dt>Fecha de emisión</dt><dd>{fechaCorta(f.fecha_emision)}</dd></div>
            {!esRect && <div><dt>Vencimiento</dt><dd>{fechaCorta(f.fecha_vencimiento)}
              {pend > 0 && venc !== null && <span className="sub">{venc < 0 ? `Vencida hace ${-venc} ${venc === -1 ? "día" : "días"}` : venc === 0 ? "Vence hoy" : `Vence en ${venc} ${venc === 1 ? "día" : "días"}`}</span>}
            </dd></div>}
            {!esRect && <div><dt>Cobrado</dt><dd>{eur(f.pagado)}</dd></div>}
            {!esRect && <div><dt>Pendiente</dt><dd>{eur(f.estado === "anulada" ? 0 : f.total - f.pagado)}</dd></div>}
          </dl>
        )}

        {(faltanCliente.length > 0 || faltanEmisor.length > 0) && (
          <p className="ventas-aviso-fiscal">
            Para emitir esta factura faltan datos:
            {faltanCliente.length > 0 && <> del cliente ({faltanCliente.join(", ")}) — <Link href={`/crm/empresas/${f.empresa_id}`}>completarlos</Link></>}
            {faltanCliente.length > 0 && faltanEmisor.length > 0 && ";"}
            {faltanEmisor.length > 0 && <> de vuestra empresa ({faltanEmisor.join(", ")}) — <Link href="/crm/ventas/facturas">completarlos</Link></>}.
          </p>
        )}

        <div className="ventas-partes">
          <section aria-label="Emisor"><h3>Emisor</h3>
            <b>{em.nombre ?? "—"}</b>{em.nif && <span>NIF: {em.nif}</span>}{em.dir && <span>{em.dir}</span>}{em.email && <span>{em.email}</span>}
          </section>
          <section aria-label="Cliente"><h3>Cliente</h3>
            <b>{cliente.nombre ?? "—"}</b>{cliente.nif && <span>NIF/CIF: {cliente.nif}</span>}{cliente.dir && <span>{cliente.dir}</span>}{cliente.email && <span>{cliente.email}</span>}
          </section>
        </div>

        {!esRect && (
          <fieldset className="ventas-datos" disabled={!editable}>
            <legend className="ventas-solo-lectores">Condiciones de pago</legend>
            <label>Plazo de pago (días)
              <input type="number" min={0} max={120} required value={valor(dias)} onChange={(e) => { setDias(num(e.target.value)); setSucio(true); }} />
            </label>
            <label>Forma de pago
              <select value={forma} onChange={(e) => { setForma(e.target.value); setSucio(true); }}>
                {FORMAS_PAGO.map((x) => <option key={x}>{x}</option>)}
              </select>
            </label>
            <label className="ancho">Notas (opcional)
              <textarea maxLength={2000} value={notas} onChange={(e) => { setNotas(e.target.value); setSucio(true); }} />
            </label>
            {editable && <p className="ayuda ancho">La fecha de emisión y el vencimiento se fijan al emitir: hoy + {Number.isNaN(dias) ? "…" : dias} días.</p>}
          </fieldset>
        )}

        <h3 className="subtitulo">Líneas</h3>
        {editable && (
          <div className="ventas-barra">
            <label className="ventas-filtro">Añadir servicio del catálogo
              <select value="" onChange={(e) => anadirDelCatalogo(e.target.value)}>
                <option value="">Elige un servicio…</option>
                {catalogo.map((s) => <option key={s.id} value={s.id}>{s.codigo} · {s.nombre} ({eur(Number(s.precio_unitario))})</option>)}
              </select>
            </label>
            <button type="button" className="btn peq" onClick={() => { setLineas((p) => [...p, lineaVacia()]); setSucio(true); }}>Añadir línea libre</button>
          </div>
        )}

        {lineas.length === 0 ? (
          <p className="vacio">Esta factura no tiene líneas.</p>
        ) : (
          <div className="tabla ventas-tabla ventas-lineas">
            <table>
              <caption className="ventas-solo-lectores">Líneas de la factura {f.numero ?? "en borrador"}</caption>
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
                        ? <select value={l.unidad} aria-label={`Unidad de la línea ${n}`} onChange={(e) => cambiar(l.clave, { unidad: e.target.value as Unidad })}>
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
                        ? <select value={l.tipo_iva} aria-label={`IVA de la línea ${n}`} onChange={(e) => cambiar(l.clave, { tipo_iva: Number(e.target.value) })}>
                            {TIPOS_IVA.map((t) => <option key={t} value={t}>{t} %</option>)}
                          </select>
                        : `${l.tipo_iva} %`}</td>
                      <td className="num"><b>{eur(baseLinea(l) / 100)}</b></td>
                      {editable && <td><div className="acciones">
                        <button type="button" onClick={() => { setLineas((p) => p.filter((x) => x.clave !== l.clave)); setSucio(true); }}
                          aria-label={`Quitar la línea ${n}: ${l.descripcion || "sin descripción"}`}>Quitar</button>
                      </div></td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <dl className="ventas-totales" aria-label="Totales de la factura">
          <div><dt>Base imponible</dt><dd>{eur(tot.base)}</dd></div>
          {tot.desglose.map((d) => (
            <div key={d.tipo}><dt>IVA {d.tipo} % <span className="sub">sobre {eur(d.base)}</span></dt><dd>{eur(d.iva)}</dd></div>
          ))}
          <div className="total"><dt>Total</dt><dd>{eur(tot.total)}</dd></div>
        </dl>

        {!esRect && emitida && (
          <>
            <h3 className="subtitulo">Cobros</h3>
            {pagos.length === 0 ? <p className="vacio">Todavía no se ha registrado ningún cobro.</p> : (
              <div className="tabla ventas-tabla ventas-pagos">
                <table>
                  <caption className="ventas-solo-lectores">Cobros de la factura {f.numero}</caption>
                  <thead><tr>
                    <th scope="col">Fecha</th><th scope="col">Método</th><th scope="col">Referencia</th>
                    <th scope="col" className="num">Importe</th>
                    {es_finanzas && <th scope="col"><span className="ventas-solo-lectores">Eliminar</span></th>}
                  </tr></thead>
                  <tbody>
                    {pagos.map((p) => (
                      <tr key={p.id}>
                        <td>{fechaCorta(p.fecha)}</td><td>{p.metodo}</td><td>{p.referencia ?? "—"}</td>
                        <td className="num">{eur(p.importe)}</td>
                        {es_finanzas && <td><div className="acciones">
                          <button type="button" disabled={ocupado} onClick={() => quitarPago(p)}
                            aria-label={`Eliminar el cobro de ${eur(p.importe)} del ${fechaCorta(p.fecha)}`}>Eliminar</button>
                        </div></td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        <p className="aviso" role="alert" data-tipo="error">{accion ? "" : error}</p>
        <p className="aviso" role="status" data-tipo="ok">{aviso}</p>

        <div className="ventas-acciones">
          {editable && <>
            <button type="button" className="btn" disabled={ocupado || !sucio} onClick={guardar}>Guardar cambios</button>
            <button type="button" className="btn sec" disabled={ocupado} onClick={() => { setError(""); setAccion("emitir"); }}>Emitir factura</button>
            <button type="button" className="btn sec" disabled={ocupado} onClick={() => { setError(""); setAccion("eliminar"); }}>Eliminar borrador</button>
          </>}
          {!esRect && f.estado === "emitida" && es_finanzas && <>
            <button type="button" className="btn" disabled={ocupado} onClick={() => { setError(""); setAccion("cobro"); }}>Registrar cobro</button>
            <button type="button" className="btn sec" disabled={ocupado} onClick={() => { setError(""); setAccion("anular"); }}>Anular factura</button>
          </>}
          {!esRect && f.estado === "pagada" && es_finanzas && pagos.length > 0 &&
            <p className="ayuda">Para anular una factura pagada, elimina antes sus cobros.</p>}
          {emitida && <button type="button" className="btn sec" onClick={() => window.print()}>Imprimir / PDF</button>}
        </div>
      </div>

      {/* ---- Ventanas de confirmación ---- */}
      <Modal abierto={accion === "emitir"} titulo="Emitir factura" onCerrar={() => setAccion(null)}>
        {accion === "emitir" && (
          <div className="ventas-form">
            <p>Se asignará el siguiente número de la serie FAC y se fijarán la fecha de hoy y los datos fiscales de emisor y cliente.</p>
            <p><b>Desde ese momento la factura no se podrá modificar ni borrar.</b> Si hubiera un error, tendrás que anularla con una rectificativa.</p>
            <p>Total a facturar: <b>{eur(tot.total)}</b></p>
            <div className="ventas-acciones">
              <button type="button" className="btn" disabled={ocupado} onClick={emitir}>Emitir factura</button>
              <button type="button" className="btn sec" onClick={() => setAccion(null)}>Cancelar</button>
            </div>
            <p className="aviso" role="alert" data-tipo="error">{error}</p>
          </div>
        )}
      </Modal>

      <Modal abierto={accion === "eliminar"} titulo="Eliminar borrador" onCerrar={() => setAccion(null)}>
        {accion === "eliminar" && (
          <div className="ventas-form">
            <p>El borrador se borrará definitivamente. El presupuesto volverá a quedar pendiente de facturar.</p>
            <div className="ventas-acciones">
              <button type="button" className="btn" disabled={ocupado} onClick={eliminar}>Eliminar</button>
              <button type="button" className="btn sec" onClick={() => setAccion(null)}>Cancelar</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal abierto={accion === "anular"} titulo="Anular factura" onCerrar={() => setAccion(null)}>
        {accion === "anular" && (
          <form className="form plano ventas-form" onSubmit={anular}>
            <p>Se emitirá una <b>factura rectificativa</b> por el importe total, en negativo, y esta factura quedará anulada. No se puede deshacer.</p>
            <label>Motivo de la anulación
              <textarea name="motivo" required minLength={5} maxLength={500} />
            </label>
            <div className="ventas-acciones">
              <button className="btn" disabled={ocupado}>Anular y emitir rectificativa</button>
              <button type="button" className="btn sec" onClick={() => setAccion(null)}>Cancelar</button>
            </div>
            <p className="aviso" role="alert" data-tipo="error">{error}</p>
          </form>
        )}
      </Modal>

      <Modal abierto={accion === "cobro"} titulo="Registrar cobro" onCerrar={() => setAccion(null)}>
        {accion === "cobro" && (
          <form className="form plano ventas-form" onSubmit={cobrar}>
            <p>Pendiente de cobro: <b>{eur(f.total - f.pagado)}</b></p>
            <div className="fila">
              <label>Fecha del cobro
                <input name="fecha" type="date" required defaultValue={hoy} min={f.fecha_emision ?? undefined} max={hoy} />
              </label>
              <label>Importe (€)
                <input name="importe" type="number" required min={0.01} max={f.total - f.pagado} step="0.01" inputMode="decimal"
                  defaultValue={Math.round((f.total - f.pagado) * 100) / 100} />
              </label>
            </div>
            <div className="fila">
              <label>Método
                <select name="metodo" defaultValue={f.forma_pago}>{METODOS_COBRO.map((m) => <option key={m}>{m}</option>)}</select>
              </label>
              <label>Referencia (opcional)<input name="referencia" maxLength={100} /></label>
            </div>
            <div className="ventas-acciones">
              <button className="btn" disabled={ocupado}>Registrar cobro</button>
              <button type="button" className="btn sec" onClick={() => setAccion(null)}>Cancelar</button>
            </div>
            <p className="aviso" role="alert" data-tipo="error">{error}</p>
          </form>
        )}
      </Modal>

      {/* ---- Documento imprimible (oculto en pantalla) ---- */}
      {emitida && (
        <section className="ventas-impresion" aria-hidden="true">
          <div className="imp-cab">
            <div className="imp-emisor">
              <b className="imp-marca">{em.nombre}</b>
              {em.nif && <span>NIF: {em.nif}</span>}{em.dir && <span>{em.dir}</span>}
              {em.email && <span>{em.email}</span>}
            </div>
            <div className="imp-num"><b>{esRect ? "FACTURA RECTIFICATIVA" : "FACTURA"}</b><span>{f.numero}</span></div>
          </div>
          <div className="imp-bloques">
            <div>
              <b>Cliente</b>
              <span>{cliente.nombre}</span>{cliente.nif && <span>NIF/CIF: {cliente.nif}</span>}{cliente.dir && <span>{cliente.dir}</span>}
            </div>
            <div>
              <b>Fecha de emisión:</b> {fechaCorta(f.fecha_emision)}<br />
              {!esRect && <><b>Vencimiento:</b> {fechaCorta(f.fecha_vencimiento)}<br /></>}
              {original && <><b>Rectifica la factura:</b> {original.numero}</>}
            </div>
          </div>
          {esRect && f.motivo && <p className="imp-notas"><b>Motivo de la rectificación:</b> {f.motivo}</p>}
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
          {!esRect && <p className="imp-notas">
            <b>Forma de pago:</b> {f.forma_pago}{f.forma_pago === "transferencia" && em.iban ? ` · IBAN ${em.iban.replace(/(.{4})/g, "$1 ").trim()}` : ""}
          </p>}
          {f.notas && <p className="imp-notas"><b>Notas:</b> {f.notas}</p>}
          {em.pie && <p className="imp-pie">{em.pie}</p>}
        </section>
      )}
    </>
  );
}
