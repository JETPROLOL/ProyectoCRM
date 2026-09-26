import ContactForm from "./ContactForm";

const servicios = [
  ["Transporte nacional", "Carga completa y grupaje con recogida en 24 horas y entrega con cita en toda la península."],
  ["Transporte internacional", "Rutas regulares a Europa por carretera y marítimo, con gestión aduanera incluida."],
  ["Almacenaje y distribución", "Naves con control de inventario en tiempo real, picking y preparación de pedidos."],
  ["Última milla", "Entregas urbanas con franja horaria, prueba de entrega digital y gestión de devoluciones."],
];

const pasos = [
  ["Solicitud", "Nos cuentas origen, destino y tipo de carga."],
  ["Presupuesto", "Recibes una tarifa cerrada en menos de 24 horas."],
  ["Recogida", "Un transportista asignado recoge la mercancía en la fecha acordada."],
  ["Entrega", "Sigues el envío en directo y recibes la prueba de entrega."],
];

export default function Home() {
  return (
    <>
      <header className="nav">
        <div className="wrap nav-in">
          <a href="#" className="marca"><span className="marca-m" aria-hidden>M</span>Meridiano Logística</a>
          <nav aria-label="Principal">
            <a href="#servicios">Servicios</a>
            <a href="#proceso">Cómo trabajamos</a>
            <a href="#contacto" className="btn peq">Pedir presupuesto</a>
          </nav>
        </div>
      </header>

      <section className="hero">
        <div className="wrap hero-in">
          <div>
            <h1>Tu mercancía llega cuando dijimos que llegaría.</h1>
            <p className="lead">Transporte, almacenaje y distribución para empresas que no pueden permitirse un retraso. Un único interlocutor y seguimiento en cada tramo.</p>
            <div className="acciones">
              <a href="#contacto" className="btn">Solicitar presupuesto</a>
              <a href="#servicios" className="btn ghost">Ver servicios</a>
            </div>
          </div>
          <aside className="albaran" aria-label="Ejemplo de seguimiento de un envío">
            <div className="albaran-cab"><span>Envío MRD-0187</span><span className="sello">En ruta</span></div>
            <p className="ruta">Madrid a Hamburgo</p>
            <ol className="paradas">
              <li className="hecha"><b>Recogida en Coslada</b><span>Lun 09:12</span></li>
              <li className="hecha"><b>Salida del hub de Madrid</b><span>Lun 18:40</span></li>
              <li className="actual"><b>Cruce de frontera en Irún</b><span>Mar 07:05</span></li>
              <li><b>Entrega en Hamburgo</b><span>Jue 10:00 (prevista)</span></li>
            </ol>
          </aside>
        </div>
      </section>

      <section id="servicios" className="sec">
        <div className="wrap">
          <h2>Servicios logísticos de extremo a extremo</h2>
          <dl className="servicios">
            {servicios.map(([t, d]) => (
              <div key={t}><dt>{t}</dt><dd>{d}</dd></div>
            ))}
          </dl>
        </div>
      </section>

      <section id="proceso" className="sec oscura">
        <div className="wrap">
          <h2>Del presupuesto a la entrega en cuatro pasos</h2>
          <ol className="pasos">
            {pasos.map(([t, d]) => (
              <li key={t}><h3>{t}</h3><p>{d}</p></li>
            ))}
          </ol>
        </div>
      </section>

      <section id="contacto" className="sec">
        <div className="wrap contacto">
          <div>
            <h2>Cuéntanos qué necesitas mover</h2>
            <p className="lead oscuro">Un especialista de nuestro equipo comercial revisará tu solicitud y te enviará un presupuesto sin compromiso.</p>
            <p className="datos">comercial@meridiano-logistica.example<br />+34 900 000 000<br />Lunes a viernes, de 8:00 a 19:00</p>
          </div>
          <ContactForm />
        </div>
      </section>

      <footer className="pie">
        <div className="wrap">© 2026 Meridiano Logística. Proyecto académico de Sistemas de Gestión Empresarial.</div>
      </footer>
    </>
  );
}
