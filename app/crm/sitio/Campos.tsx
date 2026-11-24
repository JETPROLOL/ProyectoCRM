"use client";
import { ChangeEvent, useRef, useState } from "react";
import { BLOQUES, Bloque, Campo, Datos, lista, txt } from "@/lib/sitio/tipos";
import Icono from "../Icono";

// Editores de campos del panel lateral. Todos tienen etiqueta visible y los botones de iconos llevan nombre accesible.

export type SubirImagen = (f: File) => Promise<string>;

export function CampoImagen({ etiqueta, ayuda, valor, alt, onValor, onAlt, subir, avisar }: {
  etiqueta: string; ayuda?: string; valor: string; alt: string;
  onValor: (v: string) => void; onAlt: (v: string) => void; subir: SubirImagen; avisar: (m: string) => void;
}) {
  const archivo = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  async function elegido(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setSubiendo(true);
    try { onValor(await subir(f)); avisar(`Imagen «${f.name}» subida.`); }
    catch (err) { avisar(`No se pudo subir la imagen. ${err instanceof Error ? err.message : ""}`); }
    setSubiendo(false);
  }
  return (
    <fieldset>
      <legend>{etiqueta}</legend>
      {ayuda && <p className="sitio-ayuda">{ayuda}</p>}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {valor && <img className="sitio-img-vista" src={valor} alt="" />}
      <label>Dirección de la imagen (URL)
        <input type="url" value={valor} onChange={(e) => onValor(e.target.value.trim())} placeholder="https://…" maxLength={500} />
      </label>
      <div className="sitio-fila">
        <input ref={archivo} type="file" accept="image/png,image/jpeg,image/webp" className="sitio-archivo" onChange={elegido}
          aria-label={`${etiqueta}: elegir archivo (PNG, JPG o WebP, máximo 2 MB)`} tabIndex={-1} />
        <button type="button" className="btn sec peq" onClick={() => archivo.current?.click()} disabled={subiendo}><Icono nombre="upload" />{subiendo ? "Subiendo…" : "Subir imagen"}</button>
        {valor && <button type="button" className="btn sec peq" onClick={() => { onValor(""); onAlt(""); }}><Icono nombre="trash" />Quitar<span className="sitio-solo-lectores"> {etiqueta.toLowerCase()}</span></button>}
      </div>
      <p className="sitio-ayuda">PNG, JPG o WebP, máximo 2 MB.</p>
      {valor && (
        <label>Texto alternativo
          <input type="text" value={alt} onChange={(e) => onAlt(e.target.value)} maxLength={160} aria-describedby={`alt-${etiqueta.replace(/\W/g, "")}`} />
        </label>
      )}
      {valor && <p id={`alt-${etiqueta.replace(/\W/g, "")}`} className="sitio-ayuda">Describe la imagen para quien no pueda verla. Si solo es decorativa, déjalo vacío.</p>}
    </fieldset>
  );
}

type Props = {
  bloque: Bloque; bloques: Bloque[];
  onDatos: (cambio: Datos, clave: string) => void;
  subir: SubirImagen; avisar: (m: string) => void; anunciar: (m: string) => void;
};

