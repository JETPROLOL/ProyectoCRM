"use client";
import { FormEvent, ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

const SECCIONES = [
  { href: "/crm", nombre: "Oportunidades" },
  { href: "/crm/empleados", nombre: "Empleados" },
  { href: "/crm/empresas", nombre: "Empresas" },
];

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
  const ruta = usePathname();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setListo(true); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!listo) return null;
  if (!session) return <Login />;

  return (
    <div className="crm">
      <aside className="lateral">
        <a href="/" className="marca"><span className="marca-m" aria-hidden>M</span>Meridiano CRM</a>
        <nav aria-label="Secciones del CRM">
          {SECCIONES.map((s) => (
            <Link key={s.href} href={s.href} aria-current={ruta === s.href ? "page" : undefined}>{s.nombre}</Link>
          ))}
        </nav>
        <button className="salir" onClick={() => supabase.auth.signOut()}>Cerrar sesión</button>
      </aside>
      <main className="panel">{children}</main>
    </div>
  );
}
