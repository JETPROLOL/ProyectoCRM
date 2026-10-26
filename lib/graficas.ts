// Cálculos para los gráficos del CRM. Funciones puras: reciben datos ya cargados y devuelven números.
// Los importes se suman en céntimos enteros para no arrastrar errores de coma flotante.

export type Mes = { clave: string; corto: string; largo: string };

// Los últimos n meses terminando en el de "hoy" (YYYY-MM-DD), del más antiguo al más reciente
export function ultimosMeses(n: number, hoy: string): Mes[] {
  const [y, m] = hoy.split("-").map(Number);
  const meses: Mes[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 15));
    meses.push({
      clave: d.toISOString().slice(0, 7),
      corto: d.toLocaleDateString("es-ES", { month: "short", timeZone: "UTC" }).replace(".", ""),
      largo: d.toLocaleDateString("es-ES", { month: "long", year: "numeric", timeZone: "UTC" }),
    });
  }
  return meses;
}

// Día (YYYY-MM-DD) en hora de Madrid de una marca de tiempo de la base de datos
export const diaMadrid = (ts: string) => new Date(ts).toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });

// Suma por mes (los que caen fuera de la ventana se ignoran)
export function sumaPorMes(items: { fecha: string | null; importe: number }[], meses: Mes[]): number[] {
  const cent = new Map(meses.map((m) => [m.clave, 0]));
  for (const it of items) {
    if (!it.fecha) continue;
    const k = it.fecha.slice(0, 7);
    if (cent.has(k)) cent.set(k, (cent.get(k) ?? 0) + Math.round(it.importe * 100));
  }
  return meses.map((m) => (cent.get(m.clave) ?? 0) / 100);
}

export const cuentaPorMes = (fechas: string[], meses: Mes[]) =>
  sumaPorMes(fechas.map((fecha) => ({ fecha, importe: 1 })), meses);

// Oportunidades -------------------------------------------------------------
export const ESTADOS_EMBUDO = ["nueva", "contactada", "propuesta", "ganada", "perdida"] as const;
export type EstadoEmbudo = (typeof ESTADOS_EMBUDO)[number];
export const ETIQUETA_EMBUDO: Record<EstadoEmbudo, string> = {
  nueva: "Nueva", contactada: "Contactada", propuesta: "Propuesta", ganada: "Ganada", perdida: "Perdida",
};

type Op = { estado: string; valor_estimado: number | null };
export function resumenOportunidades(ops: Op[]) {
  const por = Object.fromEntries(ESTADOS_EMBUDO.map((e) => [e, { n: 0, cent: 0 }])) as Record<EstadoEmbudo, { n: number; cent: number }>;
  for (const o of ops) {
    const e = por[o.estado as EstadoEmbudo];
    if (!e) continue;
    e.n += 1;
    e.cent += Math.round((o.valor_estimado ?? 0) * 100);
  }
  const abiertas = por.nueva.n + por.contactada.n + por.propuesta.n;
  const valorAbierto = (por.nueva.cent + por.contactada.cent + por.propuesta.cent) / 100;
  const cerradas = por.ganada.n + por.perdida.n;
  return {
    por: Object.fromEntries(ESTADOS_EMBUDO.map((e) => [e, { n: por[e].n, valor: por[e].cent / 100 }])) as Record<EstadoEmbudo, { n: number; valor: number }>,
    abiertas, valorAbierto, valorGanado: por.ganada.cent / 100,
    // Conversión = ganadas / (ganadas + perdidas); sin oportunidades cerradas no hay dato
    conversion: cerradas === 0 ? null : por.ganada.n / cerradas,
    ganadas: por.ganada.n, perdidas: por.perdida.n,
  };
}

// Escala "bonita" para el eje vertical: 4 tramos con paso 1, 2 o 5 × 10^k, incluyendo el cero y los negativos
export function escala(min: number, max: number): { min: number; max: number; marcas: number[] } {
  const lo = Math.min(0, min), hi = Math.max(0, max);
  const span = hi - lo || 1;
  const bruto = span / 4;
  const pot = Math.pow(10, Math.floor(Math.log10(bruto)));
  const paso = ([1, 2, 5, 10].map((f) => f * pot).find((p) => p >= bruto) ?? 10 * pot);
  const a = Math.floor(lo / paso) * paso, b = Math.ceil(hi / paso) * paso;
  const marcas: number[] = [];
  for (let v = a; v <= b + paso / 2; v += paso) marcas.push(Math.round(v * 100) / 100);
  return { min: a, max: b, marcas };
}
