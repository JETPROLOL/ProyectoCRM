"use client";
import { CSSProperties, Fragment, MouseEvent, ReactNode, useRef } from "react";
import { Ajustes, BLOQUES, Bloque, Contenido, FONDOS, FUENTES, PlantillaId, ajustarTexto, lista, textoSobre, txt } from "@/lib/sitio/tipos";
import "./plantillas.css";

// Dibuja un sitio a partir de su contenido. Lo usan el editor (editable), la vista previa y las miniaturas de la galería.
// Accesibilidad: cada sección es un <section> con su título; los colores de texto se ajustan solos para cumplir 4,5 : 1;
// los textos de ejemplo de las ilustraciones están ocultos a lectores (son decorativas).
// Los niveles de título empiezan en h2 porque la página del CRM ya tiene su propio h1.

type Props = {
  sitio: Contenido & { plantilla: PlantillaId };
  editable?: boolean;
  seleccionado?: string | null;
  onSeleccionar?: (id: string) => void;
};

// Resuelve el destino de un botón: "#<id de sección>", "mail" o "tel"
function destino(valor: string, a: Ajustes, bloques: Bloque[]): string | undefined {
  if (valor === "mail") return a.email ? `mailto:${a.email}` : undefined;
  if (valor === "tel") return a.telefono ? `tel:${a.telefono.replace(/[^\d+]/g, "")}` : undefined;
  if (valor.startsWith("#") && bloques.some((b) => b.id === valor.slice(1) && b.visible)) return `#sw-${valor.slice(1)}`;
  return undefined;
}

const Parrafos = ({ texto }: { texto: string }) => (
  <>{texto.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).map((p, i) => <p key={i}>{p}</p>)}</>
);

