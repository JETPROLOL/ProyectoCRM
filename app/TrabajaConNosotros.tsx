"use client";
import "./trabaja.css";
import { FormEvent, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { validarCv } from "@/lib/rrhh/admision";

// Botón de la barra superior + ventana con el formulario de solicitud de empleo.
// Cada envío sube el CV al bucket "cvs" y crea una fila en "solicitudes_admision" que RRHH ve en Admisión.
export default function TrabajaConNosotros() {
  const ref = useRef<HTMLDialogElement>(null);
  const [estado, setEstado] = useState<"idle" | "enviando" | "ok" | "error">("idle");
  const [error, setError] = useState("");

  function abrir() {
    setEstado("idle");
    setError("");
    ref.current?.showModal();
  }
  const cerrar = () => ref.current?.close();

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const d = new FormData(form);

    // Campo trampa para bots: una persona nunca lo rellena. Se simula el éxito sin guardar nada.
    if (String(d.get("web") ?? "") !== "") { setEstado("ok"); return; }

    const cv = d.get("cv");
    if (!(cv instanceof File) || cv.size === 0) { setError("Adjunta tu currículum en PDF."); setEstado("error"); return; }
    const problema = validarCv(cv);
    if (problema) { setError(problema); setEstado("error"); return; }

    setEstado("enviando");
    setError("");

    // El nombre del archivo lo genera el navegador (UUID): no se usa el del usuario
    const ruta = `solicitudes/${crypto.randomUUID()}.pdf`;
    const subida = await supabase.storage.from("cvs").upload(ruta, cv, { contentType: "application/pdf", upsert: false });
    if (subida.error) {
      console.error(subida.error);
      setError("No se pudo subir el currículum. Comprueba que es un PDF de menos de 5 MB e inténtalo de nuevo.");
      return setEstado("error");
    }

    const { error: fallo } = await supabase.from("solicitudes_admision").insert({
      nombre: String(d.get("nombre")).trim(),
      apellidos: String(d.get("apellidos")).trim(),
      telefono: String(d.get("telefono")).trim(),
      email: String(d.get("email")).trim(),
      cv_path: ruta,
    });
    if (fallo) {
      console.error(fallo);
      setError("No se pudo enviar la solicitud. Revisa los datos e inténtalo de nuevo.");
      return setEstado("error");
    }
    form.reset();
    setEstado("ok");
  }

  return (
    <>
      <button type="button" className="trabaja-boton" onClick={abrir}>
        <span className="trabaja-largo">Trabaja con nosotros</span>
        <span className="trabaja-corto">Empleo</span>
      </button>

      <dialog ref={ref} className="trabaja-dialog" aria-labelledby="trabaja-titulo"
        onClick={(e) => { if (e.target === ref.current) cerrar(); }}>
        <div className="trabaja-cab">
          <h2 id="trabaja-titulo">Trabaja con nosotros</h2>
          <button type="button" className="trabaja-cerrar" onClick={cerrar} aria-label="Cerrar ventana">×</button>
        </div>

        {estado === "ok" ? (
          <div className="trabaja-ok" role="status">
            <p><b>Solicitud enviada.</b></p>
            <p>Nuestro equipo de RRHH revisará tu currículum. Si tu perfil encaja, nos pondremos en contacto contigo.</p>
            <button type="button" className="btn" onClick={cerrar}>Cerrar</button>
          </div>
        ) : (
          <form className="form trabaja-form" onSubmit={enviar}>
            <p className="trabaja-intro">Cuéntanos quién eres y adjunta tu currículum. Lo recibirá directamente el equipo de RRHH.</p>
            <div className="fila">
              <label>Nombre<input name="nombre" required minLength={2} maxLength={50} autoComplete="given-name" /></label>
              <label>Apellidos<input name="apellidos" required minLength={2} maxLength={69} autoComplete="family-name" /></label>
            </div>
            <div className="fila">
              <label>Teléfono<input name="telefono" type="tel" required minLength={5} maxLength={30} autoComplete="tel" /></label>
              <label>Correo electrónico<input name="email" type="email" required maxLength={160} autoComplete="email" /></label>
            </div>
            <label>Currículum (PDF, máximo 5 MB)
              <input name="cv" type="file" accept="application/pdf,.pdf" required />
            </label>
            <input name="web" className="trabaja-trampa" tabIndex={-1} autoComplete="off" aria-hidden="true" />
            <label className="trabaja-consent">
              <input type="checkbox" required />
              <span>Acepto que Meridiano Logística trate mis datos y mi currículum únicamente para gestionar este proceso de selección.</span>
            </label>
            <button className="btn" disabled={estado === "enviando"}>
              {estado === "enviando" ? "Enviando solicitud" : "Enviar solicitud"}
            </button>
            <p className="aviso" role="status" aria-live="polite" data-tipo="error">{estado === "error" ? error : ""}</p>
          </form>
        )}
      </dialog>
    </>
  );
}
