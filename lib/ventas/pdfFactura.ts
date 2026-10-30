// Genera y descarga el PDF de una factura EMITIDA directamente en el navegador (sin imprimir ni abrir el detalle).
// Usa los datos fiscales que la factura copió al emitirse, así el PDF es siempre idéntico al documento original.
// jsPDF se carga solo al pulsar el botón para no engordar el resto de la página.
import type { jsPDF } from "jspdf";
import { eur } from "./base";
import type { Factura } from "./facturas";
import { Linea, baseLinea, fechaCorta, totales } from "./presupuestos";

export type LineaFactura = {
  descripcion: string; cantidad: number | string; unidad: string;
  precio_unitario: number | string; descuento_pct: number | string; tipo_iva: number | string;
};

const MARGEN = 16;
const ANCHO = 210;
const ALTO = 297;
const UTIL = ANCHO - MARGEN * 2;
// Columnas de la tabla: descripción (resto), cantidad, precio, descuento, IVA e importe (x = borde derecho de cada columna numérica)
const COL = { desc: MARGEN, cant: MARGEN + 100, precio: MARGEN + 124, dto: MARGEN + 142, iva: MARGEN + 156, imp: ANCHO - MARGEN };

// jsPDF usa fuentes estándar (WinAnsi): el espacio duro y el fino que genera toLocaleString se cambian por un espacio normal
const t = (s: string) => s.replace(/[\u00a0\u202f]/g, " ");
const num = (v: number | string) => Number(v);

export function nombreArchivoFactura(f: Pick<Factura, "numero" | "id">) {
  return `${(f.numero ?? f.id).replace(/[^\w.-]+/g, "_")}.pdf`;
}

