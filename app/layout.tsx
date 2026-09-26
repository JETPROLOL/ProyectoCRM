import type { Metadata } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import "./globals.css";

const cuerpo = Barlow({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--f-body" });
const titulo = Barlow_Condensed({ subsets: ["latin"], weight: ["600", "700"], variable: "--f-head" });

export const metadata: Metadata = {
  title: "Meridiano Logística | Transporte y distribución",
  description: "Transporte nacional e internacional, almacenaje y última milla con seguimiento en cada paso.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${cuerpo.variable} ${titulo.variable}`}>
      <body>{children}</body>
    </html>
  );
}
