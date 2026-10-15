// js/actualizar.js — Mis registros: consulta, estado de pago, actualización y enlaces a pago / comprobante
import { exigirRol, actualizarNavegacion, mostrarAlertaModal } from './auth.js';
import { sql } from './neon-config.js';
import { calcularMontoServicio, estadoPagoInicial, formatearSoles } from './tarifario.js';

let usuarioSesion = null;
let misRegistrosFiltrados = [];

const ESTADOS = {
  'ATENDIDO':   { clase: 'atendido',   icono: 'fa-check-circle',  texto: 'Atendido' },
  'EN PROCESO': { clase: 'en-proceso', icono: 'fa-spinner fa-spin', texto: 'En Proceso' },
  'RECHAZADO':  { clase: 'rechazado',  icono: 'fa-times-circle',  texto: 'Rechazado' },
  'PENDIENTE':  { clase: 'pendiente',  icono: 'fa-clock',         texto: 'Pendiente' }
};

const PAGOS = {
  pendiente: { clase: 'pago-pendiente', icono: 'fa-hourglass-half', texto: 'Por pagar' },
  pagado:    { clase: 'pagado',         icono: 'fa-receipt',        texto: 'Pagado' },
  exonerado: { clase: 'exonerado',      icono: 'fa-hand-holding-heart', texto: 'Exonerado' }
};

function abrirEdicion(codigo) {
  const registro = misRegistrosFiltrados.find(r => r.codigo === codigo);
  if (!registro) return;

  if ((registro.estado || '').toUpperCase().trim() === 'ATENDIDO') {
    mostrarAlertaModal({
      titulo: 'Acción No Permitida',
      mensaje: 'Este reporte ya fue atendido por nuestras unidades y su información no se puede modificar.'
    });
    return;
  }
  if (registro.estado_pago === 'pagado') {
    mostrarAlertaModal({
      titulo: 'Solicitud pagada',
      mensaje: 'Esta solicitud ya fue pagada, por lo que su información y su monto no se pueden modificar.'
    });
    return;
  }

  document.getElementById('editCodigo').value = registro.codigo;
  document.getElementById('editDescripcion').value = registro.descripcion || '';
  document.getElementById('editHoras').value = registro.horas_resguardo ?? 0;
  document.getElementById('editEfectivos').value = registro.efectivos_adicionales ?? 0;
  actualizarCotizacionModal();
  document.getElementById('modalEditar').classList.add('active');
}

function actualizarCotizacionModal() {
  const monto = calcularMontoServicio({
    horas_resguardo: document.getElementById('editHoras').value,
    efectivos_adicionales: document.getElementById('editEfectivos').value
  });
  document.getElementById('editMonto').textContent = formatearSoles(monto);
}

document.addEventListener('DOMContentLoaded', () => {
  usuarioSesion = exigirRol('cliente');
  if (!usuarioSesion) return;

  actualizarNavegacion();

  const tituloNombre = document.getElementById('nombreUsuarioTitulo');
  if (tituloNombre) tituloNombre.textContent = usuarioSesion.nombre;

  cargarDatosDelUsuario();
  configurarModal();
  configurarDelegacionTabla();
});

function configurarDelegacionTabla() {
  const tbody = document.getElementById('tabla-registros-body');
  if (!tbody) return;

  // Un solo listener para todos los botones "Actualizar" de la tabla
  tbody.addEventListener('click', (e) => {
    const btnEdit = e.target.closest('button[data-accion="editar"]');
    if (btnEdit) abrirEdicion(btnEdit.dataset.codigo);
  });
}

function filaMensaje(tbody, texto, color) {
  tbody.replaceChildren();
  const tr = document.createElement('tr');
  const td = document.createElement('td');
  td.colSpan = 8;
  td.textContent = texto;
  td.style.cssText = `text-align:center; padding:30px; color:${color};`;
  tr.append(td);
  tbody.append(tr);
}

