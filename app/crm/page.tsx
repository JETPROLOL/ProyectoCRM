"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ESTADOS, Empleado, Empresa, Estado, Oportunidad, euros } from "@/lib/tipos";
import { mensajeError } from "@/lib/ventas/presupuestos";
import Modal from "./Modal";
import { usePerfil } from "./PerfilContext";
import "./ventas/ventas.css";

type PresuDeOp = { id: string; numero: string; oportunidad_id: string; estado: string };

export default function Oportunidades() {
  const [items, setItems] = useState<Oportunidad[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [q, setQ] = useState("");
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<Estado | null>(null);
  const router = useRouter();
  const { es_ventas } = usePerfil();
  const [presus, setPresus] = useState<PresuDeOp[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [elegir, setElegir] = useState<Oportunidad | null>(null);   // oportunidad sin empresa: hay que elegir cliente
  const [errorPresu, setErrorPresu] = useState("");

  const cargar = useCallback(async () => {
    const [o, e] = await Promise.all([
      supabase.from("oportunidades").select("*").order("created_at", { ascending: false }),
      supabase.from("empleados").select("*"),
    ]);
    setItems((o.data as Oportunidad[]) ?? []);
    setEmpleados((e.data as Empleado[]) ?? []);
  }, []);

  useEffect(() => {
    cargar();
    // Las oportunidades enviadas desde la web aparecen sin recargar
    const canal = supabase.channel("oportunidades")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "oportunidades" },
        (p) => setItems((prev) => [p.new as Oportunidad, ...prev]))
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [cargar]);

  // Presupuestos de cada oportunidad y empresas (solo si el usuario puede usar Ventas)
  const cargarVentas = useCallback(async () => {
    if (!es_ventas) { setPresus([]); setEmpresas([]); return; }
    const [p, e] = await Promise.all([
      supabase.from("presupuestos").select("id,numero,oportunidad_id,estado").not("oportunidad_id", "is", null),
      supabase.from("empresas").select("*").order("nombre"),
    ]);
    setPresus((p.data as PresuDeOp[]) ?? []);
    setEmpresas((e.data as Empresa[]) ?? []);
  }, [es_ventas]);
  useEffect(() => { cargarVentas(); }, [cargarVentas]);

  async function crearPresupuesto(o: Oportunidad, empresaId: string) {
    setErrorPresu("");
    const { data, error } = await supabase.rpc("crear_presupuesto", { p_empresa_id: empresaId, p_oportunidad_id: o.id });
    if (error) return setErrorPresu(mensajeError(error));
    router.push(`/crm/ventas/presupuestos/${data as string}`);
  }
  // Con empresa ya enlazada se crea directamente; si no, se pregunta a qué cliente pertenece
  function pedirPresupuesto(o: Oportunidad) {
    if (o.empresa_id) crearPresupuesto(o, o.empresa_id);
    else { setErrorPresu(""); setElegir(o); }
  }

  async function actualizar(id: string, cambios: Partial<Oportunidad>) {
    setItems((prev) => prev.map((o) => (o.id === id ? { ...o, ...cambios } : o)));
    const { error } = await supabase.from("oportunidades").update(cambios).eq("id", id);
    if (error) cargar();
  }

  const nombreEmpleado = useMemo(() => new Map(empleados.map((e) => [e.id, e.nombre])), [empleados]);
  const visibles = useMemo(() => items.filter((o) =>
    `${o.nombre} ${o.empresa ?? ""} ${o.email}`.toLowerCase().includes(q.toLowerCase())), [items, q]);

  const abiertas = items.filter((o) => o.estado !== "ganada" && o.estado !== "perdida");
  const kpis: [string, string][] = [
    ["Oportunidades", String(items.length)],
    ["Nuevas sin atender", String(items.filter((o) => o.estado === "nueva").length)],
    ["En curso", String(abiertas.length)],
    ["Valor en curso", euros(abiertas.reduce((s, o) => s + (o.valor_estimado ?? 0), 0))],
  ];

  return (
    <>
      <div className="cab">
        <h1>Oportunidades</h1>
        <input type="search" className="buscar" placeholder="Buscar por nombre, empresa o correo" value={q}
          onChange={(e) => setQ(e.target.value)} aria-label="Buscar oportunidades" />
      </div>

      <div className="kpis">
        {kpis.map(([t, v]) => <div key={t}><span>{t}</span><b>{v}</b></div>)}
      </div>

      <div className="tablero">
        {ESTADOS.map((est) => {
          const col = visibles.filter((o) => o.estado === est);
          return (
            <section key={est} className="col" data-estado={est} data-sobre={sobre === est}
              aria-label={`Oportunidades en estado ${est}`}
              onDragOver={(e) => { e.preventDefault(); setSobre(est); }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setSobre(null); }}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain");
                setSobre(null); setArrastrando(null);
                const o = items.find((x) => x.id === id);
                if (o && o.estado !== est) actualizar(id, { estado: est });
              }}>
              <div className="col-cab">
                <h2>{est}</h2>
                <span>{col.length} ({euros(col.reduce((s, o) => s + (o.valor_estimado ?? 0), 0))})</span>
              </div>
              {col.map((o) => {
                const emp = o.empleado_id ? nombreEmpleado.get(o.empleado_id) : null;
                return (
                  <article key={o.id} className={`ficha${arrastrando === o.id ? " arrastrando" : ""}`} draggable
                    onDragStart={(e) => { e.dataTransfer.setData("text/plain", o.id); e.dataTransfer.effectAllowed = "move"; setArrastrando(o.id); }}
                    onDragEnd={() => { setArrastrando(null); setSobre(null); }}>
                    <b>{o.nombre}</b>
                    <span className="sub">{o.empresa ? `${o.empresa}, ` : ""}{o.servicio}</span>
                    {o.mensaje && <p className="msg">{o.mensaje}</p>}
                    <span className="emp" data-sin={!emp}>{emp ? `Redactada por ${emp}` : "Sin empleado asignado"}</span>
                    <div className="ficha-pie">
                      <input type="number" min={0} step={100} placeholder="Valor (€)" defaultValue={o.valor_estimado ?? ""}
                        aria-label={`Valor estimado de ${o.nombre}`}
                        onBlur={(e) => actualizar(o.id, { valor_estimado: e.target.value === "" ? null : Number(e.target.value) })} />
                      <select value={o.estado} aria-label={`Mover a otro estado la oportunidad de ${o.nombre}`}
                        onChange={(e) => actualizar(o.id, { estado: e.target.value as Estado })}>
                        {ESTADOS.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    {es_ventas && (() => {
                      // Un presupuesto "vivo" (no rechazado ni caducado) sustituye al botón por un enlace
                      const vivos = presus.filter((x) => x.oportunidad_id === o.id && !["rechazado", "caducado"].includes(x.estado));
                      return vivos.length > 0
                        ? <Link href={`/crm/ventas/presupuestos/${vivos[0].id}`} className="ficha-presu">
                            Presupuesto {vivos[0].numero}{vivos.length > 1 ? ` y ${vivos.length - 1} más` : ""}
                          </Link>
                        : <button type="button" className="btn peq sec" aria-label={`Crear presupuesto para ${o.nombre}`}
                            onClick={() => pedirPresupuesto(o)}>Crear presupuesto</button>;
                    })()}
                  </article>
                );
              })}
              {col.length === 0 && <p className="col-vacia">Arrastra aquí una oportunidad</p>}
            </section>
          );
        })}
      </div>

      {errorPresu && !elegir && <p className="aviso" role="alert" data-tipo="error">{errorPresu}</p>}

      <Modal abierto={elegir !== null} titulo="Crear presupuesto" onCerrar={() => setElegir(null)}>
        {elegir && (
          <form className="form plano ventas-form" onSubmit={(e) => {
            e.preventDefault();
            crearPresupuesto(elegir, String(new FormData(e.currentTarget).get("empresa")));
          }}>
            <p>La oportunidad «{elegir.nombre}» aún no está asociada a un cliente. Elige la empresa a la que va el presupuesto.</p>
            <label>Cliente
              <select name="empresa" required
                defaultValue={empresas.find((c) => c.nombre.trim().toLowerCase() === (elegir.empresa ?? "").trim().toLowerCase())?.id ?? ""}>
                <option value="" disabled>Elige una empresa</option>
                {empresas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </label>
            <p className="ayuda">¿No está en la lista? Créala antes en <Link href="/crm/empresas">Empresas</Link>.</p>
            <button className="btn">Crear presupuesto</button>
            <p className="aviso" role="alert" data-tipo="error">{errorPresu}</p>
          </form>
        )}
      </Modal>
    </>
  );
}