// Ilustraciones decorativas de la portada cuando no se sube imagen
function ArteHero({ plantilla }: { plantilla: PlantillaId }) {
  if (plantilla === "moderna") {
    return (
      <svg viewBox="0 0 480 360" className="sw-arte" aria-hidden="true" focusable="false">
        <g fill="none" stroke="currentColor" strokeWidth="1.5" opacity=".55">
          <circle cx="240" cy="180" r="130" /><ellipse cx="240" cy="180" rx="130" ry="50" /><ellipse cx="240" cy="180" rx="60" ry="130" />
          <path d="M110 180h260M240 50v260" />
        </g>
        <path d="M120 230C170 90 330 80 380 150" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="2 9" />
        <circle cx="120" cy="230" r="9" fill="currentColor" /><circle cx="380" cy="150" r="9" fill="currentColor" />
        <circle cx="380" cy="150" r="20" fill="none" stroke="currentColor" strokeWidth="2" opacity=".5" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 480 360" className="sw-arte" aria-hidden="true" focusable="false">
      <rect x="20" y="20" width="440" height="320" rx="14" className="sw-arte-fondo" />
      <g stroke="currentColor" strokeWidth="1" opacity=".18">
        {[80, 140, 200, 260, 320].map((y) => <path key={y} d={`M20 ${y}H460`} />)}
        {[100, 180, 260, 340, 420].map((x) => <path key={x} d={`M${x} 20V340`} />)}
      </g>
      <path d="M70 280C130 150 230 290 290 170S400 90 420 70" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeDasharray="3 12" />
      <g fill="currentColor"><circle cx="70" cy="280" r="10" /><circle cx="290" cy="170" r="10" /><circle cx="420" cy="70" r="10" /></g>
      <g className="sw-arte-caja"><rect x="236" y="196" width="68" height="48" rx="6" /><path d="M236 214h68M270 196v18" fill="none" strokeWidth="3" /></g>
    </svg>
  );
}

function Boton({ texto, valor, a, bloques, tipo = "principal" }: { texto: string; valor: string; a: Ajustes; bloques: Bloque[]; tipo?: "principal" | "contorno" }) {
  const href = destino(valor, a, bloques);
  if (!texto || !href) return null;
  return <a className="sw-boton" data-tipo={tipo} href={href}>{texto}</a>;
}

export default function SitioRender({ sitio, editable = false, seleccionado = null, onSeleccionar }: Props) {
  const raiz = useRef<HTMLElement>(null);
  const { tema, ajustes: a, bloques, plantilla } = sitio;
  const visibles = bloques.filter((b) => b.visible);
  const menu = visibles.filter((b) => b.menu.trim());
  const fondos = FONDOS[tema.modo] ?? FONDOS.claro;

  const estilo = {
    "--sw-acento": tema.color,
    "--sw-sobre": textoSobre(tema.color),
    "--sw-acento-txt": ajustarTexto(tema.color, [fondos.base, fondos.alt]),
    "--sw-f": (FUENTES[tema.fuente] ?? FUENTES.sans).css,
  } as CSSProperties;

  // Los enlaces internos mueven el desplazamiento dentro de la vista previa; en el editor ningún enlace navega
  function alClic(e: MouseEvent<HTMLElement>) {
    const enlace = (e.target as HTMLElement).closest("a");
    if (!enlace) return;
    const h = enlace.getAttribute("href") ?? "";
    if (editable || h.startsWith("#sw-")) e.preventDefault();
    if (!h.startsWith("#sw-")) return;
    const el = raiz.current?.querySelector<HTMLElement>(`#${CSS.escape(h.slice(1))}`);
    if (!el) return;
    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const caja = raiz.current?.closest<HTMLElement>("[data-scroll]");
    if (caja) {
      const cabecera = raiz.current?.querySelector<HTMLElement>(".sw-cab")?.offsetHeight ?? 0;
      caja.scrollTo({ top: caja.scrollTop + el.getBoundingClientRect().top - caja.getBoundingClientRect().top - cabecera, behavior: quieto ? "auto" : "smooth" });
    } else el.scrollIntoView({ behavior: quieto ? "auto" : "smooth", block: "start" });
  }

  // En el editor los enlaces y botones de la vista previa no reciben el foco: se edita desde el panel
  const sinFoco = editable ? { tabIndex: -1 } : {};

  // Se llaman como funciones (no como componentes) para que React no vuelva a montar toda la vista previa en cada tecla
  function envolver(b: Bloque, children: ReactNode) {
    if (!editable) return <>{children}</>;
    const sel = seleccionado === b.id;
    return (
      <div className="sw-bloque" data-sel={sel} onClick={() => onSeleccionar?.(b.id)}>
        <button type="button" className="sw-editar" onClick={(e) => { e.stopPropagation(); onSeleccionar?.(b.id); }}>
          Editar sección: {BLOQUES[b.tipo].nombre}
        </button>
        {children}
      </div>
    );
  }

  function seccion(b: Bloque) {
    const d = b.datos;
    const idT = `sw-${b.id}-t`;
    const aria = { id: `sw-${b.id}`, "aria-labelledby": idT };
    switch (b.tipo) {
      case "hero": {
        const img = txt(d, "imagen");
        return (
          <section {...aria} className="sw-sec sw-hero" data-imagen={img ? "si" : "no"}>
            <div className="sw-cont sw-hero-grid">
              <div className="sw-hero-texto">
                {txt(d, "etiqueta") && <p className="sw-etiqueta">{txt(d, "etiqueta")}</p>}
                <h2 id={idT}>{txt(d, "titulo")}</h2>
                {txt(d, "texto") && <p className="sw-lead">{txt(d, "texto")}</p>}
                <Boton texto={txt(d, "botonTexto")} valor={txt(d, "botonEnlace")} a={a} bloques={bloques} />
              </div>
              <div className="sw-hero-media">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {img ? <img src={img} alt={txt(d, "imagenAlt")} /> : <ArteHero plantilla={plantilla} />}
              </div>
            </div>
          </section>
        );
      }
      case "servicios":
        return (
          <section {...aria} className="sw-sec sw-servicios">
            <div className="sw-cont">
              <header className="sw-titular"><h3 id={idT}>{txt(d, "titulo")}</h3>{txt(d, "intro") && <p>{txt(d, "intro")}</p>}</header>
              <ul className="sw-rejilla">
                {lista(d, "items").map((it, i) => (
                  <li key={i} className="sw-tarjeta">
                    <span className="sw-num" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
                    <h4>{it.titulo}</h4><p>{it.texto}</p>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        );
      case "sobre": {
        const img = txt(d, "imagen");
        return (
          <section {...aria} className="sw-sec sw-sobre" data-imagen={img ? "si" : "no"}>
            <div className="sw-cont sw-sobre-grid">
              <div className="sw-sobre-texto">
                <h3 id={idT}>{txt(d, "titulo")}</h3>
                <Parrafos texto={txt(d, "texto")} />
                {lista(d, "puntos").length > 0 && (
                  <ul className="sw-puntos">{lista(d, "puntos").map((p, i) => <li key={i}>{p.texto}</li>)}</ul>
                )}
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {img && <div className="sw-sobre-media"><img src={img} alt={txt(d, "imagenAlt")} /></div>}
            </div>
          </section>
        );
      }
      case "cifras":
        return (
          <section {...aria} className="sw-sec sw-cifras" aria-label="Cifras de la empresa">
            <div className="sw-cont">
              <ul className="sw-cifras-lista">
                {lista(d, "items").map((it, i) => <li key={i}><strong>{it.valor}</strong><span>{it.etiqueta}</span></li>)}
              </ul>
            </div>
          </section>
        );
      case "testimonios":
        return (
          <section {...aria} className="sw-sec sw-testimonios">
            <div className="sw-cont">
              <header className="sw-titular"><h3 id={idT}>{txt(d, "titulo")}</h3></header>
              <div className="sw-rejilla">
                {lista(d, "items").map((it, i) => (
                  <figure key={i} className="sw-tarjeta">
                    <blockquote><p>{it.cita}</p></blockquote>
                    <figcaption><strong>{it.autor}</strong>{it.cargo && <span>{it.cargo}</span>}</figcaption>
                  </figure>
                ))}
              </div>
            </div>
          </section>
        );
      case "cta":
        return (
          <section {...aria} className="sw-sec sw-cta">
            <div className="sw-cont sw-cta-in">
              <div><h3 id={idT}>{txt(d, "titulo")}</h3>{txt(d, "texto") && <p>{txt(d, "texto")}</p>}</div>
              <Boton texto={txt(d, "botonTexto")} valor={txt(d, "botonEnlace")} a={a} bloques={bloques} tipo="contorno" />
            </div>
          </section>
        );
      case "contacto": {
        const filas: [string, string, string?][] = [
          ["Dirección", a.direccion], ["Teléfono", a.telefono, destino("tel", a, bloques)],
          ["Correo electrónico", a.email, destino("mail", a, bloques)], ["Horario", a.horario],
        ];
        return (
          <section {...aria} className="sw-sec sw-contacto">
            <div className="sw-cont">
              <header className="sw-titular"><h3 id={idT}>{txt(d, "titulo")}</h3>{txt(d, "intro") && <p>{txt(d, "intro")}</p>}</header>
              <dl className="sw-datos">
                {filas.filter(([, v]) => v).map(([k, v, href]) => (
                  <div key={k} className="sw-tarjeta"><dt>{k}</dt><dd>{href ? <a href={href} {...sinFoco}>{v}</a> : v}</dd></div>
                ))}
              </dl>
            </div>
          </section>
        );
      }
    }
  }

  return (
    <article ref={raiz} className="sw" data-plantilla={plantilla} data-modo={tema.modo} style={estilo}
      aria-label={`Vista previa de la web de ${a.nombre}`} onClick={alClic}>
      <div className="sw-cab">
        <div className="sw-cont sw-cab-in">
          <span className="sw-marca">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {a.logoUrl ? <img src={a.logoUrl} alt={a.logoAlt} /> : <span className="sw-monograma" aria-hidden="true">{a.nombre.trim().charAt(0).toUpperCase() || "M"}</span>}
            <span>{a.nombre}</span>
          </span>
          {menu.length > 0 && (
            <nav aria-label="Menú del sitio">
              <ul>{menu.map((b) => <li key={b.id}><a href={`#sw-${b.id}`} {...sinFoco}>{b.menu}</a></li>)}</ul>
            </nav>
          )}
        </div>
      </div>

      {visibles.length === 0 && <p className="sw-vacio">Esta web no tiene secciones visibles. Añade o muestra alguna desde el panel.</p>}
      {visibles.map((b) => <Fragment key={b.id}>{envolver(b, seccion(b))}</Fragment>)}

      <div className="sw-pie">
        <div className="sw-cont sw-pie-in">
          <div><strong>{a.nombre}</strong>{a.eslogan && <span>{a.eslogan}</span>}</div>
          <p>{a.pie}</p>
        </div>
      </div>
    </article>
  );
}
