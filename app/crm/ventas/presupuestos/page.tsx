"use client";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Empresa } from "@/lib/tipos";
import { eur } from "@/lib/ventas/base";
import {
  ESTADOS_PRESUPUESTO, ETIQUETA_ESTADO, EstadoPresupuesto, Presupuesto, fechaCorta, hoyISO, mensajeError,
} from "@/lib/ventas/presupuestos";
import Modal from "../../Modal";
import Estado from "../Estado";
import Icono from "../../Icono";

type Fila = Presupuesto & { empresa: { nombre: string } | null; vendedor: { nombre: string } | null };

// Días hasta una fecha ISO (negativo si ya pasó)
const diasHasta = (iso: string) =>
  Math.round((Date.parse(iso + "T12:00:00Z") - Date.parse(hoyISO() + "T12:00:00Z")) / 86400000);

export default function Presupuestos() {
  const router = useRouter();
  const [filas, setFilas] = useState<Fila[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [cargando, setCargando] = useState(true);
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState<"todos" | EstadoPresupuesto>("todos");
  const [nuevo, setNuevo] = useState(false);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    await supabase.rpc("caducar_presupuestos");   // marca como caducados los enviados vencidos
    const [p, e] = await Promise.all([
      supabase.from("presupuestos").select("*, empresa:empresas(nombre), vendedor:empleados(nombre)")
        .order("created_at", { ascending: false }),
      supabase.from("empresas").select("*").order("nombre"),
    ]);
    if (p.error) setError(`No se pudieron cargar los presupuestos. ${p.error.message}`);
    setFilas((p.data as unknown as Fila[]) ?? []);
    setEmpresas((e.data as Empresa[]) ?? []);
    setCargando(false);
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const visibles = useMemo(() => filas.filter((f) =>
    (estado === "todos" || f.estado === estado) &&
    `${f.numero} ${f.empresa?.nombre ?? ""}`.toLowerCase().includes(q.toLowerCase())), [filas, q, estado]);

  const kpis = useMemo(() => {
    const n = (e: EstadoPresupuesto) => filas.filter((f) => f.estado === e);
    const suma = (l: Fila[]) => l.reduce((s, f) => s + f.total, 0);
    const resueltos = n("aceptado").length + n("rechazado").length + n("caducado").length;
    const tasa = resueltos ? `${Math.round((n("aceptado").length / resueltos) * 100)} %` : "—";
    return [
      ["Borradores", String(n("borrador").length)],
      ["Pendientes de respuesta", `${n("enviado").length} · ${eur(suma(n("enviado")))}`],
      ["Importe aceptado", eur(suma(n("aceptado")))],
      ["Tasa de aceptación", tasa],
    ] as [string, string][];
  }, [filas]);

  async function crear(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const empresa = String(new FormData(e.currentTarget).get("empresa"));
    const { data, error } = await supabase.rpc("crear_presupuesto", { p_empresa_id: empresa });
    if (error) return setError(mensajeError(error));
    router.push(`/crm/ventas/presupuestos/${data as string}`);
  }

  return (
    <>
      <div className="kpis">
        {kpis.map(([t, v]) => <div key={t}><span>{t}</span><b>{v}</b></div>)}
      </div>

      <div className="ventas-barra">
        <input type="search" className="buscar" placeholder="Buscar por número o cliente" value={q}
          onChange={(e) => setQ(e.target.value)} aria-label="Buscar presupuestos" />
        <label className="ventas-filtro">Estado
          <select value={estado} onChange={(e) => setEstado(e.target.value as "todos" | EstadoPresupuesto)}>
            <option value="todos">Todos</option>
            {ESTADOS_PRESUPUESTO.map((s) => <option key={s} value={s}>{ETIQUETA_ESTADO[s]}</option>)}
          </select>
        </label>
        <button className="btn" onClick={() => { setError(""); setNuevo(true); }}><Icono nombre="plus" />Nuevo presupuesto</button>
      </div>

      <p className="aviso" role="alert" data-tipo="error">{nuevo ? "" : error}</p>

      {!cargando && visibles.length === 0 ? (
        <p className="vacio">
          {filas.length === 0
            ? "Aún no hay presupuestos. Crea el primero con el botón Nuevo presupuesto o desde una oportunidad."
            : "Ningún presupuesto coincide con los filtros."}
        </p>
      ) : (
        <div className="tabla ventas-tabla" tabIndex={0} role="region" aria-label="Lista de presupuestos">
          <table>
            <caption className="ventas-solo-lectores">Lista de presupuestos</caption>
            <thead>
              <tr>
                <th scope="col">Número</th><th scope="col">Cliente</th><th scope="col">Fecha</th>
                <th scope="col">Válido hasta</th><th scope="col">Estado</th>
                <th scope="col" className="num">Total</th><th scope="col">Vendedor</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((f) => {
                const d = diasHasta(f.validez_hasta);
                return (
                  <tr key={f.id}>
                    <td><Link href={`/crm/ventas/presupuestos/${f.id}`} className="cod">{f.numero}</Link></td>
                    <td>{f.empresa?.nombre ?? "—"}</td>
                    <td>{fechaCorta(f.fecha)}</td>
                    <td>
                      {fechaCorta(f.validez_hasta)}
                      {f.estado === "enviado" && d >= 0 && d <= 7 &&
                        <span className="sub">{d === 0 ? "Vence hoy" : `Vence en ${d} ${d === 1 ? "día" : "días"}`}</span>}
                    </td>
                    <td><Estado estado={f.estado} /></td>
                    <td className="num">{eur(f.total)}</td>
                    <td>{f.vendedor?.nombre ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal abierto={nuevo} titulo="Nuevo presupuesto" onCerrar={() => setNuevo(false)}>
        {nuevo && (empresas.length === 0 ? (
          <p>Primero necesitas una empresa (cliente). Créala en <Link href="/crm/empresas">Empresas</Link>.</p>
        ) : (
          <form className="form plano ventas-form" onSubmit={crear}>
            <label>Cliente
              <select name="empresa" required defaultValue="">
                <option value="" disabled>Elige una empresa</option>
                {empresas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </label>
            <p className="ayuda">Después podrás añadir los servicios, descuentos e IVA.</p>
            <button className="btn"><Icono nombre="file-plus" />Crear presupuesto</button>
            <p className="aviso" role="alert" data-tipo="error">{error}</p>
          </form>
        ))}
      </Modal>
    </>
  );
}
