"use client";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { eur } from "@/lib/ventas/base";
import {
  DatosEmisor, ETIQUETA_FACTURA, EstadoVisible, Factura, cartera, estadoVisible, faltaEmisor, pendiente,
} from "@/lib/ventas/facturas";
import { fechaCorta, hoyISO, mensajeError } from "@/lib/ventas/presupuestos";
import Modal from "../../Modal";
import { usePerfil } from "../../PerfilContext";
import EstadoFactura from "../EstadoFactura";
import GraficasFacturacion from "./GraficasFacturacion";
import "../../graficas/graficas.css";

type Fila = Factura & { empresa: { nombre: string } | null };
type PorFacturar = { id: string; numero: string; total: number; empresa: { nombre: string } | null };
type FiltroEstado = "todos" | EstadoVisible;
const FILTROS: FiltroEstado[] = ["todos", "borrador", "emitida", "parcial", "vencida", "pagada", "anulada", "rectificativa"];

export default function Facturas() {
  const router = useRouter();
  const { es_finanzas } = usePerfil();
  const [filas, setFilas] = useState<Fila[]>([]);
  const [porFacturar, setPorFacturar] = useState<PorFacturar[]>([]);
  const [pagos, setPagos] = useState<{ fecha: string; importe: number }[]>([]);
  const [emisor, setEmisor] = useState<DatosEmisor | null>(null);
  const [cargando, setCargando] = useState(true);
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState<FiltroEstado>("todos");
  const [verEmisor, setVerEmisor] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const hoy = hoyISO();

  const cargar = useCallback(async () => {
    const [f, p, e, pg] = await Promise.all([
      supabase.from("facturas").select("*, empresa:empresas(nombre)").order("created_at", { ascending: false }),
      supabase.from("presupuestos").select("id,numero,total,empresa:empresas(nombre)").eq("estado", "aceptado").order("created_at"),
      supabase.from("datos_emisor").select("*").maybeSingle(),
      supabase.from("pagos").select("fecha,importe"),
    ]);
    if (f.error) setError(`No se pudieron cargar las facturas. ${f.error.message}`);
    const facturas = (f.data as unknown as Fila[]) ?? [];
    setFilas(facturas);
    // Presupuestos aceptados que aún no tienen una factura viva (borrador, emitida o pagada)
    const facturados = new Set(facturas.filter((x) => x.tipo === "ordinaria" && x.estado !== "anulada").map((x) => x.presupuesto_id));
    setPorFacturar(((p.data as unknown as PorFacturar[]) ?? []).filter((x) => !facturados.has(x.id)));
    setEmisor((e.data as DatosEmisor | null) ?? null);
    setPagos((pg.data as { fecha: string; importe: number }[]) ?? []);
    setCargando(false);
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const visibles = useMemo(() => filas.filter((f) =>
    (estado === "todos" || estadoVisible(f, hoy) === estado) &&
    `${f.numero ?? "borrador"} ${f.empresa?.nombre ?? ""}`.toLowerCase().includes(q.toLowerCase())), [filas, q, estado, hoy]);

  const kpis = useMemo(() => {
    const anio = hoy.slice(0, 4);
    const emitidas = filas.filter((f) => f.estado !== "borrador");
    const facturado = emitidas.filter((f) => f.fecha_emision?.startsWith(anio)).reduce((s, f) => s + f.total, 0);   // incluye anuladas y rectificativas: neto
    const c = cartera(filas, hoy);
    return [
      [`Facturado en ${anio}`, eur(facturado)], ["Pendiente de cobro", eur(c.pendiente)],
      ["Vencido", eur(c.vencido)], ["Cobrado", eur(c.cobrado)],
    ] as [string, string][];
  }, [filas, hoy]);

  async function crear(presupuestoId: string) {
    setError(""); setAviso("");
    const { data, error } = await supabase.rpc("crear_factura_desde_presupuesto", { p_presupuesto_id: presupuestoId });
    if (error) return setError(mensajeError(error));
    router.push(`/crm/ventas/facturas/${data as string}`);
  }

  async function guardarEmisor(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const t = (k: string) => String(d.get(k) ?? "").trim() || null;
    setError("");
    const { data, error } = await supabase.from("datos_emisor").update({
      razon_social: t("razon_social"), nif: t("nif")?.toUpperCase() ?? null, direccion: t("direccion"), codigo_postal: t("codigo_postal"),
      ciudad: t("ciudad"), pais: t("pais") ?? "España", email: t("email"), telefono: t("telefono"),
      iban: t("iban")?.replace(/\s+/g, "").toUpperCase() ?? null, texto_pie: t("texto_pie"), updated_at: new Date().toISOString(),
    }).eq("id", true).select("id");
    if (error) return setError(`No se pudieron guardar los datos. ${error.message}`);
    if (!data?.length) return setError("No tienes permiso para modificar los datos de la empresa.");
    setVerEmisor(false); setAviso("Datos de la empresa guardados."); cargar();
  }

  const faltaE = faltaEmisor(emisor);

  return (
    <>
      <div className="kpis">
        {kpis.map(([t, v]) => <div key={t}><span>{t}</span><b>{v}</b></div>)}
      </div>

      <GraficasFacturacion facturas={filas} pagos={pagos} hoy={hoy} />

      {faltaE.length > 0 && (
        <p className="ventas-aviso-fiscal">
          Para emitir facturas faltan datos de vuestra empresa: {faltaE.join(", ")}.{" "}
          {es_finanzas && <button type="button" className="ventas-enlace" onClick={() => { setError(""); setVerEmisor(true); }}>Completarlos</button>}
        </p>
      )}

      {porFacturar.length > 0 && (
        <section className="ventas-pendiente" aria-labelledby="por-facturar">
          <h2 id="por-facturar">Presupuestos aceptados pendientes de facturar ({porFacturar.length})</h2>
          <ul>
            {porFacturar.map((p) => (
              <li key={p.id}>
                <span>
                  <Link href={`/crm/ventas/presupuestos/${p.id}`}>{p.numero}</Link> · {p.empresa?.nombre ?? "—"} · {eur(p.total)}
                </span>
                {es_finanzas && (
                  <button type="button" className="btn peq" onClick={() => crear(p.id)} aria-label={`Crear factura del presupuesto ${p.numero}`}>Crear factura</button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="ventas-barra">
        <input type="search" className="buscar" placeholder="Buscar por número o cliente" value={q}
          onChange={(e) => setQ(e.target.value)} aria-label="Buscar facturas" />
        <label className="ventas-filtro">Estado
          <select value={estado} onChange={(e) => setEstado(e.target.value as FiltroEstado)}>
            {FILTROS.map((s) => <option key={s} value={s}>{s === "todos" ? "Todos" : ETIQUETA_FACTURA[s]}</option>)}
          </select>
        </label>
        <button type="button" className="btn sec" onClick={() => { setError(""); setVerEmisor(true); }}>Datos de la empresa</button>
      </div>

      <p className="aviso" role="alert" data-tipo="error">{verEmisor ? "" : error}</p>
      <p className="aviso" role="status" data-tipo="ok">{verEmisor ? "" : aviso}</p>

      {!cargando && visibles.length === 0 ? (
        <p className="vacio">
          {filas.length === 0
            ? "Aún no hay facturas. Se crean a partir de un presupuesto aceptado."
            : "Ninguna factura coincide con los filtros."}
        </p>
      ) : (
        <div className="tabla ventas-tabla">
          <table>
            <caption className="ventas-solo-lectores">Lista de facturas</caption>
            <thead>
              <tr>
                <th scope="col">Número</th><th scope="col">Cliente</th><th scope="col">Emisión</th>
                <th scope="col">Vencimiento</th><th scope="col">Estado</th>
                <th scope="col" className="num">Total</th><th scope="col" className="num">Pendiente</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((f) => (
                <tr key={f.id}>
                  <td><Link href={`/crm/ventas/facturas/${f.id}`} className="cod">{f.numero ?? "Borrador"}</Link></td>
                  <td>{f.empresa?.nombre ?? "—"}</td>
                  <td>{fechaCorta(f.fecha_emision)}</td>
                  <td>{f.tipo === "ordinaria" ? fechaCorta(f.fecha_vencimiento) : "—"}</td>
                  <td><EstadoFactura estado={estadoVisible(f, hoy)} /></td>
                  <td className="num">{eur(f.total)}</td>
                  <td className="num">{pendiente(f) > 0 ? eur(pendiente(f)) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal abierto={verEmisor} titulo="Datos de la empresa emisora" onCerrar={() => setVerEmisor(false)}>
        {verEmisor && (
          <form className="form plano ventas-form" onSubmit={guardarEmisor}>
            <p className="ayuda">Aparecen en todas las facturas. Al emitir una factura se copian: cambiarlos después no altera las ya emitidas.</p>
            <fieldset className="ventas-sinborde" disabled={!es_finanzas}>
              <legend className="ventas-solo-lectores">Datos fiscales de la empresa</legend>
              <label>Razón social<input name="razon_social" required maxLength={160} defaultValue={emisor?.razon_social ?? ""} /></label>
              <div className="fila">
                <label>NIF<input name="nif" minLength={5} maxLength={20} defaultValue={emisor?.nif ?? ""} autoComplete="off" /></label>
                <label>País<input name="pais" required minLength={2} maxLength={60} defaultValue={emisor?.pais ?? "España"} /></label>
              </div>
              <label>Dirección<input name="direccion" maxLength={200} defaultValue={emisor?.direccion ?? ""} /></label>
              <div className="fila">
                <label>Código postal<input name="codigo_postal" minLength={4} maxLength={10} defaultValue={emisor?.codigo_postal ?? ""} /></label>
                <label>Ciudad<input name="ciudad" maxLength={100} defaultValue={emisor?.ciudad ?? ""} /></label>
              </div>
              <div className="fila">
                <label>Correo<input name="email" type="email" maxLength={160} defaultValue={emisor?.email ?? ""} /></label>
                <label>Teléfono<input name="telefono" type="tel" minLength={5} maxLength={30} defaultValue={emisor?.telefono ?? ""} /></label>
              </div>
              <label>IBAN para cobros
                <input name="iban" pattern="[A-Za-z]{2}[0-9]{2}[A-Za-z0-9 ]{11,40}" maxLength={42} defaultValue={emisor?.iban ?? ""} aria-describedby="emisor-ayuda-iban" />
                <span id="emisor-ayuda-iban" className="ayuda">Aparece en las facturas pagadas por transferencia.</span>
              </label>
              <label>Texto al pie de la factura (opcional)<textarea name="texto_pie" maxLength={500} defaultValue={emisor?.texto_pie ?? ""} /></label>
            </fieldset>
            {es_finanzas
              ? <button className="btn">Guardar datos</button>
              : <p className="ayuda">Solo finanzas puede modificar estos datos.</p>}
            <p className="aviso" role="alert" data-tipo="error">{error}</p>
          </form>
        )}
      </Modal>
    </>
  );
}
