export type Evaluacion = {
  id: string; created_at: string; updated_at: string; evaluado_id: string; evaluador_user_id: string;
  puntuacion: number; comentario: string | null; trimestre: string;
};
export type MediaEval = { evaluado_id: string; media: number; total: number };

// Trimestres naturales: T1 ene-mar, T2 abr-jun, T3 jul-sep, T4 oct-dic. Se identifican por su primer día (AAAA-MM-01),
// igual que en la base de datos (columna evaluaciones.trimestre).
export function inicioTrimestre(d = new Date()) {
  const mes = Math.floor(d.getMonth() / 3) * 3;
  return `${d.getFullYear()}-${String(mes + 1).padStart(2, "0")}-01`;
}

export function trimestresRecientes(n = 4, d = new Date()) {
  const lista: string[] = [];
  let a = d.getFullYear(), t = Math.floor(d.getMonth() / 3);
  for (let i = 0; i < n; i++) {
    lista.push(`${a}-${String(t * 3 + 1).padStart(2, "0")}-01`);
    if (--t < 0) { t = 3; a--; }
  }
  return lista;
}

const MESES = ["ene–mar", "abr–jun", "jul–sep", "oct–dic"];
export function etiquetaTrimestre(iso: string) {
  const [a, m] = iso.split("-").map(Number);
  const t = Math.floor((m - 1) / 3);
  return `T${t + 1} ${a} (${MESES[t]})`;
}

// Fecha en la que se reinician las evaluaciones: el primer día del siguiente trimestre
export function proximoReinicio(d = new Date()) {
  const mes = (Math.floor(d.getMonth() / 3) + 1) * 3;
  return new Date(d.getFullYear(), mes, 1).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
}

export const nota = (n: number) => n.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
