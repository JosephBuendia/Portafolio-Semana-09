// js/panel.js
import { API } from './api.js';
import { exigirRol, actualizarNavegacion, mostrarAlertaModal, evaluarTurnoEmpleado } from './auth.js';
import { calcularMontoServicio, formatearSoles } from './tarifario.js';

let todasLasIncidencias = [];
let incidenciaSeleccionada = null;
let usuarioSesion = null;
let puedeEditar = true;

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Solo administrador y empleado entran al panel (el cajero va a caja.html, el cliente a sus registros)
  usuarioSesion = exigirRol('administrador', 'empleado');
  if (!usuarioSesion) return;

  actualizarNavegacion();

  // 2. Evaluar turno operativo si es un empleado
  const statusBanner = document.getElementById('statusBanner');
  if (usuarioSesion.rol === 'empleado') {
    const evaluacion = evaluarTurnoEmpleado(usuarioSesion.turno);
    puedeEditar = evaluacion.enTurno;

    if (statusBanner) {
      if (evaluacion.enTurno) {
        statusBanner.className = 'status-banner success';
        statusBanner.innerHTML = `<i class="fas fa-check-circle"></i> <span><strong>En Turno Activo (${evaluacion.nombreTurno}):</strong> Tienes permisos para registrar, modificar y atender incidencias.</span>`;
      } else {
        statusBanner.className = 'status-banner warning';
        statusBanner.innerHTML = `<i class="fas fa-exclamation-triangle"></i> <span><strong>Fuera de Turno (${evaluacion.nombreTurno}):</strong> Tu acceso es únicamente de LECTURA. No puedes registrar ni modificar datos.</span>`;
      }
    }
  } else if (statusBanner) {
    statusBanner.className = 'status-banner success';
    statusBanner.innerHTML = `<i class="fas fa-user-shield"></i> <span><strong>Acceso Administrador (24/7):</strong> Control total sobre el sistema operativo.</span>`;
  }

  // 3. Cargar las 30 incidencias iniciales
  await cargarTablaIncidencias();

  // 4. Búsqueda instantánea mientras se digita
  const inputBuscar = document.getElementById('inputBuscar');
  const selectEstado = document.getElementById('selectEstado');

  if (inputBuscar) {
    inputBuscar.addEventListener('input', aplicarFiltros);
  }

  if (selectEstado) {
    selectEstado.addEventListener('change', aplicarFiltros);
  }

  // 5. Botón Actualizar (Recarga los datos de la BD o Mock)
  const btnActualizar = document.getElementById('btnActualizar');
  if (btnActualizar) {
    btnActualizar.addEventListener('click', async () => {
      btnActualizar.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Cargando...`;
      await cargarTablaIncidencias();
      btnActualizar.innerHTML = `<i class="fas fa-sync-alt"></i> Actualizar`;
    });
  }

  // 6. Botón Limpiar Filtros
  const btnLimpiar = document.getElementById('btnLimpiarFiltros');
  if (btnLimpiar) {
    btnLimpiar.addEventListener('click', () => {
      inputBuscar.value = '';
      selectEstado.value = 'TODOS';
      aplicarFiltros();
    });
  }

  // 7. Modal Registrar Nueva Alerta
  const btnNuevaAlerta = document.getElementById('btnNuevaAlerta');
  const modalNuevaAlerta = document.getElementById('modalNuevaAlerta');
  const btnCerrarModalNueva = document.getElementById('btnCerrarModalNueva');
  const btnCancelarNueva = document.getElementById('btnCancelarNueva');
  const formNuevaAlerta = document.getElementById('formNuevaAlerta');

  if (btnNuevaAlerta) {
    btnNuevaAlerta.addEventListener('click', () => {
      if (!puedeEditar) {
        mostrarAlertaModal({ titulo: 'Acceso Restringido', mensaje: 'No estás en tu turno asignado para registrar nuevas alertas.' });
        return;
      }
      formNuevaAlerta.reset();
      modalNuevaAlerta.classList.add('active');
    });
  }

  const actualizarMontoNuevo = () => {
    const monto = calcularMontoServicio({
      horas_resguardo: document.getElementById('nuevaHoras').value,
      efectivos_adicionales: document.getElementById('nuevosEfectivos').value
    });
    document.getElementById('nuevoMonto').textContent = monto === 0 ? 'Sin costo (alerta)' : formatearSoles(monto);
  };
  document.getElementById('nuevaHoras')?.addEventListener('input', actualizarMontoNuevo);
  document.getElementById('nuevosEfectivos')?.addEventListener('input', actualizarMontoNuevo);
  btnNuevaAlerta?.addEventListener('click', actualizarMontoNuevo);

  const cerrarModalNueva = () => modalNuevaAlerta.classList.remove('active');
  if (btnCerrarModalNueva) btnCerrarModalNueva.addEventListener('click', cerrarModalNueva);
  if (btnCancelarNueva) btnCancelarNueva.addEventListener('click', cerrarModalNueva);

  if (formNuevaAlerta) {
    formNuevaAlerta.addEventListener('submit', async (e) => {
      e.preventDefault();

      if (!puedeEditar) {
        mostrarAlertaModal({ titulo: 'Acceso Restringido', mensaje: 'Operación no permitida fuera de tu turno.' });
        return;
      }
      
      const dni = document.getElementById('nuevoDni').value.trim();
      const nombre = document.getElementById('nuevoNombre').value.trim();
      const ubicacion = document.getElementById('nuevaUbicacion').value.trim();
      const tipo = document.getElementById('nuevoTipo').value;
      const sustento = document.getElementById('nuevoSustento').value.trim();

      if (!/^\d{8}$/.test(dni)) {
        mostrarAlertaModal({ titulo: 'Validación', mensaje: 'El DNI debe contener exactamente 8 dígitos numéricos.' });
        return;
      }

      const horas = Number(document.getElementById('nuevaHoras').value);
      const efectivos = Number(document.getElementById('nuevosEfectivos').value);
      if (!Number.isInteger(horas) || horas < 0 || horas > 24 || !Number.isInteger(efectivos) || efectivos < 0 || efectivos > 20) {
        mostrarAlertaModal({ titulo: 'Validación', mensaje: 'Las horas deben estar entre 0 y 24 y los efectivos adicionales entre 0 y 20 (números enteros).' });
        return;
      }

      const nuevoCodigo = `INC-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
      
      const payload = {
        codigo: nuevoCodigo,
        cliente: nombre,
        dni: dni,
        suministro_zona: ubicacion,
        tipo_incidencia: tipo,
        sustento: sustento,
        horas_resguardo: horas,
        efectivos_adicionales: efectivos
      };

      const res = await API.crearIncidencia(payload);
      if (res.exito) {
        cerrarModalNueva();
        const detallePago = res.estadoPago === 'exonerado'
          ? 'Es una alerta de auxilio: no tiene costo.'
          : `Monto a cobrar en caja: ${formatearSoles(res.monto)} (busque el código ${nuevoCodigo}).`;
        mostrarAlertaModal({ titulo: 'Registro Exitoso', mensaje: `Se registró correctamente la alerta ${nuevoCodigo}. ${detallePago}` });
        await cargarTablaIncidencias();
      } else {
        mostrarAlertaModal({ titulo: 'Error', mensaje: 'No se pudo registrar la alerta en el sistema.' });
      }
    });
  }

  // 8. Modal Dictamen / Atender Incidencia
  const modalDictamen = document.getElementById('modalDictamen');
  const btnCerrarModalDictamen = document.getElementById('btnCerrarModalDictamen');
  if (btnCerrarModalDictamen) {
    btnCerrarModalDictamen.addEventListener('click', () => modalDictamen.classList.remove('active'));
  }

  document.getElementById('btnDictamenProceso')?.addEventListener('click', () => procesarDictamen('EN PROCESO'));
  document.getElementById('btnDictamenRechazar')?.addEventListener('click', () => procesarDictamen('RECHAZADO'));
  document.getElementById('btnDictamenAtender')?.addEventListener('click', () => procesarDictamen('ATENDIDO'));
});