export async function descargarPdfFactura(f: Factura, lineasBD: LineaFactura[], rectificaNumero: string | null) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const esRect = f.tipo === "rectificativa";
  const lineas: Linea[] = lineasBD.map((l, i) => ({
    clave: String(i), servicio_id: null, descripcion: l.descripcion, cantidad: num(l.cantidad), unidad: l.unidad as Linea["unidad"],
    precio_unitario: num(l.precio_unitario), descuento_pct: num(l.descuento_pct), tipo_iva: num(l.tipo_iva),
  }));
  const tot = totales(lineas);
  let y = MARGEN;

  // ---------- utilidades de dibujo ----------
  const fuente = (estilo: "normal" | "bold", tam: number) => { doc.setFont("helvetica", estilo); doc.setFontSize(tam); };
  const alto = (tam: number) => tam * 0.3528 * 1.3;        // altura de línea en mm para un cuerpo en puntos
  const linea = (y0: number, grosor: number, gris = 0) => {
    doc.setDrawColor(gris); doc.setLineWidth(grosor); doc.line(MARGEN, y0, ANCHO - MARGEN, y0);
  };
  // Escribe un párrafo ajustado al ancho dado y devuelve la y siguiente
  const parrafo = (texto: string, x: number, y0: number, ancho: number, tam: number, estilo: "normal" | "bold" = "normal") => {
    fuente(estilo, tam);
    const partes: string[] = doc.splitTextToSize(t(texto), ancho);
    partes.forEach((p, i) => doc.text(p, x, y0 + i * alto(tam)));
    return y0 + partes.length * alto(tam);
  };
  const hayHueco = (necesario: number) => {
    if (y + necesario <= ALTO - 22) return;
    doc.addPage(); y = MARGEN;
  };

  // ---------- cabecera: emisor a la izquierda, tipo y número a la derecha ----------
  fuente("bold", 18);
  doc.text(t(f.emisor_nombre ?? ""), MARGEN, y + 6, { maxWidth: 110 });
  fuente("bold", 12);
  doc.text(esRect ? "FACTURA RECTIFICATIVA" : "FACTURA", ANCHO - MARGEN, y + 5, { align: "right" });
  fuente("bold", 14);
  doc.text(t(f.numero ?? ""), ANCHO - MARGEN, y + 12, { align: "right" });
  let yEmisor = y + 12;
  for (const l of [f.emisor_nif && `NIF: ${f.emisor_nif}`, f.emisor_direccion, f.emisor_email]) {
    if (l) yEmisor = parrafo(l, MARGEN, yEmisor + 1, 110, 9);
  }
  y = Math.max(yEmisor, y + 16) + 4;
  linea(y, 0.6);
  y += 8;

  // ---------- cliente y fechas ----------
  const yBloques = y;
  fuente("bold", 10); doc.text("Cliente", MARGEN, y);
  let yCli = y + alto(10);
  yCli = parrafo(f.cliente_nombre ?? "—", MARGEN, yCli, 95, 10);
  if (f.cliente_nif) yCli = parrafo(`NIF/CIF: ${f.cliente_nif}`, MARGEN, yCli, 95, 10);
  if (f.cliente_direccion) yCli = parrafo(f.cliente_direccion, MARGEN, yCli, 95, 10);

  const xDer = ANCHO - MARGEN;
  const datos: [string, string][] = [["Fecha de emisión:", fechaCorta(f.fecha_emision)]];
  if (!esRect) datos.push(["Vencimiento:", fechaCorta(f.fecha_vencimiento)]);
  if (esRect && rectificaNumero) datos.push(["Rectifica la factura:", rectificaNumero]);
  let yDat = yBloques;
  for (const [k, v] of datos) {
    fuente("normal", 10); doc.text(t(v), xDer, yDat, { align: "right" });
    fuente("bold", 10); doc.text(k, xDer - doc.getTextWidth(t(v)) - 2, yDat, { align: "right" });
    yDat += alto(10);
  }
  y = Math.max(yCli, yDat) + 6;

  if (esRect && f.motivo) {
    y = parrafo(`Motivo de la rectificación: ${f.motivo}`, MARGEN, y, UTIL, 10) + 4;
  }

  // ---------- tabla de líneas ----------
  const cabeceraTabla = () => {
    fuente("bold", 8);
    doc.text("DESCRIPCIÓN", COL.desc, y);
    doc.text("CANT.", COL.cant, y, { align: "right" });
    doc.text("PRECIO", COL.precio, y, { align: "right" });
    doc.text("DTO.", COL.dto, y, { align: "right" });
    doc.text("IVA", COL.iva, y, { align: "right" });
    doc.text("IMPORTE", COL.imp, y, { align: "right" });
    y += 2; linea(y, 0.5); y += 5;
  };
  cabeceraTabla();
  for (const l of lineas) {
    fuente("normal", 9.5);
    const desc: string[] = doc.splitTextToSize(t(l.descripcion), COL.cant - COL.desc - 22);
    const altoFila = Math.max(desc.length, 1) * alto(9.5);
    if (y + altoFila + 4 > ALTO - 22) { doc.addPage(); y = MARGEN; cabeceraTabla(); }
    desc.forEach((d, i) => doc.text(d, COL.desc, y + i * alto(9.5)));
    fuente("normal", 9.5);
    doc.text(t(`${l.cantidad.toLocaleString("es-ES")} ${l.unidad}`), COL.cant, y, { align: "right" });
    doc.text(t(eur(l.precio_unitario)), COL.precio, y, { align: "right" });
    doc.text(l.descuento_pct ? t(`${l.descuento_pct.toLocaleString("es-ES")} %`) : "—", COL.dto, y, { align: "right" });
    doc.text(`${l.tipo_iva} %`, COL.iva, y, { align: "right" });
    doc.text(t(eur(baseLinea(l) / 100)), COL.imp, y, { align: "right" });
    y += altoFila + 1.5;
    linea(y - 1, 0.15, 160);
    y += 2;
  }

  // ---------- totales ----------
  hayHueco(14 + tot.desglose.length * 6 + 12);
  y += 4;
  const xEt = ANCHO - MARGEN - 70;
  const fila = (etiqueta: string, valor: string) => {
    fuente("normal", 10);
    doc.text(etiqueta, xEt, y);
    doc.text(t(valor), COL.imp, y, { align: "right" });
    y += 6;
  };
  fila("Base imponible", eur(tot.base));
  for (const d of tot.desglose) fila(`IVA ${d.tipo} %`, eur(d.iva));
  doc.setDrawColor(0); doc.setLineWidth(0.6); doc.line(xEt, y - 3.5, COL.imp, y - 3.5);
  y += 1.5;
  fuente("bold", 13);
  doc.text("Total", xEt, y);
  doc.text(t(eur(tot.total)), COL.imp, y, { align: "right" });
  y += 12;

  // ---------- forma de pago, notas y pie ----------
  if (!esRect) {
    const iban = f.forma_pago === "transferencia" && f.emisor_iban ? ` · IBAN ${f.emisor_iban.replace(/(.{4})/g, "$1 ").trim()}` : "";
    hayHueco(10); y = parrafo(`Forma de pago: ${f.forma_pago}${iban}`, MARGEN, y, UTIL, 10) + 3;
  }
  if (f.notas) { hayHueco(12); y = parrafo(`Notas: ${f.notas}`, MARGEN, y, UTIL, 10) + 3; }
  if (f.emisor_pie) {
    hayHueco(14); y += 4; linea(y, 0.15, 160); y += 5;
    y = parrafo(f.emisor_pie, MARGEN, y, UTIL, 8.5);
  }

  // ---------- numeración de páginas ----------
  const paginas = doc.getNumberOfPages();
  if (paginas > 1) {
    for (let i = 1; i <= paginas; i++) {
      doc.setPage(i); fuente("normal", 8);
      doc.text(`${f.numero ?? ""} · Página ${i} de ${paginas}`, ANCHO / 2, ALTO - 10, { align: "center" });
    }
  }

  doc.save(nombreArchivoFactura(f));
}
