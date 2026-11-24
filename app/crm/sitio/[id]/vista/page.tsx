"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { plantillaPorId } from "@/lib/sitio/plantillas";
import { FilaSitio, Sitio, normalizar } from "@/lib/sitio/tipos";
import Migas from "../../../Migas";
import Icono from "../../../Icono";
import SitioRender from "../../SitioRender";
import Dispositivos, { Dispositivo } from "../../Dispositivos";

// Vista previa a pantalla completa de lo que está GUARDADO (sin panel de edición). Los enlaces del menú y los botones funcionan.
export default function VistaPrevia() {
  const { id } = useParams<{ id: string }>();
  const [sitio, setSitio] = useState<Sitio | null | undefined>(undefined);
  const [dispositivo, setDispositivo] = useState<Dispositivo>("ordenador");

  useEffect(() => {
    supabase.from("sitios_web").select("*").eq("id", id).maybeSingle().then(({ data }) => {
      const f = data as FilaSitio | null;
      setSitio(f ? normalizar(f, plantillaPorId(f.plantilla).crear()) : null);
    });
  }, [id]);

  if (sitio === undefined) return <p className="vacio" role="status">Cargando la vista previa…</p>;
  if (sitio === null) {
    return (
      <>
        <Migas ruta={[{ texto: "Sitio web", href: "/crm/sitio" }, { texto: "No encontrado" }]} />
        <div className="cab"><h1>Sitio no encontrado</h1></div>
        <p className="vacio" role="alert">Este sitio no existe o no tienes permiso para verlo. <Link href="/crm/sitio">Volver a Sitio web</Link></p>
      </>
    );
  }

  return (
    <>
      <Migas ruta={[{ texto: "Sitio web", href: "/crm/sitio" }, { texto: sitio.nombre, href: `/crm/sitio/${sitio.id}` }, { texto: "Vista previa" }]} />
      <div className="cab"><h1>Vista previa: {sitio.nombre}</h1></div>
      <div className="sitio-vista-barra">
        <Link className="btn peq" href={`/crm/sitio/${sitio.id}`}><Icono nombre="pencil" />Seguir editando</Link>
        <Dispositivos valor={dispositivo} onCambio={setDispositivo} nombre="dispositivo-vista" />
      </div>
      <div className="sitio-lienzo" data-scroll tabIndex={0} role="region" aria-label="Vista previa de la web (desplázate para ver toda la página)">
        <div className="sitio-marco" data-dispositivo={dispositivo}>
          <SitioRender sitio={sitio} />
        </div>
      </div>
    </>
  );
}