// Cargar y pintar tabla
async function cargarTablaIncidencias() {
  todasLasIncidencias = await API.obtenerIncidencias();
  aplicarFiltros();
}

// Búsqueda en tiempo real
function aplicarFiltros() {
  const texto = document.getElementById('inputBuscar').value.toLowerCase().trim();
  const estado = document.getElementById('selectEstado').value;

  const filtradas = todasLasIncidencias.filter(item => {
    const cumpleTexto = (
      (item.codigo && item.codigo.toLowerCase().includes(texto)) ||
      (item.cliente && item.cliente.toLowerCase().includes(texto)) ||
      (item.dni && item.dni.includes(texto)) ||
      (item.suministro_zona && item.suministro_zona.toLowerCase().includes(texto)) ||
      (item.tipo_incidencia && item.tipo_incidencia.toLowerCase().includes(texto))
    );

    const cumpleEstado = (estado === 'TODOS' || item.estado.toUpperCase() === estado.toUpperCase());

    return cumpleTexto && cumpleEstado;
  });

  renderizarTabla(filtradas);
  actualizarMetricas(todasLasIncidencias);
  document.getElementById('contadorRegistros').textContent = `${filtradas.length} Registros`;
}

const PAGO_TEXTO = { pendiente: 'Por pagar', pagado: 'Pagado', exonerado: 'Exonerado' };
const CANAL_TEXTO = { pasarela: 'En línea', caja: 'Ventanilla' };

