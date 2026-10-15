import { nota } from "@/lib/rrhh/evaluaciones";

// Estrellas de solo lectura; admite decimales (una media de 4,3 rellena el 86 % de la quinta estrella)
export function Estrellas({ valor }: { valor: number }) {
  return (
    <span className="eval-estrellas" role="img" aria-label={`${nota(valor)} de 5`}>
      <span className="eval-estrellas-fondo" aria-hidden>★★★★★</span>
      <span className="eval-estrellas-relleno" aria-hidden style={{ width: `${(Math.min(5, Math.max(0, valor)) / 5) * 100}%` }}>★★★★★</span>
    </span>
  );
}

// Selector de nota de 1 a 5
export function SelectorNota({ valor, onCambio, deshabilitado }: { valor: number; onCambio: (n: number) => void; deshabilitado?: boolean }) {
  return (
    <div className="eval-selector" role="radiogroup" aria-label="Nota de 1 a 5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={valor === n} aria-label={`${n} de 5`} disabled={deshabilitado}
          data-on={n <= valor} onClick={() => onCambio(n)}>★</button>
      ))}
      <span className="eval-selector-texto">{valor ? `${valor} de 5` : "Sin nota"}</span>
    </div>
  );
}
