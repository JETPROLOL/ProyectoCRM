"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { rutaArchivo } from "@/lib/rrhh/archivos";
import { PLANTILLAS, plantillaPorId } from "@/lib/sitio/plantillas";
import {
  Ajustes, BLOQUES, Bloque, Datos, FUENTES, FONDOS, FilaSitio, FuenteId, ModoId, PlantillaId, Sitio, TIPOS_BLOQUE, TipoBloque,
  contraste, crearBloque, esHex, normalizar, textoSobre,
} from "@/lib/sitio/tipos";
import Migas from "../../Migas";
import Icono from "../../Icono";
import SitioRender from "../SitioRender";
import Dispositivos, { Dispositivo } from "../Dispositivos";
import Campos, { CampoImagen } from "../Campos";

const MUESTRAS = [
  { c: "#1c5cab", n: "Azul" }, { c: "#15803d", n: "Verde" }, { c: "#c2410c", n: "Naranja" },
  { c: "#6d28d9", n: "Violeta" }, { c: "#2dd4bf", n: "Turquesa" }, { c: "#b91c1c", n: "Rojo" },
];

const nombreBloque = (b: Bloque) => BLOQUES[b.tipo].nombre;

export default function Editor() {
  const { id } = useParams<{ id: string }>();
  const [sitio, setSitio] = useState<Sitio | null | undefined>(undefined);
  const actual = useRef<Sitio | null>(null);
  const guardadoJson = useRef("");
  const [pasado, setPasado] = useState<Sitio[]>([]);
  const [futuro, setFuturo] = useState<Sitio[]>([]);
  const ultimo = useRef<{ clave: string; t: number }>({ clave: "", t: 0 });

  const [pestana, setPestana] = useState<"secciones" | "diseno">("secciones");
  const [sel, setSel] = useState<string | null>(null);
  const [dispositivo, setDispositivo] = useState<Dispositivo>("ordenador");
  const [tipoNuevo, setTipoNuevo] = useState<TipoBloque>("servicios");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [anuncio, setAnuncio] = useState("");
  const [hex, setHex] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const montado = useRef(false);

  // ---------- Carga ----------
  useEffect(() => {
    let vivo = true;
    supabase.from("sitios_web").select("*").eq("id", id).maybeSingle().then(({ data, error }) => {
      if (!vivo) return;
      if (error || !data) { setError(error ? `No se pudo cargar el sitio. ${error.message}` : ""); setSitio(null); return; }
      const f = data as FilaSitio;
      const s = normalizar(f, plantillaPorId(f.plantilla).crear());
      actual.current = s; guardadoJson.current = firma(s); setSitio(s); setHex(s.tema.color);
    });
    return () => { vivo = false; };
  }, [id]);

  const sucio = useMemo(() => !!sitio && firma(sitio) !== guardadoJson.current, [sitio]);

  // Al pasar de la lista a una sección (o al revés) el foco va al título del panel: quien usa teclado o lector no se queda sin contexto
  useEffect(() => {
    if (!montado.current) { montado.current = true; return; }
    panelRef.current?.querySelector<HTMLElement>("h2")?.focus();
  }, [sel, pestana]);

  // ---------- Historial (deshacer / rehacer) ----------
  // Los cambios seguidos en el mismo campo (escribir) se agrupan en un solo paso del historial.
  const aplicar = useCallback((nuevo: Sitio, clave = "") => {
    const ant = actual.current;
    if (!ant) return;
    const ahora = Date.now();
    const unir = clave !== "" && ultimo.current.clave === clave && ahora - ultimo.current.t < 1500;
    if (!unir) setPasado((p) => [...p.slice(-49), ant]);
    ultimo.current = { clave, t: ahora };
    setFuturo([]);
    actual.current = nuevo; setSitio(nuevo);
  }, []);
  const cambiar = useCallback((fn: (s: Sitio) => Sitio, clave = "") => { if (actual.current) aplicar(fn(actual.current), clave); }, [aplicar]);

  function deshacer() {
    const prev = pasado[pasado.length - 1];
    if (!prev || !actual.current) return;
    setFuturo((f) => [...f, actual.current as Sitio]); setPasado((p) => p.slice(0, -1));
    actual.current = prev; setSitio(prev); setHex(prev.tema.color); ultimo.current = { clave: "", t: 0 };
    setAnuncio("Cambio deshecho.");
  }
  function rehacer() {
    const sig = futuro[futuro.length - 1];
    if (!sig || !actual.current) return;
    setPasado((p) => [...p, actual.current as Sitio]); setFuturo((f) => f.slice(0, -1));
    actual.current = sig; setSitio(sig); setHex(sig.tema.color); ultimo.current = { clave: "", t: 0 };
    setAnuncio("Cambio rehecho.");
  }

  // ---------- Guardar ----------
  const guardar = useCallback(async () => {
    const s = actual.current;
    if (!s) return;
    if (!s.nombre.trim()) { setError("El nombre del sitio no puede estar vacío."); return; }
    setGuardando(true); setError(""); setAviso("");
    const { error } = await supabase.from("sitios_web").update({
      nombre: s.nombre.trim(), plantilla: s.plantilla, contenido: { tema: s.tema, ajustes: s.ajustes, bloques: s.bloques },
    }).eq("id", s.id);
    setGuardando(false);
    if (error) { setError(`No se pudo guardar. ${error.message}`); return; }
    guardadoJson.current = firma(s);
    setSitio({ ...s }); // fuerza el recálculo de "sin guardar"
    const hora = new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
    setAviso(`Cambios guardados a las ${hora}.`);
  }, []);

  // Ctrl/Cmd + S guarda; al cerrar la pestaña con cambios sin guardar el navegador avisa
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); guardar(); } };
    const salir = (e: BeforeUnloadEvent) => { if (actual.current && firma(actual.current) !== guardadoJson.current) e.preventDefault(); };
    window.addEventListener("keydown", tecla); window.addEventListener("beforeunload", salir);
    return () => { window.removeEventListener("keydown", tecla); window.removeEventListener("beforeunload", salir); };
  }, [guardar]);

  // ---------- Imágenes ----------
  async function subir(f: File) {
    if (!["image/png", "image/jpeg", "image/webp"].includes(f.type)) throw new Error("Solo se admiten imágenes PNG, JPG o WebP.");
    if (f.size > 2 * 1024 * 1024) throw new Error("La imagen pesa más de 2 MB.");
    const ruta = rutaArchivo(id, f.name);
    const { error } = await supabase.storage.from("sitios").upload(ruta, f, { contentType: f.type });
    if (error) throw new Error(error.message);
    return supabase.storage.from("sitios").getPublicUrl(ruta).data.publicUrl;
  }

  if (sitio === undefined) return <p className="vacio" role="status">Cargando el editor…</p>;
  if (sitio === null) {
    return (
      <>
        <Migas ruta={[{ texto: "Sitio web", href: "/crm/sitio" }, { texto: "No encontrado" }]} />
        <div className="cab"><h1>Sitio no encontrado</h1></div>
        <p className="vacio" role="alert">{error || "Este sitio no existe o no tienes permiso para verlo."} <Link href="/crm/sitio">Volver a Sitio web</Link></p>
      </>
    );
  }

  // ---------- Operaciones sobre las secciones ----------
  const bloqueSel = sitio.bloques.find((b) => b.id === sel) ?? null;
  const setBloques = (fn: (b: Bloque[]) => Bloque[], clave = "") => cambiar((s) => ({ ...s, bloques: fn(s.bloques) }), clave);
  const setDatos = (bid: string, cambio: Datos, clave: string) =>
    setBloques((bs) => bs.map((b) => (b.id === bid ? { ...b, datos: { ...b.datos, ...cambio } } : b)), clave);
  const setBloque = (bid: string, cambio: Partial<Bloque>, clave = "") =>
    setBloques((bs) => bs.map((b) => (b.id === bid ? { ...b, ...cambio } : b)), clave);

  function mover(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= sitio!.bloques.length) return;
    const nombre = nombreBloque(sitio!.bloques[i]);
    setBloques((bs) => { const n = [...bs]; [n[i], n[j]] = [n[j], n[i]]; return n; });
    setAnuncio(`${nombre} movida a la posición ${j + 1} de ${sitio!.bloques.length}.`);
  }
  function alternarVisible(b: Bloque) {
    setBloque(b.id, { visible: !b.visible });
    setAnuncio(`${nombreBloque(b)} ${b.visible ? "oculta" : "visible"}.`);
  }
  function quitar(b: Bloque) {
    if (!window.confirm(`¿Eliminar la sección «${nombreBloque(b)}»? Puedes recuperarla con «Deshacer».`)) return;
    setBloques((bs) => bs.filter((x) => x.id !== b.id));
    if (sel === b.id) setSel(null);
    setAnuncio(`Sección ${nombreBloque(b)} eliminada.`);
  }
  function anadir() {
    const nb = crearBloque(tipoNuevo, BLOQUES[tipoNuevo].nombre);
    setBloques((bs) => [...bs, nb]);
    setSel(nb.id);
    setAnuncio(`Sección ${BLOQUES[tipoNuevo].nombre} añadida al final de la página. Ya puedes editarla.`);
  }
  function seleccionar(bid: string) {
    setSel(bid); setPestana("secciones");
    const b = sitio!.bloques.find((x) => x.id === bid);
    if (b) setAnuncio(`Editando la sección ${nombreBloque(b)}.`);
  }

  const avisarSubida = (m: string) => { const mal = m.startsWith("No se pudo"); setError(mal ? m : ""); setAviso(mal ? "" : m); };

  // ---------- Diseño ----------
  const setTema = (cambio: Partial<Sitio["tema"]>, clave = "") => cambiar((s) => ({ ...s, tema: { ...s.tema, ...cambio } }), clave);
  const setAjuste = (k: keyof Ajustes, v: string) => cambiar((s) => ({ ...s, ajustes: { ...s.ajustes, [k]: v } }), `ajuste.${k}`);
  const ponerColor = (c: string) => { setHex(c); if (esHex(c)) setTema({ color: c.toLowerCase() }, "color"); };
  const colorTexto = textoSobre(sitio.tema.color);
  const ratio = contraste(sitio.tema.color, colorTexto);
  const fondoPagina = FONDOS[sitio.tema.modo].base;
  const ratioFondo = contraste(sitio.tema.color, fondoPagina);

  return (
    <>
      <Migas ruta={[{ texto: "Sitio web", href: "/crm/sitio" }, { texto: sitio.nombre || "Sin nombre" }]} />
      <div className="cab"><h1>Editar sitio web</h1></div>

      <div className="sitio-barra">
        <label className="sitio-nombre">Nombre del sitio
          <input type="text" value={sitio.nombre} maxLength={80} onChange={(e) => cambiar((s) => ({ ...s, nombre: e.target.value }), "nombre")} />
        </label>
        <div className="sitio-barra-grupo">
          <button type="button" className="btn sec peq" onClick={deshacer} disabled={pasado.length === 0}><Icono nombre="undo" />Deshacer</button>
          <button type="button" className="btn sec peq" onClick={rehacer} disabled={futuro.length === 0}><Icono nombre="redo" />Rehacer</button>
        </div>
        <Dispositivos valor={dispositivo} onCambio={setDispositivo} />
        <div className="sitio-barra-grupo">
          <Link className="btn sec peq" href={`/crm/sitio/${sitio.id}/vista`}><Icono nombre="eye" />Vista previa</Link>
          <button type="button" className="btn peq" onClick={guardar} disabled={guardando || !sucio}><Icono nombre="save" />{guardando ? "Guardando…" : "Guardar"}</button>
        </div>
        <p className="sitio-estado" data-sucio={sucio} role="status">{sucio ? "Hay cambios sin guardar" : "Todo guardado"}</p>
      </div>

      <p className="aviso" role="status" data-tipo={error ? "error" : "ok"}>{error || aviso}</p>
      <p className="sitio-solo-lectores" role="status" aria-live="polite">{anuncio}</p>

      <div className="sitio-editor">
        <div className="sitio-panel" ref={panelRef}>
          <div className="sitio-tabs" role="tablist" aria-label="Panel del editor">
            <button type="button" role="tab" id="tab-secciones" aria-selected={pestana === "secciones"} aria-controls="panel-secciones" tabIndex={pestana === "secciones" ? 0 : -1}
              onClick={() => setPestana("secciones")} onKeyDown={(e) => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { setPestana("diseno"); document.getElementById("tab-diseno")?.focus(); } }}>Secciones</button>
            <button type="button" role="tab" id="tab-diseno" aria-selected={pestana === "diseno"} aria-controls="panel-diseno" tabIndex={pestana === "diseno" ? 0 : -1}
              onClick={() => setPestana("diseno")} onKeyDown={(e) => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { setPestana("secciones"); document.getElementById("tab-secciones")?.focus(); } }}>Diseño y datos</button>
          </div>

          {pestana === "secciones" && (
            <div className="sitio-cuerpo" role="tabpanel" id="panel-secciones" aria-labelledby="tab-secciones">
              {!bloqueSel ? (
                <>
                  <h2 tabIndex={-1}>Secciones de la página</h2>
                  <p className="sitio-ayuda">Elige una sección para editarla o haz clic sobre ella en la vista previa. Usa las flechas para cambiar el orden.</p>
                  <ul className="sitio-lista">
                    {sitio.bloques.map((b, i) => (
                      <li key={b.id} data-oculta={!b.visible}>
                        <button type="button" className="sitio-lista-nombre" onClick={() => seleccionar(b.id)} aria-label={`Editar ${nombreBloque(b)}${b.visible ? "" : " (oculta)"}`}>
                          <span>{nombreBloque(b)}{!b.visible && " · oculta"}</span>
                          <small>{b.menu ? `Menú: ${b.menu}` : "No aparece en el menú"}</small>
                        </button>
                        <div className="sitio-lista-acc">
                          <button type="button" className="sitio-icono-btn" onClick={() => mover(i, -1)} disabled={i === 0} aria-label={`Subir ${nombreBloque(b)}`}><Icono nombre="arrow-up" /></button>
                          <button type="button" className="sitio-icono-btn" onClick={() => mover(i, 1)} disabled={i === sitio.bloques.length - 1} aria-label={`Bajar ${nombreBloque(b)}`}><Icono nombre="arrow-down" /></button>
                          <button type="button" className="sitio-icono-btn" onClick={() => alternarVisible(b)} aria-label={`${b.visible ? "Ocultar" : "Mostrar"} ${nombreBloque(b)}`}><Icono nombre={b.visible ? "eye" : "eye-off"} /></button>
                          <button type="button" className="sitio-icono-btn peligro" onClick={() => quitar(b)} aria-label={`Eliminar ${nombreBloque(b)}`}><Icono nombre="trash" /></button>
                        </div>
                      </li>
                    ))}
                  </ul>
                  {sitio.bloques.length === 0 && <p className="vacio">La página está vacía. Añade una sección.</p>}
                  <div className="sitio-anadir">
                    <label>Añadir sección
                      <select value={tipoNuevo} onChange={(e) => setTipoNuevo(e.target.value as TipoBloque)} aria-describedby="anadir-ayuda">
                        {TIPOS_BLOQUE.map((t) => <option key={t} value={t}>{BLOQUES[t].nombre}</option>)}
                      </select>
                    </label>
                    <button type="button" className="btn" onClick={anadir}><Icono nombre="plus" />Añadir</button>
                    <p id="anadir-ayuda" className="sitio-ayuda" style={{ flexBasis: "100%" }}>{BLOQUES[tipoNuevo].descripcion}</p>
                  </div>
                </>
              ) : (
                <>
                  <button type="button" className="sitio-volver" onClick={() => { setSel(null); setAnuncio("Lista de secciones."); }}><Icono nombre="arrow-left" />Volver a las secciones</button>
                  <h2 tabIndex={-1}>{nombreBloque(bloqueSel)}</h2>
                  <p className="sitio-ayuda">{BLOQUES[bloqueSel.tipo].descripcion}</p>
                  <div className="sitio-campos">
                    <label>Nombre en el menú de la web
                      <input type="text" value={bloqueSel.menu} maxLength={24} aria-describedby="menu-ayuda"
                        onChange={(e) => setBloque(bloqueSel.id, { menu: e.target.value }, `${bloqueSel.id}.menu`)} />
                    </label>
                    <p id="menu-ayuda" className="sitio-ayuda">Si lo dejas vacío, la sección no aparece en el menú.</p>
                  </div>
                  <Campos bloque={bloqueSel} bloques={sitio.bloques} subir={subir} avisar={avisarSubida} anunciar={setAnuncio}
                    onDatos={(cambio, clave) => setDatos(bloqueSel.id, cambio, clave)} />
                  <div className="sitio-fila" style={{ paddingTop: 16, borderTop: "1px solid var(--line)" }}>
                    <button type="button" className="btn sec peq" onClick={() => alternarVisible(bloqueSel)}><Icono nombre={bloqueSel.visible ? "eye-off" : "eye"} />{bloqueSel.visible ? "Ocultar sección" : "Mostrar sección"}</button>
                    <button type="button" className="btn sec peligro peq" onClick={() => quitar(bloqueSel)}><Icono nombre="trash" />Eliminar sección</button>
                  </div>
                </>
              )}
            </div>
          )}

          {pestana === "diseno" && (
            <div className="sitio-cuerpo" role="tabpanel" id="panel-diseno" aria-labelledby="tab-diseno">
              <h2 tabIndex={-1}>Diseño y datos de la empresa</h2>

              <fieldset className="sitio-campos" style={{ border: 0, padding: 0, margin: 0 }}>
                <legend style={{ fontWeight: 600, marginBottom: 8 }}>Plantilla</legend>
                <p className="sitio-ayuda" style={{ marginBottom: 8 }}>Cambiar de plantilla modifica el aspecto, no tu contenido.</p>
                <div className="sitio-opciones">
                  {PLANTILLAS.map((p) => (
                    <label key={p.id} className="sitio-opcion">
                      <input type="radio" name="plantilla" value={p.id} checked={sitio.plantilla === p.id}
                        onChange={() => { cambiar((s) => ({ ...s, plantilla: p.id as PlantillaId })); setAnuncio(`Plantilla ${p.nombre} aplicada.`); }} />
                      <span>{p.nombre}<small>{p.ideal.join(" · ")}</small></span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset className="sitio-campos" style={{ border: 0, padding: 0, margin: 0 }}>
                <legend style={{ fontWeight: 600, marginBottom: 8 }}>Color principal</legend>
                <div className="sitio-muestras" role="group" aria-label="Colores sugeridos">
                  {MUESTRAS.map((m) => (
                    <button key={m.c} type="button" className="sitio-muestra" style={{ background: m.c, color: textoSobre(m.c) }} aria-label={m.n} aria-pressed={sitio.tema.color === m.c} onClick={() => ponerColor(m.c)} />
                  ))}
                </div>
                <div className="sitio-color">
                  <label className="sitio-en-linea">Elegir<input type="color" value={sitio.tema.color} onChange={(e) => ponerColor(e.target.value)} /></label>
                  <label className="sitio-en-linea">Código
                    <input type="text" value={hex} onChange={(e) => ponerColor(e.target.value)} maxLength={7} spellCheck={false} aria-invalid={!esHex(hex)} aria-describedby="hex-ayuda" />
                  </label>
                </div>
                <p id="hex-ayuda" className="sitio-ayuda">{esHex(hex) ? "Formato #RRGGBB." : "Escribe un código válido, por ejemplo #1c5cab."}</p>
                <p className="sitio-contraste" role="status">
                  <Icono nombre="check" />
                  <span>Los botones usan texto {colorTexto === "#ffffff" ? "blanco" : "negro"} con un contraste de {ratio.toFixed(1)} : 1 (WCAG exige 4,5 : 1). Los enlaces y etiquetas en este color se ajustan solos para que se lean bien{ratioFondo < 3 ? "; este tono se ve muy apagado sobre el fondo, prueba con otro más intenso" : ""}.</span>
                </p>
              </fieldset>

              <div className="sitio-campos">
                <label>Tipo de letra
                  <select value={sitio.tema.fuente} onChange={(e) => setTema({ fuente: e.target.value as FuenteId })}>
                    {(Object.keys(FUENTES) as FuenteId[]).map((f) => <option key={f} value={f}>{FUENTES[f].nombre}</option>)}
                  </select>
                </label>
                <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                  <legend style={{ fontWeight: 600, marginBottom: 8 }}>Modo</legend>
                  <div className="sitio-opciones">
                    {(["claro", "oscuro"] as ModoId[]).map((m) => (
                      <label key={m} className="sitio-opcion"><input type="radio" name="modo" value={m} checked={sitio.tema.modo === m} onChange={() => setTema({ modo: m })} /><span>{m === "claro" ? "Fondo claro" : "Fondo oscuro"}</span></label>
                    ))}
                  </div>
                </fieldset>
              </div>

              <h2>Datos de la empresa</h2>
              <p className="sitio-ayuda">Se usan en la cabecera, en la sección de contacto y en el pie.</p>
              <div className="sitio-campos">
                <label>Nombre de la empresa<input type="text" maxLength={60} value={sitio.ajustes.nombre} onChange={(e) => setAjuste("nombre", e.target.value)} /></label>
                <label>Eslogan<input type="text" maxLength={80} value={sitio.ajustes.eslogan} onChange={(e) => setAjuste("eslogan", e.target.value)} /></label>
                <CampoImagen etiqueta="Logotipo" ayuda="Opcional. Si no subes ninguno se muestra la inicial de la empresa."
                  valor={sitio.ajustes.logoUrl} alt={sitio.ajustes.logoAlt} subir={subir}
                  avisar={avisarSubida}
                  onValor={(v) => setAjuste("logoUrl", v)} onAlt={(v) => setAjuste("logoAlt", v)} />
                <label>Teléfono<input type="tel" maxLength={30} value={sitio.ajustes.telefono} onChange={(e) => setAjuste("telefono", e.target.value)} autoComplete="off" /></label>
                <label>Correo electrónico<input type="email" maxLength={120} value={sitio.ajustes.email} onChange={(e) => setAjuste("email", e.target.value)} autoComplete="off" /></label>
                <label>Dirección<input type="text" maxLength={160} value={sitio.ajustes.direccion} onChange={(e) => setAjuste("direccion", e.target.value)} /></label>
                <label>Horario<input type="text" maxLength={100} value={sitio.ajustes.horario} onChange={(e) => setAjuste("horario", e.target.value)} /></label>
                <label>Texto del pie de página<input type="text" maxLength={160} value={sitio.ajustes.pie} onChange={(e) => setAjuste("pie", e.target.value)} /></label>
              </div>
            </div>
          )}
        </div>

        <div className="sitio-lienzo" data-scroll tabIndex={0} role="region" aria-label="Vista previa de la web (desplázate para ver toda la página)">
          <div className="sitio-marco" data-dispositivo={dispositivo}>
            <SitioRender sitio={sitio} editable seleccionado={sel} onSeleccionar={seleccionar} />
          </div>
        </div>
      </div>
    </>
  );
}

// Huella del contenido guardable, para saber si hay cambios sin guardar
function firma(s: Sitio) {
  return JSON.stringify([s.nombre.trim(), s.plantilla, s.tema, s.ajustes, s.bloques]);
}
