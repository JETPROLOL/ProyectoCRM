"use client";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { PLANTILLAS, InfoPlantilla, plantillaPorId } from "@/lib/sitio/plantillas";
import type { PlantillaId } from "@/lib/sitio/tipos";
import Modal from "../Modal";
import Icono from "../Icono";
import SitioRender from "./SitioRender";
import "../ventas/ventas.css";

type Fila = { id: string; nombre: string; plantilla: PlantillaId; updated_at: string };

// Miniatura real de la plantilla: se dibuja la web a 1200 px y se reduce. Es decorativa (el texto de la tarjeta ya la describe).
function Miniatura({ info }: { info: InfoPlantilla }) {
  const contenido = useMemo(() => ({ ...info.crear(), plantilla: info.id }), [info]);
  const caja = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(0.3);
  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const medir = () => setEscala(el.clientWidth / 1200);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={caja} className="sitio-mini" aria-hidden="true" inert>
      <div className="sitio-mini-in" style={{ width: 1200, transform: `scale(${escala})` }}><SitioRender sitio={contenido} /></div>
    </div>
  );
}

const fecha = (iso: string) => new Date(iso).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Madrid" });

export default function SitioWeb() {
  const router = useRouter();
  const [sitios, setSitios] = useState<Fila[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [nueva, setNueva] = useState<InfoPlantilla | null>(null);
  const [borrar, setBorrar] = useState<Fila | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from("sitios_web").select("id,nombre,plantilla,updated_at").order("updated_at", { ascending: false });
    if (error) {
      setError(error.code === "PGRST205" || error.code === "42P01"
        ? "Falta crear la tabla de sitios. Ejecuta la migración 20261123_A_sitio_web.sql en Supabase > SQL Editor."
        : `No se pudieron cargar tus sitios. ${error.message}`);
    }
    setSitios((data as Fila[]) ?? []);
    setCargando(false);
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  async function crear(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!nueva) return;
    const nombre = String(new FormData(e.currentTarget).get("nombre")).trim();
    setTrabajando(true); setError("");
    const { data, error } = await supabase.from("sitios_web").insert({ nombre, plantilla: nueva.id, contenido: nueva.crear() }).select("id").single();
    setTrabajando(false);
    if (error || !data) return setError(`No se pudo crear el sitio. ${error?.message ?? ""}`);
    router.push(`/crm/sitio/${data.id}`);
  }

  async function eliminar() {
    if (!borrar) return;
    setTrabajando(true); setError("");
    const { error } = await supabase.from("sitios_web").delete().eq("id", borrar.id);
    if (error) { setTrabajando(false); return setError(`No se pudo eliminar el sitio. ${error.message}`); }
    // Limpieza de las imágenes subidas (si falla no importa: solo ocupan espacio)
    const { data: archivos } = await supabase.storage.from("sitios").list(borrar.id);
    if (archivos?.length) await supabase.storage.from("sitios").remove(archivos.map((f) => `${borrar.id}/${f.name}`));
    setTrabajando(false);
    setAviso(`Sitio «${borrar.nombre}» eliminado.`);
    setBorrar(null);
    cargar();
  }

  return (
    <>
      <div className="cab"><h1>Sitio web</h1></div>
      <p className="sitio-intro">Crea la web de la empresa sin escribir código: elige una plantilla, personaliza textos, imágenes, colores y secciones, y comprueba cómo se ve en ordenador, tableta y móvil.</p>

      <p className="aviso" role="status" data-tipo={error ? "error" : "ok"}>{nueva === null && borrar === null ? error || aviso : ""}</p>

      {sitios.length > 0 && (
        <section aria-labelledby="mis-sitios">
          <h2 id="mis-sitios" className="sitio-subtitulo">Mis sitios</h2>
          <div className="tabla ventas-tabla" tabIndex={0} role="region" aria-label="Mis sitios" style={{ marginBottom: 40 }}>
            <table>
              <caption className="sitio-solo-lectores">Sitios web creados</caption>
              <thead><tr><th scope="col">Nombre</th><th scope="col">Plantilla</th><th scope="col">Última modificación</th><th scope="col"><span className="sitio-solo-lectores">Acciones</span></th></tr></thead>
              <tbody>
                {sitios.map((s) => (
                  <tr key={s.id}>
                    <th scope="row" style={{ textTransform: "none", letterSpacing: 0, fontSize: ".9375rem", color: "var(--ink)", background: "transparent" }}>{s.nombre}</th>
                    <td>{plantillaPorId(s.plantilla).nombre}</td>
                    <td>{fecha(s.updated_at)}</td>
                    <td>
                      <div className="sitio-acciones">
                        <Link className="btn" href={`/crm/sitio/${s.id}`} aria-label={`Editar ${s.nombre}`}><Icono nombre="pencil" />Editar</Link>
                        <Link className="btn sec" href={`/crm/sitio/${s.id}/vista`} aria-label={`Vista previa de ${s.nombre}`}><Icono nombre="eye" />Vista previa</Link>
                        <button type="button" className="btn sec peligro" onClick={() => { setError(""); setAviso(""); setBorrar(s); }} aria-label={`Eliminar ${s.nombre}`}><Icono nombre="trash" />Eliminar</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section aria-labelledby="elige-plantilla">
        <h2 id="elige-plantilla" className="sitio-subtitulo">{sitios.length ? "Crear un sitio nuevo" : "Elige una plantilla"}</h2>
        {!cargando && sitios.length === 0 && !error && <p className="sitio-intro">Aún no tienes ningún sitio. Elige la plantilla que más te guste; podrás cambiarla más adelante sin perder lo que escribas.</p>}
        <ul className="sitio-galeria">
          {PLANTILLAS.map((p) => (
            <li key={p.id} className="sitio-plantilla">
              <Miniatura info={p} />
              <h3 style={{ fontSize: "1.25rem", margin: 0 }}>{p.nombre}</h3>
              <p>{p.descripcion}</p>
              <ul className="sitio-etiquetas" aria-label={`Ideal para ${p.nombre}`}>{p.ideal.map((t) => <li key={t}>{t}</li>)}</ul>
              <button type="button" className="btn" onClick={() => { setError(""); setAviso(""); setNueva(p); }} aria-label={`Usar la plantilla ${p.nombre}`}><Icono nombre="plus" />Usar esta plantilla</button>
            </li>
          ))}
        </ul>
      </section>

      <Modal abierto={nueva !== null} titulo={nueva ? `Nuevo sitio con la plantilla ${nueva.nombre}` : "Nuevo sitio"} onCerrar={() => setNueva(null)}>
        {nueva && (
          <form className="form plano" onSubmit={crear} key={nueva.id}>
            <label>Nombre del sitio
              <input name="nombre" required maxLength={80} defaultValue="Web de Meridiano Logística" aria-describedby="nuevo-ayuda" autoFocus />
            </label>
            <p id="nuevo-ayuda" className="sitio-ayuda">Es solo para reconocerlo en tu lista; no aparece en la web.</p>
            <p className="aviso" role="alert" data-tipo="error">{error}</p>
            <div className="sitio-fila">
              <button className="btn" disabled={trabajando}><Icono nombre="check" />{trabajando ? "Creando…" : "Crear y empezar a editar"}</button>
              <button type="button" className="btn sec" onClick={() => setNueva(null)}>Cancelar</button>
            </div>
          </form>
        )}
      </Modal>

      <Modal abierto={borrar !== null} titulo="Eliminar sitio" onCerrar={() => setBorrar(null)}>
        {borrar && (
          <div className="form plano">
            <p>¿Seguro que quieres eliminar <strong>{borrar.nombre}</strong>? Se borrarán sus secciones e imágenes y no se puede deshacer.</p>
            <p className="aviso" role="alert" data-tipo="error">{error}</p>
            <div className="sitio-fila">
              <button type="button" className="btn peligro" onClick={eliminar} disabled={trabajando}><Icono nombre="trash" />{trabajando ? "Eliminando…" : "Sí, eliminar"}</button>
              <button type="button" className="btn sec" onClick={() => setBorrar(null)}>Cancelar</button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