export default function Campos({ bloque, bloques, onDatos, subir, avisar, anunciar }: Props) {
  const def = BLOQUES[bloque.tipo];
  const d = bloque.datos;
  const clave = (k: string) => `${bloque.id}.${k}`;

  const opcionesEnlace = [
    { v: "", t: "Ningún sitio (el botón no se muestra)" },
    { v: "mail", t: "Escribir un correo a la empresa" },
    { v: "tel", t: "Llamar por teléfono a la empresa" },
    ...bloques.filter((b) => b.id !== bloque.id).map((b) => ({ v: "#" + b.id, t: `Ir a la sección: ${b.menu || BLOQUES[b.tipo].nombre}${b.visible ? "" : " (oculta)"}` })),
  ];

  function campoSimple(c: { clave: string; etiqueta: string; tipo: "texto" | "area" | "enlace"; max?: number }, valor: string, cambiar: (v: string) => void, k: string) {
    if (c.tipo === "area") return <label key={c.clave}>{c.etiqueta}<textarea rows={4} maxLength={c.max} value={valor} onChange={(e) => cambiar(e.target.value)} /></label>;
    if (c.tipo === "enlace") {
      return (
        <label key={c.clave}>{c.etiqueta}
          <select value={valor} onChange={(e) => cambiar(e.target.value)}>
            {opcionesEnlace.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
            {valor && !opcionesEnlace.some((o) => o.v === valor) && <option value={valor}>Destino que ya no existe</option>}
          </select>
        </label>
      );
    }
    return <label key={c.clave}>{c.etiqueta}<input type="text" maxLength={c.max} value={valor} onChange={(e) => cambiar(e.target.value)} data-k={k} /></label>;
  }

  function renderCampo(c: Campo) {
    if (c.tipo === "imagen") {
      return <CampoImagen key={c.clave} etiqueta={c.etiqueta} ayuda={c.ayuda} valor={txt(d, c.clave)} alt={txt(d, c.claveAlt)} subir={subir} avisar={avisar}
        onValor={(v) => onDatos({ [c.clave]: v }, clave(c.clave))} onAlt={(v) => onDatos({ [c.claveAlt]: v }, clave(c.claveAlt))} />;
    }
    if (c.tipo === "lista") {
      const items = lista(d, c.clave);
      const poner = (nuevos: Record<string, string>[], k: string) => onDatos({ [c.clave]: nuevos }, k);
      return (
        <fieldset key={c.clave}>
          <legend>{c.etiqueta} ({items.length} de {c.max})</legend>
          {items.map((it, i) => (
            <fieldset key={i} className="sitio-item">
              <legend className="sitio-solo-lectores">{c.nombreItem} {i + 1}</legend>
              <div className="sitio-item-cab">
                <span aria-hidden="true">{c.nombreItem[0].toUpperCase() + c.nombreItem.slice(1)} {i + 1}</span>
                <div className="sitio-lista-acc">
                  <button type="button" className="sitio-icono-btn" disabled={i === 0} aria-label={`Subir ${c.nombreItem} ${i + 1}`}
                    onClick={() => { const n = [...items]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; poner(n, ""); anunciar(`${c.nombreItem} movido a la posición ${i}.`); }}><Icono nombre="arrow-up" /></button>
                  <button type="button" className="sitio-icono-btn" disabled={i === items.length - 1} aria-label={`Bajar ${c.nombreItem} ${i + 1}`}
                    onClick={() => { const n = [...items]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; poner(n, ""); anunciar(`${c.nombreItem} movido a la posición ${i + 2}.`); }}><Icono nombre="arrow-down" /></button>
                  <button type="button" className="sitio-icono-btn peligro" aria-label={`Quitar ${c.nombreItem} ${i + 1}`}
                    onClick={() => { poner(items.filter((_, j) => j !== i), ""); anunciar(`${c.nombreItem} ${i + 1} quitado.`); }}><Icono nombre="trash" /></button>
                </div>
              </div>
              {c.campos.map((sc) => campoSimple(sc, it[sc.clave] ?? "", (v) => poner(items.map((x, j) => (j === i ? { ...x, [sc.clave]: v } : x)), clave(`${c.clave}.${i}.${sc.clave}`)), sc.clave))}
            </fieldset>
          ))}
          <button type="button" className="btn sec peq" disabled={items.length >= c.max} style={{ alignSelf: "flex-start" }}
            onClick={() => { poner([...items, Object.fromEntries(c.campos.map((sc) => [sc.clave, ""]))], ""); anunciar(`${c.nombreItem} añadido.`); }}>
            <Icono nombre="plus" />Añadir {c.nombreItem}
          </button>
          {items.length >= c.max && <p className="sitio-ayuda">Has llegado al máximo ({c.max}).</p>}
        </fieldset>
      );
    }
    return campoSimple(c, txt(d, c.clave), (v) => onDatos({ [c.clave]: v }, clave(c.clave)), c.clave);
  }

  return <div className="sitio-campos">{def.campos.map(renderCampo)}</div>;
}
