"use client";
import { useMemo } from "react";
import { eur } from "@/lib/ventas/base";
import { Factura, cartera } from "@/lib/ventas/facturas";
import { sumaPorMes, ultimosMeses } from "@/lib/graficas";
import { BarrasHorizontales, Columnas } from "../../graficas/Graficas";

type Pago = { fecha: string; importe: number };

// Dos gráficos de la lista de facturas: facturado y cobrado por mes, y estado de la cartera de cobro
export default function GraficasFacturacion({ facturas, pagos, hoy }: { facturas: Factura[]; pagos: Pago[]; hoy: string }) {
  const meses = useMemo(() => ultimosMeses(6, hoy), [hoy]);
  // Facturado = neto de todo lo emitido (incluye anuladas y rectificativas, como el KPI "Facturado")
  const facturado = useMemo(() => sumaPorMes(
    facturas.filter((f) => f.estado !== "borrador").map((f) => ({ fecha: f.fecha_emision, importe: f.total })), meses), [facturas, meses]);
  const cobrado = useMemo(() => sumaPorMes(pagos.map((p) => ({ fecha: p.fecha, importe: p.importe })), meses), [pagos, meses]);
  const c = useMemo(() => cartera(facturas, hoy), [facturas, hoy]);

  if (facturas.every((f) => f.estado === "borrador")) return null;

  return (
    <div className="graf-rejilla-paneles">
      <section className="graf-panel" aria-labelledby="g-fact-mes">
        <h2 id="g-fact-mes">Facturado y cobrado por mes</h2>
        <p className="graf-sub">Últimos seis meses: importe emitido (con IVA) y cobros registrados.</p>
        <Columnas
          titulo="Facturado y cobrado por mes"
          descripcion="Gráfico de columnas agrupadas con el importe facturado y el cobrado en cada uno de los últimos seis meses."
          meses={meses}
          series={[
            { nombre: "Facturado", color: "var(--graf-1)", valores: facturado },
            { nombre: "Cobrado", color: "var(--graf-2)", valores: cobrado },
          ]}
          formato={eur}
          unidad=" €"
        />
      </section>

      <section className="graf-panel" aria-labelledby="g-cartera">
        <h2 id="g-cartera">Estado de la cartera</h2>
        <p className="graf-sub">Lo cobrado y lo que falta por cobrar, separando lo que ya ha vencido.</p>
        <BarrasHorizontales
          titulo="Estado de la cartera de cobro"
          filas={[
            { etiqueta: "Cobrado", valor: c.cobrado, texto: eur(c.cobrado), color: "var(--graf-1)" },
            { etiqueta: "Pendiente en plazo", valor: c.enPlazo, texto: eur(c.enPlazo), color: "var(--graf-neutro)" },
            { etiqueta: "Vencido", valor: c.vencido, texto: eur(c.vencido), color: "var(--graf-critico)" },
          ]}
        />
      </section>
    </div>
  );
}
