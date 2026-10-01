"use client";
import { createContext, useContext } from "react";
import { Perfil, SIN_PERFIL } from "@/lib/rrhh/base";

type ValorPerfil = Perfil & { cargando: boolean };

const Ctx = createContext<ValorPerfil>({ ...SIN_PERFIL, cargando: true });
export const PerfilProvider = Ctx.Provider;

// Quién es el usuario logueado: si es RRHH y a qué ficha de empleado está vinculado
export const usePerfil = () => useContext(Ctx);
