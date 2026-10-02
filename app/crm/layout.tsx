"use client";
import { FormEvent, ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { Perfil, SIN_PERFIL } from "@/lib/rrhh/base";
import { PerfilProvider } from "./PerfilContext";
import "./crm.css";

// Iconos del menú (solo presentación)
const Ico = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{children}</svg>
);
const IcoOportunidades = () => <Ico><rect x="3" y="4" width="5" height="16" rx="1" /><rect x="10" y="4" width="5" height="10" rx="1" /><rect x="17" y="4" width="4" height="6" rx="1" /></Ico>;
const IcoEmpleados = () => <Ico><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" /><path d="M18 14.3c2.2.7 3.5 2.6 3.5 5.7" /></Ico>;
const IcoEmpresas = () => <Ico><path d="M4 21V4.5A1.5 1.5 0 0 1 5.5 3h8A1.5 1.5 0 0 1 15 4.5V21" /><path d="M15 9h3.5A1.5 1.5 0 0 1 20 10.5V21" /><path d="M2 21h20" /><path d="M8 7.5h3M8 11.5h3M8 15.5h3" /></Ico>;
const IcoRrhh = () => <Ico><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" /><path d="M3 13h18" /></Ico>;
const IcoMenu = () => <Ico><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></Ico>;
const IcoSalir = () => <Ico><path d="M9 21H5.5A1.5 1.5 0 0 1 4 19.5v-15A1.5 1.5 0 0 1 5.5 3H9" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></Ico>;

const SECCIONES = [
  { href: "/crm", nombre: "Oportunidades", icono: <IcoOportunidades /> },
  { href: "/crm/empleados", nombre: "Empleados", icono: <IcoEmpleados /> },
  { href: "/crm/empresas", nombre: "Empresas", icono: <IcoEmpresas /> },
  { href: "/crm/rrhh", nombre: "RRHH", icono: <IcoRrhh /> },
];

// "/crm" solo se marca activo en su página exacta; el resto también en sus subrutas
const activa = (ruta: string, href: string) =>
  href === "/crm" ? ruta === href : ruta === href || ruta.startsWith(href + "/");

function Login() {
  const [error, setError] = useState("");
  async function entrar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const { error } = await supabase.auth.signInWithPassword({
      email: String(d.get("email")), password: String(d.get("password")),
    });
    if (error) setError("Correo o contraseña incorrectos.");
  }
  return (
    <main className="login">
      <form className="form login-card" onSubmit={entrar}>
        <h1>Acceso al CRM</h1>
        <label>Correo electrónico<input name="email" type="email" required autoComplete="email" /></label>
        <label>Contraseña<input name="password" type="password" required autoComplete="current-password" /></label>
        <button className="btn">Entrar</button>
        <p className="aviso" role="alert" data-tipo="error">{error}</p>
      </form>
    </main>
  );
}

export default function CrmLayout({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [listo, setListo] = useState(false);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const ruta = usePathname() ?? "";
  const uid = session?.user.id;
  const [colapsado, setColapsado] = useState(false);

  // Preferencia del menú: se recuerda; en pantallas pequeñas arranca contraído y se cierra al navegar
  useEffect(() => {
    try {
      const g = localStorage.getItem("crm-menu");
      if (g !== null) setColapsado(g === "1");
      else if (window.matchMedia("(max-width:860px)").matches) setColapsado(true);
    } catch { /* sin almacenamiento: se queda expandido */ }
  }, []);
  useEffect(() => {
    if (window.matchMedia("(max-width:860px)").matches) setColapsado(true);
  }, [ruta]);
  function alternarMenu() {
    const nuevo = !colapsado;
    setColapsado(nuevo);
    try { localStorage.setItem("crm-menu", nuevo ? "1" : "0"); } catch { /* ignorar */ }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setListo(true); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  // Al iniciar sesión: vincula al usuario con su ficha (por correo) y carga su perfil.
  // Si la migración de RRHH aún no está aplicada, falla en silencio y el resto del CRM sigue funcionando.
  useEffect(() => {
    if (!uid) { setPerfil(null); return; }
    let vivo = true;
    (async () => {
      await supabase.rpc("vincular_usuario_actual");
      const { data } = await supabase.rpc("mi_perfil");
      if (vivo) setPerfil((data as Perfil | null) ?? SIN_PERFIL);
    })();
    return () => { vivo = false; };
  }, [uid]);

  if (!listo) return null;
  if (!session) return <Login />;

  return (
    <PerfilProvider value={{ ...(perfil ?? SIN_PERFIL), cargando: perfil === null }}>
      <div className="crm" data-colapsado={colapsado}>
        <aside className="lateral">
          <div className="lateral-cab">
            <a href="/" className="marca" title="Meridiano CRM"><span className="marca-m" aria-hidden>M</span><span className="lat-txt">Meridiano CRM</span></a>
            <button type="button" className="lat-toggle" onClick={alternarMenu} aria-expanded={!colapsado}
              aria-label={colapsado ? "Expandir menú" : "Contraer menú"} title={colapsado ? "Expandir menú" : "Contraer menú"}>
              <IcoMenu />
            </button>
          </div>
          <nav aria-label="Secciones del CRM">
            {SECCIONES.map((s) => (
              <Link key={s.href} href={s.href} data-tip={s.nombre} aria-label={s.nombre}
                aria-current={activa(ruta, s.href) ? "page" : undefined}>
                <span className="lat-ico">{s.icono}</span><span className="lat-txt">{s.nombre}</span>
              </Link>
            ))}
          </nav>
        </aside>
        <div className="principal">
          <header className="topbar">
            <span className="usuario" title={session.user.email ?? undefined}>{session.user.email}</span>
            <button type="button" className="salir" onClick={() => supabase.auth.signOut()}><IcoSalir /><span>Cerrar sesión</span></button>
          </header>
          <main className="panel">{children}</main>
        </div>
      </div>
    </PerfilProvider>
  );
}
