// Tipos y utilidades comunes de Ventas y Facturación (los de cada sección van en su propio archivo)

export type Unidad = "servicio" | "envío" | "palé" | "kg" | "hora" | "km";
export const UNIDADES: Unidad[] = ["servicio", "envío", "palé", "kg", "hora", "km"];
export const TIPOS_IVA = [21, 10, 4, 0] as const;

export type Servicio = {
  id: string; created_at: string; codigo: string; nombre: string; descripcion: string | null;
  unidad: Unidad; precio_unitario: number; tipo_iva: number; activo: boolean;
};

// Datos fiscales que la migración añade a empresas (los clientes)
export type DatosFiscales = {
  razon_social: string | null; nif: string | null; direccion_fiscal: string | null;
  codigo_postal: string | null; ciudad: string | null; pais: string;
  email_facturacion: string | null; telefono: string | null; dias_pago: number;
};

// Importe con dos decimales (los precios unitarios no se redondean a euros enteros)
export const eur = (n: number) => n.toLocaleString("es-ES", { style: "currency", currency: "EUR" });

// "Calle Mayor 1, 50001 Zaragoza, España", sin huecos si falta algún dato
// Si no hay ningún dato de dirección devuelve "" (el país por sí solo no es una dirección)
export const direccionCompleta = (d: Pick<DatosFiscales, "direccion_fiscal" | "codigo_postal" | "ciudad" | "pais">) => {
  const lugar = [d.codigo_postal, d.ciudad].filter(Boolean).join(" ");
  return d.direccion_fiscal || lugar ? [d.direccion_fiscal, lugar, d.pais].filter(Boolean).join(", ") : "";
};

// ¿Tiene la empresa lo mínimo para poder facturarle?
export const faltaParaFacturar = (e: Partial<DatosFiscales>) => {
  const faltan: string[] = [];
  if (!e.nif) faltan.push("NIF/CIF");
  if (!e.direccion_fiscal) faltan.push("dirección fiscal");
  if (!e.codigo_postal || !e.ciudad) faltan.push("código postal y ciudad");
  return faltan;
};
