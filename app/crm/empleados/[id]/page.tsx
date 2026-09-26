"use client";
import { useEffect, useState } from "react";
import { useParams, notFound } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { iniciales, colorDe } from "@/lib/avatar";
import { euros } from "@/lib/tipos";
import type { Empleado, Empresa, Oportunidad } from "@/lib/tipos";

type Detalle = Empleado & { empresa: Empresa | null; oportunidad: Oportunidad | null };

export default function DetalleEmpleado() {
  const { id } = useParams<{ id: string }>();
  const [m, setM] = useState<Detalle | null | undefined>(undefined);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("empleados")
        .select("*, empresa:empresas(*), oportunidad:oportunidades(*)")
        .eq("id", id)
        .maybeSingle();
      setM((data as unknown as Detalle) ?? null);
    })();
  }, [id]);

  if (m === null) notFound();
  if (m === undefined) return null;

  return (
    <>
      <Link href="/crm/empleados" className="volver">← Empleados</Link>
      <div className="detalle-cab">
        <span className="avatar grande" style={{ background: colorDe(m.id) }} aria-hidden>{iniciales(m.nombre)}</span>
        <div>
          <h1>{m.nombre}</h1>
          <p className="correo">{m.email} · {m.telefono}</p>
        </div>
      </div>

      <div className="detalle-cols">
        <section className="ficha-detalle">
          <h2 className="subtitulo">Empresa</h2>
          {m.empresa ? (
            <Link href={`/crm/empresas/${m.empresa.id}`} className="tarjeta tarjeta-empresa">
              <div className="tarjeta-cab">
                <span className="icono-empresa" aria-hidden>🏢</span>
                <div><h3>{m.empresa.nombre}</h3><p className="ubicacion">📍 {m.empresa.ubicacion}</p></div>
              </div>
            </Link>
          ) : <p className="vacio">Este empleado no tiene empresa asociada.</p>}
        </section>

        <section className="ficha-detalle">
          <h2 className="subtitulo">Oportunidad redactada</h2>
          {m.oportunidad ? (
            <div className="tarjeta sin-enlace">
              <b>{m.oportunidad.nombre}</b>
              <span className="sub">{m.oportunidad.empresa ? `${m.oportunidad.empresa}, ` : ""}{m.oportunidad.servicio}</span>
              {m.oportunidad.mensaje && <p className="msg">{m.oportunidad.mensaje}</p>}
              <div className="tarjeta-pie">
                <span className="estado" data-estado={m.oportunidad.estado}>{m.oportunidad.estado}</span>
                {m.oportunidad.valor_estimado != null && <span>{euros(m.oportunidad.valor_estimado)}</span>}
              </div>
            </div>
          ) : <p className="vacio">Este empleado no tiene ninguna oportunidad asociada.</p>}
        </section>
      </div>
    </>
  );
}
