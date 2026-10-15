"use client";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import Modal from "../../Modal";
import {
  Fichaje, aInputLocal, deInputLocal, dia, duracionMs, fechaLarga, hora, horasMin,
} from "@/lib/rrhh/horarios";

type Persona = { id: string; nombre: string; puesto: string | null; estado: "activo" | "baja" };
type Edicion = { fichaje: Fichaje | null; empleadoId: string };

const mesActual = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };

// Vista de RRHH: quién está fichado ahora, horas del mes de cada trabajador y corrección de fichajes
export default function EquipoFichajes() {
  const [mes, setMes] = useState(mesActual());
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [fichajes, setFichajes] = useState<Fichaje[]>([]);
  const [abiertos, setAbiertos] = useState<Fichaje[]>([]);
  const [cargado, setCargado] = useState(false);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [expandido, setExpandido] = useState<string | null>(null);
  const [edicion, setEdicion] = useState<Edicion | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());

  const cargar = useCallback(async () => {
    const [a, m] = mes.split("-").map(Number);
    const ini = new Date(a, m - 1, 1).toISOString();
    const fin = new Date(a, m, 1).toISOString();
    const [p, f, o] = await Promise.all([
      supabase.from("empleados").select("id,nombre,puesto,estado").order("nombre"),
      supabase.from("fichajes").select("*").gte("entrada", ini).lt("entrada", fin).order("entrada", { ascending: false }).limit(5000),
      supabase.from("fichajes").select("*").is("salida", null),
    ]);
    if (f.error) setError(`No se pudieron cargar los fichajes. ${f.error.message}`); else setError("");
    setPersonas((p.data as Persona[]) ?? []);
    setFichajes((f.data as Fichaje[]) ?? []);
    setAbiertos((o.data as Fichaje[]) ?? []);
    setAhora(Date.now());
    setCargado(true);
  }, [mes]);
  useEffect(() => { cargar(); }, [cargar]);

  const filas = useMemo(() => {
    const abiertoDe = new Map(abiertos.map((f) => [f.empleado_id, f]));
    return personas
      .map((p) => {
        const fs = fichajes.filter((f) => f.empleado_id === p.id);
        return {
          p, fs, abierto: abiertoDe.get(p.id) ?? null,
          ms: fs.reduce((s, f) => s + duracionMs(f, ahora), 0),
          dias: new Set(fs.map((f) => dia(f.entrada))).size,
        };
      })
      .filter(({ p, fs, abierto }) => (p.estado === "activo" || fs.length > 0 || abierto) && p.nombre.toLowerCase().includes(q.toLowerCase()));
  }, [personas, fichajes, abiertos, q, ahora]);

  const totalMs = filas.reduce((s, f) => s + f.ms, 0);

  async function eliminar(f: Fichaje) {
    if (!window.confirm("¿Eliminar este fichaje? No se puede deshacer.")) return;
    const { data, error: fallo } = await supabase.from("fichajes").delete().eq("id", f.id).select("id");
    if (fallo || !data?.length) return setError(`No se pudo eliminar. ${fallo?.message ?? "No tienes permiso o ya no existe."}`);
    cargar();
  }

  return (
    <>
      <div className="horarios-kpis">
        <div><span>Fichados ahora</span><b>{abiertos.length}</b></div>
        <div><span>Horas del mes</span><b>{horasMin(totalMs)}</b></div>
        <div><span>Trabajadores con fichajes</span><b>{filas.filter((f) => f.fs.length > 0).length}</b></div>
      </div>

      <div className="horarios-barra">
        <input type="search" className="buscar" placeholder="Buscar trabajador" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar trabajador" />
        <input type="month" value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} aria-label="Mes" style={{ width: "auto" }} />
      </div>
      {error && <p className="aviso" data-tipo="error" role="alert">{error}</p>}

      {cargado && filas.length === 0 && <p className="vacio">No hay trabajadores que coincidan.</p>}
      <div className="horarios-equipo">
        {filas.map(({ p, fs, abierto, ms, dias }) => (
          <section key={p.id} className="tarjeta horarios-trabajador" data-abierto={expandido === p.id}>
            <button type="button" className="horarios-trabajador-cab" aria-expanded={expandido === p.id}
              onClick={() => setExpandido(expandido === p.id ? null : p.id)}>
              <span className="ficha-datos">
                <b>{p.nombre}{p.estado === "baja" && " (baja)"}</b>
                <span>{p.puesto ?? "Sin puesto"}</span>
              </span>
              <span className="chip" data-vacio={!abierto}>{abierto ? `Dentro desde ${hora(abierto.entrada)}` : "Fuera"}</span>
              <span className="horarios-cifras"><b>{horasMin(ms)}</b><span>{dias} {dias === 1 ? "día" : "días"}</span></span>
            </button>

            {expandido === p.id && (
              <div className="horarios-detalle">
                <div className="tabla">
                  <table>
                    <thead><tr><th>Día</th><th>Entrada</th><th>Salida</th><th>Duración</th><th><span className="sr-only">Acciones</span></th></tr></thead>
                    <tbody>
                      {fs.length === 0 && <tr><td colSpan={5} className="tenue">Sin fichajes este mes.</td></tr>}
                      {fs.map((f) => (
                        <tr key={f.id}>
                          <td style={{ textTransform: "capitalize", whiteSpace: "nowrap" }}>{fechaLarga(f.entrada)}</td>
                          <td>{hora(f.entrada)}</td>
                          <td>{f.salida ? hora(f.salida) : <span className="chip">En curso</span>}</td>
                          <td style={{ whiteSpace: "nowrap" }}>{horasMin(duracionMs(f, ahora))}</td>
                          <td className="horarios-acciones">
                            <button type="button" className="horarios-link" onClick={() => setEdicion({ fichaje: f, empleadoId: p.id })}>Corregir</button>
                            <button type="button" className="horarios-link" onClick={() => eliminar(f)}>Eliminar</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button type="button" className="btn peq" onClick={() => setEdicion({ fichaje: null, empleadoId: p.id })}>Añadir fichaje manual</button>
              </div>
            )}
          </section>
        ))}
      </div>

      <Modal abierto={edicion !== null} titulo={edicion?.fichaje ? "Corregir fichaje" : "Añadir fichaje"} onCerrar={() => setEdicion(null)}>
        {edicion && (
          <FormFichaje key={edicion.fichaje?.id ?? "nuevo"} edicion={edicion}
            onGuardado={() => { setEdicion(null); cargar(); }} />
        )}
      </Modal>
    </>
  );
}

function FormFichaje({ edicion, onGuardado }: { edicion: Edicion; onGuardado: () => void }) {
  const { fichaje, empleadoId } = edicion;
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function guardar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const entrada = deInputLocal(String(d.get("entrada")));
    const salida = deInputLocal(String(d.get("salida")));
    const nota = String(d.get("nota")).trim() || null;
    if (!entrada) return setError("Indica la hora de entrada.");
    if (salida && new Date(salida) <= new Date(entrada)) return setError("La salida debe ser posterior a la entrada.");

    setEnviando(true);
    setError("");
    const q = fichaje
      ? await supabase.from("fichajes").update({ entrada, salida, nota }).eq("id", fichaje.id).select("id")
      : await supabase.from("fichajes").insert({ empleado_id: empleadoId, entrada, salida, nota }).select("id");
    setEnviando(false);
    if (q.error || !q.data?.length) {
      return setError(q.error?.code === "23505"
        ? "Este trabajador ya tiene otro fichaje abierto. Cierra primero ese."
        : `No se pudo guardar. ${q.error?.message ?? "No tienes permiso."}`);
    }
    onGuardado();
  }

  return (
    <form className="form plano" onSubmit={guardar}>
      <label>Entrada<input type="datetime-local" name="entrada" required defaultValue={aInputLocal(fichaje?.entrada ?? null)} /></label>
      <label>Salida (déjala vacía si sigue en turno)<input type="datetime-local" name="salida" defaultValue={aInputLocal(fichaje?.salida ?? null)} /></label>
      <label>Nota (opcional)<input name="nota" maxLength={300} defaultValue={fichaje?.nota ?? ""} placeholder="Motivo de la corrección" /></label>
      <button className="btn" disabled={enviando}>{enviando ? "Guardando…" : "Guardar"}</button>
      <p className="aviso" role="alert" data-tipo="error">{error}</p>
    </form>
  );
}
