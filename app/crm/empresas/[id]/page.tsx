"use client";
import { useEffect, useState } from "react";
import { useParams, notFound } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { iniciales, colorDe } from "@/lib/avatar";
import type { Empleado, Empresa, Oportunidad } from "@/lib/tipos";

type EmpleadoConOp = Empleado & { oportunidad: Pick<Oportunidad, "nombre" | "servicio" | "estado"> | null };

export default function DetalleEmpresa() {
  const { id } = useParams<{ id: string }>();
  const [empresa, setEmpresa] = useState<Empresa | null | undefined>(undefined);
  const [equipo, setEquipo] = useState<EmpleadoConOp[]>([]);

  useEffect(() => {
    (async () => {
      const [{ data: c }, { data: e }] = await Promise.all([
        supabase.from("empresas").select("*").eq("id", id).maybeSingle(),
        supabase.from("empleados").select("*, oportunidad:oportunidades(nombre,servicio,estado)").eq("empresa_id", id).order("nombre"),
      ]);
      setEmpresa(c ?? null);
      setEquipo((e as unknown as EmpleadoConOp[]) ?? []);
    })();
  }, [id]);

  if (empresa === null) notFound();
  if (empresa === undefined) return null;

  return (
    <>
      <Link href="/crm/empresas" className="volver">← Empresas</Link>
      <div className="detalle-cab">
        <span className="icono-empresa grande" aria-hidden>🏢</span>
        <div>
          <h1>{empresa.nombre}</h1>
          <p className="ubicacion">📍 {empresa.ubicacion}</p>
        </div>
      </div>

      <h2 className="subtitulo">Empleados ({equipo.length})</h2>
      <div className="grid-tarjetas">
        {equipo.map((m) => (
          <Link key={m.id} href={`/crm/empleados/${m.id}`} className="tarjeta tarjeta-empleado">
            <span className="avatar grande" style={{ background: colorDe(m.id) }}>{iniciales(m.nombre)}</span>
            <div>
              <h3>{m.nombre}</h3>
              <p className="correo">{m.email}</p>
              <span className="chip" data-vacio={!m.oportunidad}>
                {m.oportunidad ? `${m.oportunidad.servicio} · ${m.oportunidad.estado}` : "Sin oportunidad"}
              </span>
            </div>
          </Link>
        ))}
      </div>
      {equipo.length === 0 && <p className="vacio">Esta empresa aún no tiene empleados asociados.</p>}
    </>
  );
}
