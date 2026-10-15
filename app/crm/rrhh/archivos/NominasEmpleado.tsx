"use client";
import { FormEvent, useState } from "react";
import { supabase } from "@/lib/supabase";
import { rutaArchivo, urlFirmada } from "@/lib/rrhh/archivos";
import type { Empleado } from "@/lib/tipos";
import { Nomina, etiquetaPeriodo, normalizar, validarNomina } from "@/lib/rrhh/nominas";

// Mes anterior en formato AAAA-MM (las nóminas suelen ser del mes que acaba de cerrarse)
function mesAnterior() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
const fechaHora = (iso: string) => new Date(iso).toLocaleString("es-ES", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default function NominasEmpleado({ trabajador, nominas, esMia, esRrhh, onCambio }: {
  trabajador: Pick<Empleado, "id" | "nombre">;
  nominas: Nomina[];
  esMia: boolean;
  esRrhh: boolean;
  onCambio: () => void;
}) {
  const [subiendo, setSubiendo] = useState(false);
  const [firmando, setFirmando] = useState<string | null>(null); // id de la nómina que se está firmando
  const [nombreFirma, setNombreFirma] = useState("");
  const [acepto, setAcepto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const puedeSubir = esMia || esRrhh;

  async function subir(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const d = new FormData(form);
    const mes = String(d.get("periodo"));
    const archivo = d.get("archivo");
    if (!(archivo instanceof File) || !mes) return setAviso({ tipo: "error", texto: "Elige el mes y el archivo PDF." });
    const problema = validarNomina(archivo);
    if (problema) return setAviso({ tipo: "error", texto: problema });

    setSubiendo(true);
    setAviso(null);
    const ruta = rutaArchivo(trabajador.id, archivo.name);
    const { error: e1 } = await supabase.storage.from("nominas").upload(ruta, archivo, { contentType: "application/pdf" });
    if (e1) { setSubiendo(false); return setAviso({ tipo: "error", texto: `No se pudo subir el archivo. ${e1.message}` }); }

    const { error: e2 } = await supabase.from("nominas").insert({
      empleado_id: trabajador.id, periodo: `${mes}-01`, archivo_path: ruta, nombre_archivo: archivo.name.slice(0, 200),
    });
    setSubiendo(false);
    if (e2) {
      await supabase.storage.from("nominas").remove([ruta]); // no dejar archivos huérfanos
      return setAviso({ tipo: "error", texto: `No se pudo registrar la nómina. ${e2.message}` });
    }
    form.reset();
    setAviso({ tipo: "ok", texto: "Nómina subida. Ahora puedes revisarla y firmarla." });
    onCambio();
  }

  async function ver(n: Nomina) {
    const w = window.open("", "_blank"); // se abre antes de esperar para que el navegador no bloquee la ventana
    const url = await urlFirmada("nominas", n.archivo_path);
    if (url && w) w.location.href = url;
    else { w?.close(); setAviso({ tipo: "error", texto: "No se pudo abrir el archivo." }); }
  }

  function empezarFirma(n: Nomina) { setFirmando(n.id); setNombreFirma(""); setAcepto(false); setAviso(null); }

  async function firmar(n: Nomina) {
    if (normalizar(nombreFirma) !== normalizar(trabajador.nombre)) {
      return setAviso({ tipo: "error", texto: `Escribe tu nombre completo tal como figura en tu ficha: ${trabajador.nombre}.` });
    }
    setOcupado(true);
    const { error } = await supabase.rpc("firmar_nomina", { p_id: n.id, p_nombre: nombreFirma.trim() });
    setOcupado(false);
    if (error) return setAviso({ tipo: "error", texto: error.message });
    setFirmando(null);
    setAviso({ tipo: "ok", texto: `Nómina de ${etiquetaPeriodo(n.periodo)} firmada.` });
    onCambio();
  }

  async function eliminar(n: Nomina) {
    if (!window.confirm(`¿Eliminar la nómina de ${etiquetaPeriodo(n.periodo)}?${n.firmada ? " Está firmada." : ""} No se puede deshacer.`)) return;
    // Primero la fila (la política de Storage solo deja borrar el archivo si ya no hay una nómina firmada que lo use)
    const { data, error } = await supabase.from("nominas").delete().eq("id", n.id).select("id");
    if (error || !data?.length) return setAviso({ tipo: "error", texto: `No se pudo eliminar. ${error?.message ?? "No tienes permiso."}` });
    await supabase.storage.from("nominas").remove([n.archivo_path]);
    setAviso(null);
    onCambio();
  }

  return (
    <div className="arch-modal">
      {puedeSubir && (
        <form className="form plano arch-subida" onSubmit={subir}>
          <div className="fila">
            <label>Mes de la nómina<input type="month" name="periodo" required defaultValue={mesAnterior()} /></label>
            <label>Archivo PDF (máx. 5 MB)<input type="file" name="archivo" accept="application/pdf,.pdf" required /></label>
          </div>
          <button className="btn" disabled={subiendo}>{subiendo ? "Subiendo…" : "Subir nómina"}</button>
        </form>
      )}

      {aviso && <p className="aviso" data-tipo={aviso.tipo} role="status">{aviso.texto}</p>}

      {nominas.length === 0 ? (
        <p className="vacio">{esMia ? "Aún no has subido ninguna nómina." : "Este empleado no tiene nóminas."}</p>
      ) : (
        <ul className="arch-lista">
          {nominas.map((n) => (
            <li key={n.id} data-firmada={n.firmada}>
              <div className="arch-fila">
                <div className="arch-dato">
                  <b style={{ textTransform: "capitalize" }}>{etiquetaPeriodo(n.periodo)}</b>
                  <span className="tenue">{n.nombre_archivo}</span>
                  {n.firmada && n.firmada_en && <span className="tenue">Firmada por {n.firma_nombre} · {fechaHora(n.firmada_en)}</span>}
                </div>
                <span className="arch-estado" data-firmada={n.firmada}>{n.firmada ? "Firmada" : "Sin firmar"}</span>
              </div>
              <div className="arch-acciones">
                <button type="button" className="btn peq arch-sec" onClick={() => ver(n)}>Ver PDF</button>
                {esMia && !n.firmada && firmando !== n.id && <button type="button" className="btn peq" onClick={() => empezarFirma(n)}>Firmar</button>}
                {(esRrhh || (esMia && !n.firmada)) && <button type="button" className="arch-link" onClick={() => eliminar(n)}>Eliminar</button>}
              </div>

              {firmando === n.id && (
                <div className="arch-firma">
                  <label className="arch-consent">
                    <input type="checkbox" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} />
                    <span>He recibido y revisado esta nómina y la firmo electrónicamente.</span>
                  </label>
                  <label>Escribe tu nombre completo para firmar
                    <input value={nombreFirma} onChange={(e) => setNombreFirma(e.target.value)} placeholder={trabajador.nombre} autoComplete="off" />
                  </label>
                  <div className="arch-acciones">
                    <button type="button" className="btn peq" disabled={!acepto || nombreFirma.trim().length < 3 || ocupado} onClick={() => firmar(n)}>
                      {ocupado ? "Firmando…" : "Confirmar firma"}
                    </button>
                    <button type="button" className="arch-link" onClick={() => setFirmando(null)}>Cancelar</button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
