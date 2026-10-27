import Link from "next/link";

// Migas de pan: dicen dónde estás y permiten volver con un clic. La última es la página actual.
export type Miga = { texto: string; href?: string };

export default function Migas({ ruta }: { ruta: Miga[] }) {
  return (
    <nav className="migas" aria-label="Ruta de navegación">
      <ol>
        {ruta.map((m, i) => {
          const ultima = i === ruta.length - 1;
          return (
            <li key={`${i}-${m.texto}`}>
              {ultima || !m.href ? <span aria-current={ultima ? "page" : undefined}>{m.texto}</span> : <Link href={m.href}>{m.texto}</Link>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
