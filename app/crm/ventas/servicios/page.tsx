"use client";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Servicio, TIPOS_IVA, UNIDADES, eur } from "@/lib/ventas/base";
import Modal from "../../Modal";

export default function Servicios() {
  const [items, setItems] = useState<Servicio[]>([]);
  const [cargando, setCargando] = useState(true);
  const [q, setQ] = useState("");
  const [verInactivos, setVerInactivos] = useState(false);
  const [editando, setEditando] = useState<Servicio | "nuevo" | null>(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from("servicios").select("*").order("codigo");
    if (error) setError(`No se pudo cargar el catálogo. ${error.message}`);
    setItems((data as Servicio[]) ?? []);
    setCargando(false);
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const visibles = useMemo(() => items.filter((s) =>
    (verInactivos || s.activo) && `${s.codigo} ${s.nombre}`.toLowerCase().includes(q.toLowerCase())), [items, q, verInactivos]);

  async function guardar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const fila = {
      codigo: String(d.get("codigo")).trim().toUpperCase(),
      nombre: String(d.get("nombre")).trim(),
      descripcion: String(d.get("descripcion")).trim() || null,
      unidad: String(d.get("unidad")),
      precio_unitario: Number(d.get("precio")),
      tipo_iva: Number(d.get("iva")),
    };
    setError("");
    const r = editando && editando !== "nuevo"
      ? await supabase.from("servicios").update(fila).eq("id", editando.id)
      : await supabase.from("servicios").insert(fila);
    if (r.error) {
      return setError(r.error.code === "23505"
        ? "Ya existe un servicio con ese código."
        : `No se pudo guardar el servicio. ${r.error.message}`);
    }
    setAviso(`Servicio ${fila.codigo} guardado.`);
    setEditando(null);
    cargar();
  }

  async function alternarActivo(s: Servicio) {
    setError("");
    const { error } = await supabase.from("servicios").update({ activo: !s.activo }).eq("id", s.id);
    if (error) return setError(`No se pudo cambiar el estado. ${error.message}`);
    setAviso(`Servicio ${s.codigo} ${s.activo ? "desactivado" : "activado"}.`);
    cargar();
  }

  const s = editando && editando !== "nuevo" ? editando : null;

  return (
    <>
      <div className="ventas-barra">
        <input type="search" className="buscar" placeholder="Buscar por código o nombre" value={q}
          onChange={(e) => setQ(e.target.value)} aria-label="Buscar servicios" />
        <label className="ventas-check">
          <input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} />
          Mostrar desactivados
        </label>
        <button className="btn" onClick={() => { setError(""); setAviso(""); setEditando("nuevo"); }}>Nuevo servicio</button>
      </div>

      <p className="aviso" role="status" data-tipo={error ? "error" : "ok"}>{editando === null ? error || aviso : ""}</p>

      {!cargando && visibles.length === 0 ? (
        <p className="vacio">{items.length === 0 ? "El catálogo está vacío. Crea el primer servicio." : "Ningún servicio coincide con la búsqueda."}</p>
      ) : (
        <div className="tabla ventas-tabla">
          <table>
            <caption className="ventas-solo-lectores">Catálogo de servicios</caption>
            <thead>
              <tr>
                <th scope="col">Código</th><th scope="col">Servicio</th><th scope="col">Unidad</th>
                <th scope="col" className="num">Precio</th><th scope="col" className="num">IVA</th>
                <th scope="col">Estado</th><th scope="col"><span className="ventas-solo-lectores">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((x) => (
                <tr key={x.id} data-inactivo={!x.activo}>
                  <td className="cod">{x.codigo}</td>
                  <td>{x.nombre}{x.descripcion && <span className="sub">{x.descripcion}</span>}</td>
                  <td>{x.unidad}</td>
                  <td className="num">{eur(x.precio_unitario)}</td>
                  <td className="num">{x.tipo_iva} %</td>
                  <td><span className="ventas-etiqueta" data-activo={x.activo}>{x.activo ? "Activo" : "Desactivado"}</span></td>
                  <td>
                    <div className="acciones">
                      <button type="button" onClick={() => { setError(""); setAviso(""); setEditando(x); }}
                        aria-label={`Editar ${x.nombre}`}>Editar</button>
                      <button type="button" onClick={() => alternarActivo(x)}
                        aria-label={`${x.activo ? "Desactivar" : "Activar"} ${x.nombre}`}>{x.activo ? "Desactivar" : "Activar"}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal abierto={editando !== null} titulo={s ? "Editar servicio" : "Nuevo servicio"} onCerrar={() => setEditando(null)}>
        {editando !== null && (
          <form className="form plano ventas-form" onSubmit={guardar} key={s?.id ?? "nuevo"}>
            <div className="fila">
              <label>Código
                <input name="codigo" required pattern="[A-Za-z0-9\-]{2,20}" maxLength={20} defaultValue={s?.codigo ?? ""}
                  aria-describedby="serv-ayuda-codigo" />
                <span id="serv-ayuda-codigo" className="ayuda">Letras, números y guiones. Ej.: TRN-NAC</span>
              </label>
              <label>Unidad
                <select name="unidad" defaultValue={s?.unidad ?? "servicio"}>
                  {UNIDADES.map((u) => <option key={u}>{u}</option>)}
                </select>
              </label>
            </div>
            <label>Nombre<input name="nombre" required minLength={2} maxLength={120} defaultValue={s?.nombre ?? ""} /></label>
            <label>Descripción (opcional)<textarea name="descripcion" maxLength={500} defaultValue={s?.descripcion ?? ""} /></label>
            <div className="fila">
              <label>Precio unitario (€, sin IVA)
                <input name="precio" type="number" required min={0} step="0.01" inputMode="decimal" defaultValue={s?.precio_unitario ?? ""} />
              </label>
              <label>IVA
                <select name="iva" defaultValue={s?.tipo_iva ?? 21}>
                  {TIPOS_IVA.map((t) => <option key={t} value={t}>{t} %</option>)}
                </select>
              </label>
            </div>
            <button className="btn">{s ? "Guardar cambios" : "Crear servicio"}</button>
            <p className="aviso" role="alert" data-tipo="error">{error}</p>
          </form>
        )}
      </Modal>
    </>
  );
}
