"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { eur } from "@/lib/ventas/base";
import { hoyISO } from "@/lib/ventas/presupuestos";
import { ESTADOS_EMBUDO, ETIQUETA_EMBUDO, cuentaPorMes, diaMadrid, resumenOportunidades, ultimosMeses } from "@/lib/graficas";
import { BarrasHorizontales, Columnas } from "../graficas/Graficas";
import { usePerfil } from "../PerfilContext";

type Fila = { estado: string; valor_estimado: number | null; created_at: string };
const num = (n: number) => n.toLocaleString("es-ES");

export default function Resumen() {
  const { es_ventas } = usePerfil();
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase.from("oportunidades").select("estado,valor_estimado,created_at").then(({ data, error }) => {
      if (error) setError(`No se pudieron cargar las oportunidades. ${error.message}`);
      setFilas((data as Fila[]) ?? []);
    });
  }, []);

  const r = useMemo(() => resumenOportunidades(filas ?? []), [filas]);
  const meses = useMemo(() => ultimosMeses(6, hoyISO()), []);
  const nuevasPorMes = useMemo(() => cuentaPorMes((filas ?? []).map((f) => diaMadrid(f.created_at)), meses), [filas, meses]);

  if (filas === null) return <p className="vacio" role="status">Cargando resumen…</p>;

  const total = filas.length;
  return (
    <>
      <div className="cab"><h1>Resumen</h1></div>
      <p className="aviso" role="alert" data-tipo="error">{error}</p>

      {total === 0 ? (
        <p className="vacio">Aún no hay oportunidades. Cuando lleguen desde la web o las crees, aquí verás cómo evolucionan.</p>
      ) : (
        <>
          <dl className="graf-kpis">
            <div className="graf-kpi"><dt>Oportunidades abiertas</dt><dd>{num(r.abiertas)}</dd></div>
            <div className="graf-kpi"><dt>Valor del pipeline abierto</dt><dd>{eur(r.valorAbierto)}</dd></div>
            <div className="graf-kpi"><dt>Valor ganado</dt><dd>{eur(r.valorGanado)}</dd></div>
            <div className="graf-kpi">
              <dt>Tasa de conversión</dt>
              <dd>
                {r.conversion === null ? "—" : `${(r.conversion * 100).toLocaleString("es-ES", { maximumFractionDigits: 0 })} %`}
                <span className="graf-nota">{r.conversion === null ? "sin oportunidades cerradas" : `${r.ganadas} ${r.ganadas === 1 ? "ganada" : "ganadas"} · ${r.perdidas} ${r.perdidas === 1 ? "perdida" : "perdidas"}`}</span>
              </dd>
            </div>
          </dl>

          <div className="graf-rejilla-paneles">
            <section className="graf-panel" aria-labelledby="g-embudo">
              <h2 id="g-embudo">Embudo de oportunidades</h2>
              <p className="graf-sub">Número de oportunidades en cada fase y su valor estimado.</p>
              <BarrasHorizontales
                titulo="Oportunidades por fase del embudo"
                filas={ESTADOS_EMBUDO.map((e) => ({
                  etiqueta: ETIQUETA_EMBUDO[e], valor: r.por[e].n,
                  texto: r.por[e].valor > 0 ? `${r.por[e].n} · ${eur(r.por[e].valor)}` : String(r.por[e].n),
                  color: e === "perdida" ? "var(--graf-neutro)" : "var(--graf-1)",
                }))}
              />
            </section>

            <section className="graf-panel" aria-labelledby="g-mes">
              <h2 id="g-mes">Oportunidades nuevas por mes</h2>
              <p className="graf-sub">Últimos seis meses, según la fecha en que entraron en el CRM.</p>
              <Columnas
                titulo="Oportunidades nuevas por mes"
                descripcion="Gráfico de columnas con las oportunidades que han entrado cada uno de los últimos seis meses."
                meses={meses}
                series={[{ nombre: "Oportunidades nuevas", color: "var(--graf-1)", valores: nuevasPorMes }]}
                formato={(n) => num(n)}
              />
            </section>
          </div>
        </>
      )}

      {es_ventas && <p><Link href="/crm/ventas/facturas">Ver la facturación y su evolución →</Link></p>}
    </>
  );
}
