// Barra de progreso (hechas de total). Usa <span> para poder ir dentro de un botón.
export default function Barra({ hechas, total }: { hechas: number; total: number }) {
  const pct = total ? Math.round((100 * hechas) / total) : 0;
  return (
    <span className="inicio-progreso" data-completa={total > 0 && hechas === total}
      role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progreso del check de inicio">
      <span style={{ width: `${pct}%` }} />
    </span>
  );
}
