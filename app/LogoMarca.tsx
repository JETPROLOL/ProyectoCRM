"use client";
import { useState } from "react";

// Logo de la web pública. Para personalizarlo, guarda tu imagen como public/logo-web.png
// (o cambia LOGO_WEB por otro nombre/formato: .svg, .jpg, .webp). Si el archivo no existe,
// se muestra la "M" de siempre. Es decorativo (alt vacío) porque el nombre de la empresa va escrito al lado.
const LOGO_WEB = "/logo-crm.jpg";

export default function LogoMarca() {
  const [fallo, setFallo] = useState(false);
  if (fallo) return <span className="marca-m" aria-hidden>M</span>;
  return <img className="marca-img" src={LOGO_WEB} alt="" height={32} onError={() => setFallo(true)} />;
}
