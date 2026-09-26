"use client";
import { FormEvent, useState } from "react";
import { supabase } from "@/lib/supabase";

const SERVICIOS = [
  "Transporte nacional",
  "Transporte internacional",
  "Almacenaje y distribución",
  "Última milla",
  "Otro",
];

export default function ContactForm() {
  const [estado, setEstado] = useState<"idle" | "enviando" | "ok" | "error">("idle");

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const d = new FormData(form);
    setEstado("enviando");
    // Cada envío crea una fila en "oportunidades" que el CRM muestra al instante
    const { error } = await supabase.from("oportunidades").insert({
      nombre: String(d.get("nombre")).trim(),
      empresa: String(d.get("empresa")).trim() || null,
      email: String(d.get("email")).trim(),
      telefono: String(d.get("telefono")).trim() || null,
      servicio: String(d.get("servicio")),
      mensaje: String(d.get("mensaje")).trim() || null,
    });
    if (error) {
      console.error(error);
      return setEstado("error");
    }
    form.reset();
    setEstado("ok");
  }

  return (
    <form className="form" onSubmit={enviar}>
      <div className="fila">
        <label>Nombre<input name="nombre" required minLength={2} maxLength={120} autoComplete="name" /></label>
        <label>Empresa<input name="empresa" autoComplete="organization" /></label>
      </div>
      <div className="fila">
        <label>Correo electrónico<input name="email" type="email" required autoComplete="email" /></label>
        <label>Teléfono<input name="telefono" type="tel" autoComplete="tel" /></label>
      </div>
      <label>Servicio que necesitas
        <select name="servicio" required defaultValue="">
          <option value="" disabled>Elige un servicio</option>
          {SERVICIOS.map((s) => <option key={s}>{s}</option>)}
        </select>
      </label>
      <label>Cuéntanos tu envío
        <textarea name="mensaje" rows={4} maxLength={2000} placeholder="Origen, destino, tipo de carga y frecuencia" />
      </label>
      <button className="btn" disabled={estado === "enviando"}>
        {estado === "enviando" ? "Enviando solicitud" : "Solicitar presupuesto"}
      </button>
      <p className="aviso" role="status" aria-live="polite" data-tipo={estado}>
        {estado === "ok" && "Solicitud enviada. Te responderemos en menos de 24 horas laborables."}
        {estado === "error" && "No se pudo enviar la solicitud. Revisa los datos e inténtalo de nuevo."}
      </p>
    </form>
  );
}
