// js/comprobante.js — constancia de pago (comprobante.html?op=CODIGO)
import { sql } from './neon-config.js';
import { exigirSesion } from './auth.js';
import { formatearSoles } from './tarifario.js';

const usuario = exigirSesion();
if (!usuario) throw new Error('Sin sesión');

const NOMBRES_METODO = {
  tarjeta_debito: 'Tarjeta de débito', tarjeta_credito: 'Tarjeta de crédito',
  billetera: 'Billetera electrónica', efectivo: 'Efectivo', pos: 'Tarjeta en POS'
};

const contenedor = document.querySelector('#comprobante');
const op = new URLSearchParams(location.search).get('op');

// Los cajeros y administradores vuelven a su módulo; el cliente, a sus registros
const enlaceVolver = document.querySelector('#volver');
if (usuario.rol === 'cajero' || usuario.rol === 'administrador') {
  enlaceVolver.href = 'caja.html';
} else if (usuario.rol === 'empleado') {
  enlaceVolver.href = 'panel.html';
}

function agregarDato(lista, etiqueta, valor, clase = '') {
  const dt = document.createElement('dt');
  const dd = document.createElement('dd');
  dt.textContent = etiqueta;
  dd.textContent = valor ?? '—';
  if (clase) dd.className = clase;
  lista.append(dt, dd);
}

async function cargar() {
  if (!op) {
    contenedor.textContent = 'Comprobante no encontrado.';
    return;
  }
  let pago;
  try {
    const filas = await sql`
      SELECT p.codigo_operacion, p.canal, p.metodo, p.proveedor_billetera, p.marca_tarjeta, p.referencia,
             p.monto, p.monto_recibido, p.vuelto, p.fecha_pago, p.id_usuario,
             r.codigo AS codigo_solicitud, u.nombre AS cliente, c.nombre AS cajero
      FROM pagos p
      JOIN incidencias r ON r.id = p.id_registro
      LEFT JOIN usuarios u ON u.id = p.id_usuario
      LEFT JOIN usuarios c ON c.id = p.id_cajero
      WHERE p.codigo_operacion = ${op} AND p.estado = 'aprobado';
    `;
    pago = filas[0];
  } catch (error) {
    console.error(error);
    contenedor.textContent = 'No se pudo cargar el comprobante. Revisa tu conexión.';
    return;
  }

  // Un cliente solo puede ver sus propios comprobantes
  if (!pago || (usuario.rol === 'cliente' && pago.id_usuario !== usuario.id)) {
    contenedor.textContent = 'Comprobante no encontrado.';
    return;
  }

  contenedor.replaceChildren();
  const dl = document.createElement('dl');
  agregarDato(dl, 'N.° de operación', pago.codigo_operacion);
  agregarDato(dl, 'Solicitud', pago.codigo_solicitud);
  agregarDato(dl, 'Concepto', 'Tasa de resguardo — Serenazgo');
  agregarDato(dl, 'Cliente', pago.cliente ?? 'Atención presencial');
  agregarDato(dl, 'Canal', pago.canal === 'pasarela' ? 'Pago en línea' : 'Ventanilla');
  agregarDato(dl, 'Medio', `${NOMBRES_METODO[pago.metodo]} ${pago.marca_tarjeta ?? pago.proveedor_billetera ?? ''} ${pago.referencia ?? ''}`.trim());
  agregarDato(dl, 'Importe', formatearSoles(Number(pago.monto)), 'importe');
  if (pago.metodo === 'efectivo') {
    agregarDato(dl, 'Recibido', formatearSoles(Number(pago.monto_recibido)));
    agregarDato(dl, 'Vuelto', formatearSoles(Number(pago.vuelto)));
  }
  if (pago.cajero) agregarDato(dl, 'Atendido por', pago.cajero);
  agregarDato(dl, 'Fecha y hora', new Date(pago.fecha_pago).toLocaleString('es-PE', { timeZone: 'America/Lima' }));
  contenedor.append(dl);
}

document.querySelector('#imprimir').addEventListener('click', () => window.print());
await cargar();
