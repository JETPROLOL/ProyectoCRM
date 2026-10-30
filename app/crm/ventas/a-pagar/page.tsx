"use client";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { urlFirmada } from "@/lib/rrhh/archivos";
import { eur } from "@/lib/ventas/base";
import {
  ETIQUETA_PROVEEDOR, EstadoProveedor, FILTROS_PROVEEDOR, FacturaProveedor,
  claveDuplicada, enLectura, hashArchivo, validarFacturaPdf,
} from "@/lib/ventas/facturasProveedor";
import { fechaCorta, mensajeError } from "@/lib/ventas/presupuestos";
import Modal from "../../Modal";
import { usePerfil } from "../../PerfilContext";
import EstadoFacturaProveedor from "../EstadoFacturaProveedor";
import Icono from "../../Icono";

const BUCKET = "facturas-proveedor";
const importe = (n: number | null) => (n === null ? "—" : eur(Number(n)));

// Facturas que tenemos que PAGAR (PDF de otros proveedores). Las sube finanzas y las lee el agente de IA.
export default function FacturasAPagar() {
  const { es_finanzas } = usePerfil();
  const [filas, setFilas] = useState<FacturaProveedor[]>([]);
  const [cargando, setCargando] = useState(true);
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState<"todos" | EstadoProveedor>("todos");
  const [verSubida, setVerSubida] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);   // id de la fila con una acción en curso
  const [erroresSubida, setErroresSubida] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from("facturas_proveedor").select("*").order("created_at", { ascending: false });
    if (error) setError(`No se pudieron cargar las facturas. ${error.message}`);
    else setFilas((data as FacturaProveedor[]) ?? []);
    setCargando(false);
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  // Pide al servidor que el agente de IA lea las facturas pendientes (la lectura corre en /api/facturas-proveedor/leer).
  // Solo finanzas puede lanzarla; si quedan más de las que caben en una llamada, insiste hasta vaciar la cola.
  const leyendoRef = useRef(false);
  const lanzarLectura = useCallback(async () => {
    if (leyendoRef.current) return;
    leyendoRef.current = true;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      for (let ronda = 0; ronda < 10; ronda++) {
        const r = await fetch("/api/facturas-proveedor/leer", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` } });
        const j = await r.json().catch(() => null);
        if (!r.ok) { setError(`El agente no pudo leer las facturas. ${j?.error ?? ""}`.trim()); break; }
        await cargar();
        if (!j?.restantes || !j?.leidas) break;
      }
    } catch {
      setError("No se pudo contactar con el agente que lee las facturas.");
    } finally {
      leyendoRef.current = false;
      cargar();
    }
  }, [cargar]);

  // Mientras el agente tiene facturas sin leer, la lista se refresca sola cada 5 segundos
  const hayPendientes = filas.some((f) => enLectura(f.estado));
  // Al abrir la página, si quedó algo sin leer (p. ej. se cerró el navegador tras subirlo), se vuelve a lanzar
  const [lanzadaAlAbrir, setLanzadaAlAbrir] = useState(false);
  useEffect(() => {
    if (es_finanzas && hayPendientes && !lanzadaAlAbrir) { setLanzadaAlAbrir(true); lanzarLectura(); }
  }, [es_finanzas, hayPendientes, lanzadaAlAbrir, lanzarLectura]);
  useEffect(() => {
    if (!hayPendientes) return;
    const t = setInterval(cargar, 5000);
    return () => clearInterval(t);
  }, [hayPendientes, cargar]);

  // Facturas leídas con el mismo NIF y número: casi seguro la misma factura subida dos veces
  const duplicadas = useMemo(() => {
    const cuenta = new Map<string, number>();
    for (const f of filas) { const k = claveDuplicada(f); if (k) cuenta.set(k, (cuenta.get(k) ?? 0) + 1); }
    return new Set([...cuenta].filter(([, n]) => n > 1).map(([k]) => k));
  }, [filas]);

  const visibles = useMemo(() => filas.filter((f) =>
    (estado === "todos" || f.estado === estado) &&
    `${f.proveedor ?? ""} ${f.nif ?? ""} ${f.numero ?? ""} ${f.nombre_archivo}`.toLowerCase().includes(q.toLowerCase())), [filas, q, estado]);

  const kpis = useMemo(() => {
    const suma = (xs: FacturaProveedor[]) => xs.reduce((s, f) => s + Math.round(Number(f.total ?? 0) * 100), 0) / 100;
    const porPagar = filas.filter((f) => f.estado === "por_pagar" || f.estado === "revisar");
    return [
      ["Pendiente de pago", eur(suma(porPagar))],
      ["Facturas por pagar", String(porPagar.length)],
      ["A revisar o con error", String(filas.filter((f) => f.estado === "revisar" || f.estado === "error_lectura").length)],
      ["Pagado", eur(suma(filas.filter((f) => f.estado === "pagada")))],
    ] as [string, string][];
  }, [filas]);

  async function subir(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const archivos = new FormData(form).getAll("archivos").filter((x): x is File => x instanceof File && x.name !== "");
    if (archivos.length === 0) return setErroresSubida(["Elige al menos un archivo PDF."]);

    setSubiendo(true); setErroresSubida([]); setError(""); setAviso("");
    const errores: string[] = [];
    let subidas = 0;
    for (const archivo of archivos) {
      const problema = await validarFacturaPdf(archivo);
      if (problema) { errores.push(problema); continue; }
      const ruta = `${crypto.randomUUID()}.pdf`;
      const { error: e1 } = await supabase.storage.from(BUCKET).upload(ruta, archivo, { contentType: "application/pdf" });
      if (e1) { errores.push(`«${archivo.name}»: no se pudo subir el archivo. ${e1.message}`); continue; }
      const { error: e2 } = await supabase.from("facturas_proveedor").insert({
        archivo_path: ruta, nombre_archivo: archivo.name.slice(0, 200), hash_archivo: await hashArchivo(archivo),
      });
      if (e2) {
        await supabase.storage.from(BUCKET).remove([ruta]);   // no dejar archivos huérfanos
        errores.push(e2.code === "23505" ? `«${archivo.name}» ya estaba subida.` : `«${archivo.name}»: no se pudo registrar. ${e2.message}`);
        continue;
      }
      subidas++;
    }
    setSubiendo(false);
    if (subidas > 0) {
      setAviso(`${subidas === 1 ? "1 factura subida" : `${subidas} facturas subidas`}. El agente la está leyendo.`);
      cargar();
      lanzarLectura();
    }
    if (errores.length === 0) { form.reset(); setVerSubida(false); } else setErroresSubida(errores);
  }

  async function descargar(f: FacturaProveedor) {
    setError("");
    const url = await urlFirmada(BUCKET, f.archivo_path, 60, f.nombre_archivo);
    if (!url) return setError("No se pudo descargar el archivo.");
    const a = document.createElement("a");
    a.href = url; a.download = f.nombre_archivo;
    document.body.appendChild(a); a.click(); a.remove();
  }

  async function rpc(f: FacturaProveedor, funcion: string, args: Record<string, unknown>, ok: string) {
    setError(""); setAviso(""); setOcupado(f.id);
    const { error } = await supabase.rpc(funcion, args);
    setOcupado(null);
    if (error) return setError(mensajeError(error));
    setAviso(ok); cargar();
    if (funcion === "reintentar_lectura_factura_proveedor") lanzarLectura();
  }
  const marcarPagada = (f: FacturaProveedor, pagada: boolean) =>
    rpc(f, "pagar_factura_proveedor", { p_id: f.id, p_pagada: pagada }, pagada ? "Factura marcada como pagada." : "Pago deshecho.");
  const reintentar = (f: FacturaProveedor) =>
    rpc(f, "reintentar_lectura_factura_proveedor", { p_id: f.id }, "La factura volverá a leerse en unos instantes.");

  async function eliminar(f: FacturaProveedor) {
    if (!window.confirm(`¿Eliminar «${f.nombre_archivo}»? Se borra también el PDF y no se puede deshacer.`)) return;
    setError(""); setAviso(""); setOcupado(f.id);
    const { data, error } = await supabase.from("facturas_proveedor").delete().eq("id", f.id).select("id");
    if (error || !data?.length) { setOcupado(null); return setError(`No se pudo eliminar. ${error?.message ?? "No tienes permiso o la factura ya está pagada."}`); }
    await supabase.storage.from(BUCKET).remove([f.archivo_path]);
    setOcupado(null); setAviso("Factura eliminada."); cargar();
  }

  return (
    <>
      <div className="kpis">
        {kpis.map(([t, v]) => <div key={t}><span>{t}</span><b>{v}</b></div>)}
      </div>

      <div className="ventas-barra">
        <input type="search" className="buscar" placeholder="Buscar por proveedor, NIF o número" value={q}
          onChange={(e) => setQ(e.target.value)} aria-label="Buscar facturas a pagar" />
        <label className="ventas-filtro">Estado
          <select value={estado} onChange={(e) => setEstado(e.target.value as "todos" | EstadoProveedor)}>
            {FILTROS_PROVEEDOR.map((s) => <option key={s} value={s}>{s === "todos" ? "Todos" : ETIQUETA_PROVEEDOR[s]}</option>)}
          </select>
        </label>
        {es_finanzas && (
          <button type="button" className="btn" onClick={() => { setErroresSubida([]); setError(""); setAviso(""); setVerSubida(true); }}>
            <Icono nombre="upload" />Subir factura (PDF)
          </button>
        )}
      </div>

      <p className="aviso" role="alert" data-tipo="error">{error}</p>
      <p className="aviso" role="status" data-tipo="ok">{aviso}</p>

      {!cargando && visibles.length === 0 ? (
        <p className="vacio">
          {filas.length === 0
            ? "Aún no hay facturas a pagar. Sube el PDF de una factura de proveedor y el agente leerá sus datos."
            : "Ninguna factura coincide con los filtros."}
        </p>
      ) : (
        <div className="tabla ventas-tabla" tabIndex={0} role="region" aria-label="Lista de facturas a pagar">
          <table>
            <caption className="ventas-solo-lectores">Lista de facturas a pagar</caption>
            <thead>
              <tr>
                <th scope="col">Proveedor</th><th scope="col">Nº factura</th><th scope="col">Fecha</th><th scope="col">Estado</th>
                <th scope="col" className="num">Base</th><th scope="col" className="num">IVA</th><th scope="col" className="num">Total</th>
                <th scope="col"><span className="ventas-solo-lectores">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((f) => {
                const leida = !enLectura(f.estado) && f.estado !== "error_lectura";
                const dup = (() => { const k = claveDuplicada(f); return !!k && duplicadas.has(k); })();
                return (
                  <tr key={f.id}>
                    <td>
                      {leida ? (f.proveedor ?? <span className="ventas-falta">Sin proveedor</span>) : <span className="ventas-falta">{f.nombre_archivo}</span>}
                      {leida && f.nif && <span className="sub">{f.nif}</span>}
                      {leida && <span className="sub">{f.nombre_archivo}</span>}
                    </td>
                    <td className="cod">{f.numero ?? "—"}</td>
                    <td>{fechaCorta(f.fecha)}</td>
                    <td>
                      <EstadoFacturaProveedor estado={f.estado} />
                      {f.estado === "error_lectura" && f.error_lectura && <span className="ventas-motivo">{f.error_lectura}</span>}
                      {f.estado === "revisar" && <span className="ventas-motivo">Faltan datos o base + IVA no suma el total.</span>}
                      {dup && <span className="ventas-aviso-dup">Posible duplicada (mismo NIF y número)</span>}
                    </td>
                    <td className="num">{importe(f.base)}</td>
                    <td className="num">{importe(f.iva)}</td>
                    <td className="num">{importe(f.total)}</td>
                    <td>
                      <div className="ventas-botones">
                        <button type="button" className="btn sec peq" onClick={() => descargar(f)} aria-label={`Descargar PDF de ${f.nombre_archivo}`}>
                          <Icono nombre="download" />PDF
                        </button>
                        {es_finanzas && (f.estado === "por_pagar" || f.estado === "revisar") && (
                          <button type="button" className="btn peq" disabled={ocupado === f.id} onClick={() => marcarPagada(f, true)}
                            aria-label={`Marcar como pagada ${f.nombre_archivo}`}><Icono nombre="check" />Pagada</button>
                        )}
                        {es_finanzas && f.estado === "pagada" && (
                          <button type="button" className="btn sec peq" disabled={ocupado === f.id} onClick={() => marcarPagada(f, false)}
                            aria-label={`Deshacer el pago de ${f.nombre_archivo}`}><Icono nombre="undo" />Deshacer pago</button>
                        )}
                        {es_finanzas && (f.estado === "error_lectura" || f.estado === "revisar") && (
                          <button type="button" className="btn sec peq" disabled={ocupado === f.id} onClick={() => reintentar(f)}
                            aria-label={`Volver a leer ${f.nombre_archivo}`}>Releer</button>
                        )}
                        {es_finanzas && f.estado !== "pagada" && (
                          <button type="button" className="btn sec peligro peq" disabled={ocupado === f.id} onClick={() => eliminar(f)}
                            aria-label={`Eliminar ${f.nombre_archivo}`}><Icono nombre="trash" />Eliminar</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal abierto={verSubida} titulo="Subir factura de proveedor" onCerrar={() => setVerSubida(false)}>
        {verSubida && (
          <form className="form plano ventas-form ventas-subida" onSubmit={subir}>
            <p className="ayuda">
              Sube el PDF de una factura que tenemos que pagar. El agente de IA lo leerá y rellenará proveedor, número, fecha e importes.
              Puedes elegir varios archivos a la vez.
            </p>
            <label>Archivos PDF (máx. 10 MB cada uno)
              <input type="file" name="archivos" accept="application/pdf,.pdf" multiple required />
            </label>
            <div className="ventas-acciones">
              <button className="btn" disabled={subiendo}><Icono nombre="upload" />{subiendo ? "Subiendo…" : "Subir"}</button>
              <button type="button" className="btn sec" onClick={() => setVerSubida(false)}><Icono nombre="x" />Cancelar</button>
            </div>
            <div className="aviso" role="alert" data-tipo="error">
              {erroresSubida.length > 0 && <ul>{erroresSubida.map((m) => <li key={m}>{m}</li>)}</ul>}
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
