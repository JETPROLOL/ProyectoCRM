"use client";
import { FormEvent, ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { Perfil, SIN_PERFIL } from "@/lib/rrhh/base";
import { PerfilProvider } from "./PerfilContext";

const SECCIONES = [
  { href: "/crm", nombre: "Oportunidades" },
  { href: "/crm/empleados", nombre: "Empleados" },
  { href: "/crm/empresas", nombre: "Empresas" },
  { href: "/crm/rrhh", nombre: "RRHH" },
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
      <div className="crm">
        <aside className="lateral">
          <a href="/" className="marca"><span className="marca-m" aria-hidden>M</span>Meridiano CRM</a>
          <nav aria-label="Secciones del CRM">
            {SECCIONES.map((s) => (
              <Link key={s.href} href={s.href} aria-current={activa(ruta, s.href) ? "page" : undefined}>{s.nombre}</Link>
            ))}
          </nav>
          <button className="salir" onClick={() => supabase.auth.signOut()}>Cerrar sesión</button>
        </aside>
        <main className="panel">{children}</main>
      </div>
    </PerfilProvider>
  );
}