function crearBotonAccion(clases, titulo, icono, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = clases;
  b.title = titulo;
  if (!puedeEditar) {
    b.disabled = true;
    b.style.cssText = 'opacity:0.4; cursor:not-allowed;';
  }
  const i = document.createElement('i');
  i.className = `fas ${icono}`;
  b.append(i);
  b.setAttribute('aria-label', titulo);
  b.addEventListener('click', onClick);
  return b;
}

function renderizarTabla(lista) {
  const tbody = document.getElementById('tablaIncidenciasBody');
  tbody.replaceChildren();

  if (lista.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 11;
    td.textContent = 'No se encontraron registros de incidencias.';
    td.style.cssText = 'text-align:center; padding:20px; color:#94a3b8;';
    tr.append(td);
    tbody.append(tr);
    return;
  }

  lista.forEach(item => {
    const tr = document.createElement('tr');
    const celda = (texto = '', clase = '') => {
      const td = document.createElement('td');
      if (clase) td.className = clase;
      td.textContent = texto;
      tr.append(td);
      return td;
    };

    let badgeClass = 'pendiente';
    const est = item.estado ? item.estado.toUpperCase() : 'PENDIENTE';
    if (est === 'EN PROCESO') badgeClass = 'en-proceso';
    if (est === 'ATENDIDO') badgeClass = 'atendido';
    if (est === 'RECHAZADO') badgeClass = 'rechazado';

    celda(item.codigo, 'highlight-code');
    celda(item.fecha_registro || '---');
    celda(item.cliente || 'Anónimo').style.fontWeight = '700';
    celda(item.dni || '---');
    celda(item.suministro_zona || '---');
    celda(item.tipo_incidencia || 'Gobernanza');

    const tdUnidad = celda(item.unidad || 'Móvil-01');
    tdUnidad.style.color = '#38bdf8';

    const tdEstado = celda();
    const badge = document.createElement('span');
    badge.className = `badge-estado ${badgeClass}`;
    badge.textContent = est;
    tdEstado.append(badge);

    // Semana 9: monto y estado financiero (solo lectura: los pagos nacen en la pasarela o en caja)
    celda(item.monto_calculado != null ? formatearSoles(Number(item.monto_calculado)) : '—', 'monto-fila');
    const tdPago = celda();
    const estadoPago = item.estado_pago || 'pendiente';
    const badgePago = document.createElement('span');
    badgePago.className = `badge-pago ${estadoPago}`;
    badgePago.textContent = PAGO_TEXTO[estadoPago] ?? estadoPago;
    tdPago.append(badgePago);
    if (estadoPago === 'pagado' && item.canal_pago) {
      const canal = document.createElement('small');
      canal.className = 'canal-pago';
      canal.textContent = CANAL_TEXTO[item.canal_pago] ?? item.canal_pago;
      tdPago.append(canal);
    }

    const tdAcc = celda();
    tdAcc.append(
      crearBotonAccion('action-btn btn-atender-row', 'Gestionar / Atender', 'fa-edit', () => {
        if (!puedeEditar) {
          mostrarAlertaModal({ titulo: 'Acceso Restringido', mensaje: 'No estás en tu turno asignado para modificar registros.' });
          return;
        }
        abrirModalDictamen(item);
      }),
      ' ',
      crearBotonAccion('action-btn delete-btn btn-eliminar-row', 'Eliminar', 'fa-trash-alt', () => {
        if (!puedeEditar) {
          mostrarAlertaModal({ titulo: 'Acceso Restringido', mensaje: 'No estás en tu turno asignado para eliminar registros.' });
          return;
        }
        mostrarAlertaModal({
          titulo: 'Confirmar Eliminación',
          mensaje: `¿Estás seguro de eliminar permanentemente la incidencia ${item.codigo}?`,
          textoBoton: 'Sí, Eliminar',
          esConfirmacion: true,
          onConfirm: async () => {
            const res = await API.eliminarIncidencia(item.codigo);
            if (!res.exito) {
              // Una incidencia con historial de pagos no se elimina (llave foránea)
              mostrarAlertaModal({ titulo: 'No se puede eliminar', mensaje: res.mensaje });
              return;
            }
            await cargarTablaIncidencias();
          }
        });
      })
    );

    tbody.appendChild(tr);
  });
}