async function cargarDatosDelUsuario() {
  const tbody = document.getElementById('tabla-registros-body');
  if (!tbody) return;

  filaMensaje(tbody, 'Cargando incidencias desde la base de datos...', '#9ca3af');

  try {
    // Los registros antiguos sin usuario_id se reconocen por el nombre del ciudadano
    const palabras = (usuarioSesion.nombre || '').split(/[\s.]+/).filter(Boolean);
    const p1 = palabras[0] ? `%${palabras[0]}%` : '%';
    const p2 = palabras[1] ? `%${palabras[1]}%` : p1;

    misRegistrosFiltrados = await sql`
      SELECT i.id, i.codigo, i.cliente,
             to_char(i.fecha_registro, 'DD/MM/YYYY') AS fecha,
             i.tipo_incidencia AS tipo, i.suministro_zona AS ubicacion,
             i.sustento AS descripcion, i.respuesta, i.estado,
             i.estado_pago, i.monto_calculado, i.horas_resguardo, i.efectivos_adicionales,
             p.codigo_operacion
      FROM incidencias i
      LEFT JOIN pagos p ON p.id_registro = i.id AND p.estado = 'aprobado'
      WHERE i.usuario_id = ${usuarioSesion.id}
         OR (i.usuario_id IS NULL AND i.cliente ILIKE ${p1} AND i.cliente ILIKE ${p2})
      ORDER BY i.fecha_registro DESC;
    `;
    renderizarTabla();
  } catch (error) {
    console.error('Error conectando a Neon:', error);
    filaMensaje(tbody, 'Error al conectar con la base de datos. Verifica la consola.', '#dc2626');
  }
}

function crearBadge(def) {
  const span = document.createElement('span');
  span.className = `badge ${def.clase}`;
  const icono = document.createElement('i');
  icono.className = `fas ${def.icono}`;
  span.append(icono, ' ', def.texto);
  return span;
}

function crearBotonEditar(registro) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn-action edit';
  b.dataset.accion = 'editar';
  b.dataset.codigo = registro.codigo;
  const icono = document.createElement('i');
  icono.className = 'fas fa-pen';
  b.append(icono, ' Actualizar');
  return b;
}

function crearBotonBloqueado(texto, titulo) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn-action locked';
  b.disabled = true;
  b.title = titulo;
  const icono = document.createElement('i');
  icono.className = 'fas fa-lock';
  b.append(icono, ` ${texto}`);
  return b;
}

// Enlace según el estado financiero: Pagar / Ver comprobante / (nada si está exonerado)
function crearAccionDePago(registro) {
  if (registro.estado_pago === 'pendiente') {
    const a = document.createElement('a');
    a.className = 'btn-action pay';
    a.href = `pago.html?id=${encodeURIComponent(registro.id)}`;
    const icono = document.createElement('i');
    icono.className = 'fas fa-credit-card';
    a.append(icono, ' Pagar');
    return a;
  }
  if (registro.estado_pago === 'pagado' && registro.codigo_operacion) {
    const a = document.createElement('a');
    a.className = 'btn-action receipt';
    a.href = `comprobante.html?op=${encodeURIComponent(registro.codigo_operacion)}`;
    const icono = document.createElement('i');
    icono.className = 'fas fa-file-invoice';
    a.append(icono, ' Ver comprobante');
    return a;
  }
  return null;
}

function renderizarTabla() {
  const tbody = document.getElementById('tabla-registros-body');
  if (!tbody) return;
  tbody.replaceChildren();

  if (misRegistrosFiltrados.length === 0) {
    filaMensaje(tbody, 'No tienes incidentes reportados actualmente.', '#9ca3af');
    return;
  }

  for (const registro of misRegistrosFiltrados) {
    const tr = document.createElement('tr');
    const estado = (registro.estado || '').toUpperCase().trim();

    const celda = (clase = '') => {
      const td = document.createElement('td');
      if (clase) td.className = clase;
      tr.append(td);
      return td;
    };

    celda('code-highlight').textContent = registro.codigo;
    celda().textContent = registro.fecha;
    celda().textContent = registro.tipo;
    celda().textContent = registro.ubicacion;

    // Descripción: si la central respondió, se muestra su respuesta y el reporte inicial
    const tdDesc = celda('desc-text');
    const tieneRespuesta = Boolean(registro.respuesta && registro.respuesta.trim() !== '' && registro.respuesta.trim().toLowerCase() !== 'null');
    if (tieneRespuesta) {
      const respuesta = document.createElement('div');
      respuesta.style.cssText = 'font-weight:500; color:#f3f4f6;';
      const iconoResp = document.createElement('i');
      iconoResp.className = 'fas fa-comment-dots';
      iconoResp.style.cssText = 'color:#3b82f6; margin-right:5px;';
      respuesta.append(iconoResp, registro.respuesta);

      const inicial = document.createElement('div');
      inicial.style.cssText = 'font-size:0.75rem; color:#9ca3af; margin-top:4px;';
      const rotulo = document.createElement('strong');
      rotulo.textContent = 'Reporte inicial:';
      inicial.append(rotulo, ` ${registro.descripcion || ''}`);
      tdDesc.append(respuesta, inicial);
    } else {
      tdDesc.textContent = registro.descripcion || 'Sin descripción';
    }

    celda().append(crearBadge(ESTADOS[estado] ?? ESTADOS.PENDIENTE));

    // Estado de pago + monto
    const tdPago = celda();
    tdPago.append(crearBadge(PAGOS[registro.estado_pago] ?? PAGOS.pendiente));
    const monto = document.createElement('span');
    monto.className = 'monto-celda';
    monto.textContent = formatearSoles(Number(registro.monto_calculado));
    tdPago.append(monto);

    // Acciones: editar (si corresponde) y pagar / ver comprobante
    const tdAcc = celda();
    const contenedor = document.createElement('div');
    contenedor.className = 'acciones-celda';
    if (estado === 'ATENDIDO') {
      contenedor.append(crearBotonBloqueado('Caso Cerrado', 'El caso ya fue atendido y no se puede modificar'));
    } else if (registro.estado_pago === 'pagado') {
      contenedor.append(crearBotonBloqueado('Pagado', 'La solicitud ya fue pagada y no se puede modificar'));
    } else {
      contenedor.append(crearBotonEditar(registro));
    }
    const accionPago = crearAccionDePago(registro);
    if (accionPago) contenedor.append(accionPago);
    tdAcc.append(contenedor);

    tbody.append(tr);
  }
}

