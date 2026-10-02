"use client";
import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { urlFoto } from "@/lib/rrhh/archivos";
import { PUESTOS_SUGERIDOS, subirFoto, validarFoto } from "@/lib/rrhh/ficha";
import type { Empleado } from "@/lib/tipos";

type Props = {
  trabajador: Empleado | null; // null = crear uno nuevo
  todos: Empleado[];           // para detectar correos repetidos
  onGuardado: (aviso?: string) => void;
};

export default function FichaForm({ trabajador, todos, onGuardado }: Props) {
  const [foto, setFoto] = useState<File | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const vinculado = !!trabajador?.user_id; // ya tiene usuario del CRM: su correo no se puede cambiar

  useEffect(() => {
    if (!foto) { setPrevia(null); return; }
    const url = URL.createObjectURL(foto);
    setPrevia(url);
    return () => URL.revokeObjectURL(url);
  }, [foto]);

  function elegirFoto(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    const problema = f ? validarFoto(f) : null;
    if (problema) { setError(problema); e.target.value = ""; setFoto(null); return; }
    setError("");
    setFoto(f);
  }

  async function guardar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const nombre = String(d.get("nombre")).trim();
    const telefono = String(d.get("telefono")).trim();
    const puesto = String(d.get("puesto")).trim() || null;
    // Un campo desactivado no viaja en el formulario, así que se usa el correo que ya tiene la ficha
    const email = vinculado && trabajador ? trabajador.email : String(d.get("email")).trim();

    if (todos.some((t) => t.id !== trabajador?.id && t.email.toLowerCase() === email.toLowerCase())) {
      return setError("Ya existe un trabajador con ese correo.");
    }
    setError("");
    setGuardando(true);

    let id = trabajador?.id ?? "";
    if (trabajador) {
      const cambios: Record<string, unknown> = { nombre, telefono, puesto, estado: String(d.get("estado")) };
      if (!vinculado) cambios.email = email;
      const { data, error: fallo } = await supabase.from("empleados").update(cambios).eq("id", trabajador.id).select("id");
      if (fallo || !data?.length) {
        setGuardando(false);
        return setError(`No se pudo guardar la ficha. ${fallo?.message ?? "No tienes permiso o la ficha ya no existe."}`);
      }
    } else {
      const { data, error: fallo } = await supabase.from("empleados").insert({ nombre, email, telefono, puesto }).select("id").single();
      if (fallo || !data) {
        setGuardando(false);
        return setError(`No se pudo crear el trabajador. ${fallo?.message ?? ""}`);
      }
      id = data.id;
    }

    // La ficha ya está guardada; si falla la foto se avisa, pero no se pierde el trabajador
    let aviso: string | undefined;
    if (foto) {
      const problema = await subirFoto(id, foto, trabajador?.foto_path);
      if (problema) aviso = `La ficha se guardó, pero la foto no se pudo subir: ${problema}`;
    }
    setGuardando(false);
    onGuardado(aviso);
  }

  const fotoActual = previa ?? urlFoto(trabajador?.foto_path);

  return (
    <form className="form plano" onSubmit={guardar}>
      <div className="ficha-subida">
        {fotoActual
          ? <img className="ficha-foto" src={fotoActual} alt="Vista previa de la foto" style={{ width: 72, height: 72 }} />
          : <span className="ficha-foto ficha-iniciales ficha-vacia" aria-hidden>📷</span>}
        <label>Foto
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={elegirFoto} />
          <span className="ficha-ayuda">JPG, PNG o WebP, máximo 2 MB. Opcional.</span>
        </label>
      </div>

      <div className="fila">
        <label>Nombre<input name="nombre" required minLength={2} maxLength={120} defaultValue={trabajador?.nombre ?? ""} /></label>
        <label>Puesto<input name="puesto" list="puestos-sugeridos" maxLength={80} defaultValue={trabajador?.puesto ?? ""} /></label>
      </div>
      <datalist id="puestos-sugeridos">
        {PUESTOS_SUGERIDOS.map((p) => <option key={p} value={p} />)}
      </datalist>

      <div className="fila">
        <label>Correo electrónico
          <input name="email" type="email" required defaultValue={trabajador?.email ?? ""} disabled={vinculado} />
          {vinculado && <span className="ficha-ayuda">No se puede cambiar: ya está vinculado a un usuario del CRM.</span>}
        </label>
        <label>Teléfono<input name="telefono" type="tel" required minLength={5} maxLength={30} defaultValue={trabajador?.telefono ?? ""} /></label>
      </div>

      {trabajador && (
        <label>Estado
          <select name="estado" defaultValue={trabajador.estado}>
            <option value="activo">Activo</option>
            <option value="baja">Baja</option>
          </select>
        </label>
      )}

      <button className="btn" disabled={guardando}>
        {guardando ? "Guardando" : trabajador ? "Guardar cambios" : "Crear trabajador"}
      </button>
      <p className="aviso" role="alert" data-tipo="error">{error}</p>
    </form>
  );
}