function actualizarMetricas(lista) {
  document.getElementById('cntTotal').textContent = lista.length;
  document.getElementById('cntPendientes').textContent = lista.filter(i => i.estado === 'PENDIENTE').length;
  document.getElementById('cntEnProceso').textContent = lista.filter(i => i.estado === 'EN PROCESO').length;
  document.getElementById('cntAtendidos').textContent = lista.filter(i => i.estado === 'ATENDIDO').length;
  document.getElementById('cntRechazados').textContent = lista.filter(i => i.estado === 'RECHAZADO').length;
}

function abrirModalDictamen(item) {
  incidenciaSeleccionada = item;
  document.getElementById('mCodigo').textContent = item.codigo;
  document.getElementById('mFecha').textContent = item.fecha_registro || '---';
  document.getElementById('mCliente').textContent = item.cliente || 'Anónimo';
  document.getElementById('mDni').textContent = item.dni || '---';
  document.getElementById('mSuministro').textContent = item.suministro_zona || '---';
  document.getElementById('mSustento').value = item.sustento || '';
  document.getElementById('mRespuesta').value = item.respuesta || '';

  const badge = document.getElementById('mEstadoBadge');
  badge.textContent = item.estado;
  badge.className = `badge-estado ${item.estado.toLowerCase().replace(/\s+/g, '-')}`;

  document.getElementById('modalDictamen').classList.add('active');
}

async function procesarDictamen(nuevoEstado) {
  if (!incidenciaSeleccionada || !puedeEditar) return;

  const respuesta = document.getElementById('mRespuesta').value.trim();
  if (!respuesta) {
    mostrarAlertaModal({ titulo: 'Campo Requerido', mensaje: 'Por favor, ingrese una respuesta u observación de la central.' });
    return;
  }

  const res = await API.actualizarEstadoIncidencia(incidenciaSeleccionada.codigo, nuevoEstado, respuesta);
  if (res.exito) {
    document.getElementById('modalDictamen').classList.remove('active');
    mostrarAlertaModal({ titulo: 'Actualización Exitosa', mensaje: `El estado de ${incidenciaSeleccionada.codigo} cambió a ${nuevoEstado}.` });
    await cargarTablaIncidencias();
  } else {
    mostrarAlertaModal({ titulo: 'Error', mensaje: 'No se pudo actualizar el estado de la incidencia.' });
  }
}