function configurarModal() {
  const modal = document.getElementById('modalEditar');
  const formEditar = document.getElementById('formEditar');
  const btnCerrarModal = document.getElementById('btnCerrarModal');
  const btnCancelarEdicion = document.getElementById('btnCancelarEdicion');

  const cerrarModal = () => {
    if (modal) modal.classList.remove('active');
  };

  if (btnCerrarModal) btnCerrarModal.addEventListener('click', cerrarModal);
  if (btnCancelarEdicion) btnCancelarEdicion.addEventListener('click', cerrarModal);

  // Cotización en vivo dentro del modal
  document.getElementById('editHoras')?.addEventListener('input', actualizarCotizacionModal);
  document.getElementById('editEfectivos')?.addEventListener('input', actualizarCotizacionModal);

  if (formEditar) {
    formEditar.addEventListener('submit', async (e) => {
      e.preventDefault();

      const codigo = document.getElementById('editCodigo').value;
      const nuevaDescripcion = document.getElementById('editDescripcion').value.trim();
      const horas = Number(document.getElementById('editHoras').value);
      const efectivos = Number(document.getElementById('editEfectivos').value);

      if (!Number.isInteger(horas) || horas < 0 || horas > 24 || !Number.isInteger(efectivos) || efectivos < 0 || efectivos > 20) {
        mostrarAlertaModal({ titulo: 'Datos inválidos', mensaje: 'Las horas deben estar entre 0 y 24 y los efectivos adicionales entre 0 y 20 (números enteros).' });
        return;
      }

      // El monto se recalcula al guardar: no se confía en la pantalla
      const monto = calcularMontoServicio({ horas_resguardo: horas, efectivos_adicionales: efectivos });
      const estadoPago = estadoPagoInicial(monto);
      const btnGuardar = formEditar.querySelector('button[type="submit"]');

      let textoOriginal = '';
      if (btnGuardar) {
        textoOriginal = btnGuardar.innerHTML;
        btnGuardar.textContent = 'Guardando...';
        btnGuardar.disabled = true;
      }

      try {
        // La condición del WHERE impide editar casos atendidos, ya pagados o de otro ciudadano
        const filas = await sql`
          UPDATE incidencias
          SET sustento = ${nuevaDescripcion},
              horas_resguardo = ${horas},
              efectivos_adicionales = ${efectivos},
              monto_calculado = ${monto},
              estado_pago = ${estadoPago}
          WHERE codigo = ${codigo}
            AND (usuario_id = ${usuarioSesion.id} OR usuario_id IS NULL)
            AND estado <> 'ATENDIDO'
            AND estado_pago <> 'pagado'
          RETURNING id;
        `;

        cerrarModal();
        if (filas.length === 0) {
          mostrarAlertaModal({ titulo: 'No se pudo actualizar', mensaje: 'El reporte no existe, ya fue atendido o ya fue pagado.' });
        } else {
          await cargarDatosDelUsuario();
          mostrarAlertaModal({
            titulo: 'Reporte Actualizado',
            mensaje: `Los detalles de la alerta ${codigo} se actualizaron. Nuevo monto: ${formatearSoles(monto)}.`
          });
        }
      } catch (error) {
        console.error('Error al guardar en Neon:', error);
        mostrarAlertaModal({ titulo: 'Error', mensaje: 'Hubo un problema al guardar los cambios en la base de datos.' });
      } finally {
        if (btnGuardar) {
          btnGuardar.innerHTML = textoOriginal;
          btnGuardar.disabled = false;
        }
      }
    });
  }
}
