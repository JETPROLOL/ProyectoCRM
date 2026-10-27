"use client";
// Gráficos del CRM sin librerías: barras horizontales (HTML) y columnas agrupadas (SVG).
// Accesibilidad: título y descripción en texto, valores siempre escritos (no solo en color) y tabla de datos equivalente.
import { useId } from "react";
import { Mes, escala } from "@/lib/graficas";
import "./graficas.css";

export type FilaBarra = { etiqueta: string; valor: number; texto: string; color?: string };

// Barras horizontales: etiqueta · barra · valor escrito. La propia lista es la versión accesible del gráfico.
export function BarrasHorizontales({ titulo, filas }: { titulo: string; filas: FilaBarra[] }) {
  const max = Math.max(...filas.map((f) => Math.abs(f.valor)), 0);
  return (
    <ul className="graf-hbarras" aria-label={titulo}>
      {filas.map((f) => {
        const pct = max === 0 ? 0 : (Math.abs(f.valor) / max) * 100;
        return (
          <li key={f.etiqueta}>
            <span className="graf-etq">{f.etiqueta}</span>
            <span className="graf-pista" aria-hidden="true">
              <span className="graf-barra" style={{ width: f.valor === 0 ? 0 : `max(${pct}%, 3px)`, background: f.color ?? "var(--graf-1)" }} />
            </span>
            <span className="graf-val">{f.texto}</span>
          </li>
        );
      })}
    </ul>
  );
}

export type Serie = { nombre: string; color: string; valores: number[] };

const W = 520, H = 250, ML = 52, MR = 10, MT = 12, MB = 28;
const compacto = new Intl.NumberFormat("es-ES", { notation: "compact", maximumFractionDigits: 1 });

// Barra con 4 px redondeados solo en el extremo del dato; en la base (el cero) queda recta
function trazoBarra(x: number, ancho: number, y0: number, yFin: number) {
  const alto = Math.abs(yFin - y0);
  const r = Math.min(4, alto, ancho / 2);
  const arriba = yFin < y0;
  if (alto === 0) return "";
  return arriba
    ? `M${x},${y0}V${yFin + r}Q${x},${yFin} ${x + r},${yFin}H${x + ancho - r}Q${x + ancho},${yFin} ${x + ancho},${yFin + r}V${y0}Z`
    : `M${x},${y0}V${yFin - r}Q${x},${yFin} ${x + r},${yFin}H${x + ancho - r}Q${x + ancho},${yFin} ${x + ancho},${yFin - r}V${y0}Z`;
}

// Columnas por mes, con una o varias series. `formato` escribe un valor completo; `unidad` va en el eje (p. ej. " €").
export function Columnas({ titulo, descripcion, meses, series, formato, unidad = "" }: {
  titulo: string; descripcion: string; meses: Mes[]; series: Serie[]; formato: (n: number) => string; unidad?: string;
}) {
  const id = useId();
  const todos = series.flatMap((s) => s.valores);
  const esc = escala(Math.min(...todos, 0), Math.max(...todos, 0));
  const pw = W - ML - MR, ph = H - MT - MB;
  const y = (v: number) => MT + ph - ((v - esc.min) / (esc.max - esc.min || 1)) * ph;
  const banda = pw / meses.length;
  const ancho = Math.min(24, (banda * 0.7 - 2 * (series.length - 1)) / series.length);
  const grupo = ancho * series.length + 2 * (series.length - 1);
  const multi = series.length > 1;

  return (
    <figure className="graf-fig">
      {multi && (
        <ul className="graf-leyenda" aria-label="Leyenda">
          {series.map((s) => <li key={s.nombre}><span className="graf-clave" style={{ background: s.color }} aria-hidden="true" />{s.nombre}</li>)}
        </ul>
      )}
      <div className="graf-scroll" tabIndex={0} role="region" aria-label={`${titulo}: gráfico, desplazable en pantallas estrechas`}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${id}t ${id}d`} className="graf-svg">
          <title id={`${id}t`}>{titulo}</title>
          <desc id={`${id}d`}>{descripcion} Los valores exactos están en la tabla de datos que hay debajo.</desc>
          {esc.marcas.map((v) => (
            <g key={v}>
              <line x1={ML} x2={W - MR} y1={y(v)} y2={y(v)} className={v === 0 ? "graf-base" : "graf-rejilla"} />
              <text x={ML - 8} y={y(v) + 4} textAnchor="end" className="graf-texto">{compacto.format(v)}{unidad}</text>
            </g>
          ))}
          {meses.map((m, i) => {
            const x0 = ML + banda * i + (banda - grupo) / 2;
            return (
              <g key={m.clave}>
                {series.map((s, j) => (
                  <path key={s.nombre} d={trazoBarra(x0 + j * (ancho + 2), ancho, y(0), y(s.valores[i]))} fill={s.color} />
                ))}
                <text x={ML + banda * i + banda / 2} y={H - 8} textAnchor="middle" className="graf-texto">{m.corto}</text>
                {/* Zona de paso del ratón más grande que las barras: muestra los valores del mes */}
                <rect x={ML + banda * i} y={MT} width={banda} height={ph} fill="transparent">
                  <title>{`${m.largo}: ${series.map((s) => `${s.nombre} ${formato(s.valores[i])}`).join(" · ")}`}</title>
                </rect>
              </g>
            );
          })}
        </svg>
      </div>
      <details className="graf-tabla">
        <summary>Ver los datos en una tabla</summary>
        <table>
          <caption className="graf-solo-lectores">{titulo}</caption>
          <thead><tr><th scope="col">Mes</th>{series.map((s) => <th key={s.nombre} scope="col">{s.nombre}</th>)}</tr></thead>
          <tbody>
            {meses.map((m, i) => (
              <tr key={m.clave}><th scope="row">{m.largo}</th>{series.map((s) => <td key={s.nombre}>{formato(s.valores[i])}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
