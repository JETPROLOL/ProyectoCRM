export type Fichaje = {
  id: string; created_at: string; empleado_id: string; entrada: string; salida: string | null; nota: string | null;
};

export type EstadoVacaciones = "pendiente" | "aprobada" | "rechazada";
export type Vacacion = {
  id: string; created_at: string; empleado_id: string; desde: string; hasta: string; comentario: string | null;
  estado: EstadoVacaciones; respuesta: string | null; resuelta_por: string | null; resuelta_en: string | null;
};

// ---------- Fichajes ----------

// Milisegundos trabajados en un fichaje (si sigue abierto, hasta "ahora")
export const duracionMs = (f: Pick<Fichaje, "entrada" | "salida">, ahora = Date.now()) =>
  Math.max(0, (f.salida ? new Date(f.salida).getTime() : ahora) - new Date(f.entrada).getTime());

// 27120000 -> "7 h 32 min"
export function horasMin(ms: number) {
  const min = Math.floor(ms / 60000);
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min`;
}

// 27120000 -> "07:32:00" (cronómetro)
export function cronometro(ms: number) {
  const s = Math.floor(ms / 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

export const hora = (iso: string) => new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
export const fechaLarga = (iso: string) =>
  new Date(iso).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });

// Fecha local en formato AAAA-MM-DD (la que usan los <input type="date">)
export function aISODia(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export const hoyISO = () => aISODia(new Date());
export const dia = (iso: string) => aISODia(new Date(iso));

export function inicioSemana(d = new Date()) {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  r.setDate(r.getDate() - ((r.getDay() + 6) % 7)); // lunes
  return r;
}
export const inicioMes = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1);

// Suma las horas de los fichajes que empiezan en [desde, hasta)
export function sumaMs(lista: Fichaje[], desde: Date, hasta: Date, ahora = Date.now()) {
  return lista
    .filter((f) => { const t = new Date(f.entrada).getTime(); return t >= desde.getTime() && t < hasta.getTime(); })
    .reduce((s, f) => s + duracionMs(f, ahora), 0);
}

// Valor para <input type="datetime-local"> a partir de un instante, y al revés
export function aInputLocal(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${aISODia(d)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
export const deInputLocal = (v: string) => (v ? new Date(v).toISOString() : null);

// ---------- Vacaciones ----------

const parteDia = (iso: string) => { const [a, m, d] = iso.split("-").map(Number); return new Date(a, m - 1, d); };

// Días laborables (lunes a viernes) entre dos fechas, ambas incluidas
export function diasLaborables(desde: string, hasta: string) {
  if (!desde || !hasta || hasta < desde) return 0;
  let n = 0;
  for (let d = parteDia(desde); d <= parteDia(hasta); d.setDate(d.getDate() + 1)) {
    if (d.getDay() !== 0 && d.getDay() !== 6) n++;
  }
  return n;
}

export const fechaDia = (iso: string) =>
  parteDia(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
export const rangoFechas = (v: Pick<Vacacion, "desde" | "hasta">) =>
  v.desde === v.hasta ? fechaDia(v.desde) : `${fechaDia(v.desde)} – ${fechaDia(v.hasta)}`;

export const seSolapan = (a: Pick<Vacacion, "desde" | "hasta">, b: Pick<Vacacion, "desde" | "hasta">) =>
  a.desde <= b.hasta && b.desde <= a.hasta;

export const ETIQUETA_VAC: Record<EstadoVacaciones, string> = { pendiente: "Pendiente", aprobada: "Aprobada", rechazada: "Rechazada" };
