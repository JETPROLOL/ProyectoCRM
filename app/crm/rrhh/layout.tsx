"use client";
import "./rrhh.css";
import { ReactNode } from "react";

// Los apartados de RRHH (Ficha, Horarios, Check de inicio...) están en el desplegable del menú lateral: ver ../layout.tsx y ./secciones.ts
export default function RrhhLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="cab"><h1>Recursos humanos</h1></div>
      {children}
    </>
  );
}
