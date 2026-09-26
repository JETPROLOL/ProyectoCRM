"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ESTADOS, Empleado, Estado, Oportunidad, euros } from "@/lib/tipos";

export default function Oportunidades() {
  const [items, setItems] = useState<Oportunidad[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [q, setQ] = useState("");
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<Estado | null>(null);

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
                  </article>
                );
              })}
              {col.length === 0 && <p className="col-vacia">Arrastra aquí una oportunidad</p>}
            </section>
          );
        })}
      </div>
    </>
  );
}
