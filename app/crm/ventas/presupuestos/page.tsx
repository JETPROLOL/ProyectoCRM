// TEMPORAL: se sustituye por la lista de presupuestos en la fase 1 de Ventas
export default function Presupuestos() {
  return (
    <section className="ventas-proximo">
      <h2>Presupuestos</h2>
      <p>Esta sección es el siguiente paso del módulo. Contendrá:</p>
      <ul>
        <li>Lista de presupuestos con filtros por estado y cliente</li>
        <li>Presupuesto con líneas, descuentos e IVA, creado desde una oportunidad</li>
        <li>Envío, aceptación y rechazo; al aceptar, la oportunidad pasa a ganada</li>
      </ul>
    </section>
  );
}
