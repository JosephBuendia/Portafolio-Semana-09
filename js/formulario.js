// js/formulario.js
import { 
  obtenerUsuarioActual,
  mostrarAlertaModal, 
  actualizarNavegacion,
  abrirModalAuth,
  vincularModalAuth
} from "./auth.js";
import { sql } from "./neon-config.js";
import { calcularMontoServicio, estadoPagoInicial, formatearSoles } from "./tarifario.js";

// 1. RESTRICCIONES DE ENTRADA EN TIEMPO REAL
function aplicarRestriccionesInputs() {
  const dniInput = document.getElementById("dni-num");
  const phoneInput = document.getElementById("telefono-num");

  if (dniInput) {
    const filtrarDNI = (e) => {
      e.target.value = e.target.value.replace(/\D/g, "").slice(0, 8);
    };
    dniInput.addEventListener("input", filtrarDNI);
    dniInput.addEventListener("paste", (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData("text");
      dniInput.value = text.replace(/\D/g, "").slice(0, 8);
    });
  }

  if (phoneInput) {
    phoneInput.addEventListener("input", (e) => {
      let val = e.target.value.replace(/\D/g, "");
      if (val.length > 0 && val.charAt(0) !== "9") {
        val = "9" + val.slice(0, 8);
      }
      e.target.value = val.slice(0, 9);
    });

    phoneInput.addEventListener("paste", (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData("text");
      let digits = text.replace(/\D/g, "");
      if (digits.length > 0 && digits.charAt(0) !== "9") {
        digits = "9" + digits;
      }
      phoneInput.value = digits.slice(0, 9);
    });
  }
}

// 2. ENFOQUE AUTOMÁTICO Y DESPLAZAMIENTO AL CAMPO ERANEO
function enfocarCampoConError(inputElement) {
  if (!inputElement) return;

  inputElement.scrollIntoView({ behavior: "smooth", block: "center" });
  inputElement.classList.add("input-error");

  setTimeout(() => {
    inputElement.focus();
  }, 300);

  const limpiarError = () => {
    inputElement.classList.remove("input-error");
    inputElement.removeEventListener("input", limpiarError);
    inputElement.removeEventListener("change", limpiarError);
  };
  inputElement.addEventListener("input", limpiarError);
  inputElement.addEventListener("change", limpiarError);
}

// 2.1 COTIZADOR EN VIVO (Semana 9): recalcula el monto en cada evento input / change
const leerFormulario = (form) => Object.fromEntries(new FormData(form));

function iniciarCotizador(form) {
  const salidaMonto = document.getElementById("monto-estimado");
  const textoBoton = document.getElementById("texto-boton-reporte");
  const nota = document.getElementById("nota-cotizacion");
  if (!salidaMonto) return;

  const actualizar = () => {
    const monto = calcularMontoServicio(leerFormulario(form));
    salidaMonto.textContent = formatearSoles(monto);
    if (textoBoton) textoBoton.textContent = monto === 0 ? "Enviar alerta" : "Registrar y pagar";
    if (nota && monto === 0) {
      nota.textContent = "Alerta de auxilio: no tiene costo y no pasa por la pasarela de pagos.";
    } else if (nota) {
      nota.textContent = "Tarifa: S/ 50.00 por hora + S/ 20.00 por cada efectivo adicional. Una alerta real (0 horas) nunca se cobra.";
    }
  };

  form.addEventListener("input", actualizar);   // números y texto, en cada tecla
  form.addEventListener("change", actualizar);  // select, radio y checkbox
  actualizar();
}

// 3. CONTROL DEL FORMULARIO Y VALIDACIONES
function inicializarFormulario() {
  const form = document.getElementById("incident-report-form");
  if (!form) return;

  iniciarCotizador(form);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const usuario = obtenerUsuarioActual();
    if (!usuario) {
      abrirModalAuth("login");
      return;
    }
    if (usuario.rol !== "cliente") {
      mostrarAlertaModal({
        titulo: "Solo ciudadanos",
        mensaje: "Los reportes y pagos los registra el ciudadano con su cuenta de vecino. El personal gestiona los casos desde su panel."
      });
      return;
    }

    const nombreInput = document.getElementById("nombre-completo");
    const dniInput = document.getElementById("dni-num");
    const telefonoInput = document.getElementById("telefono-num");
    const tipoSelect = document.getElementById("tipo-incidente");
    const direccionInput = document.getElementById("direccion-exacta");
    const descripcionInput = document.getElementById("descripcion-incidente");

    if (!nombreInput.value.trim()) {
      mostrarAlertaModal({
        titulo: "Campo Obligatorio",
        mensaje: "Por favor ingresa tu nombre completo para procesar el reporte."
      });
      enfocarCampoConError(nombreInput);
      return;
    }

    const dniVal = dniInput.value.trim();
    if (dniVal.length > 0 && dniVal.length !== 8) {
      mostrarAlertaModal({
        titulo: "DNI Inválido",
        mensaje: "El número de DNI debe contener exactamente 8 dígitos numéricos."
      });
      enfocarCampoConError(dniInput);
      return;
    }

    const telVal = telefonoInput.value.trim();
    if (!telVal || telVal.length !== 9 || !telVal.startsWith("9")) {
      mostrarAlertaModal({
        titulo: "Teléfono Inválido",
        mensaje: "El teléfono es obligatorio, debe iniciar obligatoriamente con el número 9 y contener 9 dígitos."
      });
      enfocarCampoConError(telefonoInput);
      return;
    }

    if (!tipoSelect.value) {
      mostrarAlertaModal({
        titulo: "Selección Requerida",
        mensaje: "Por favor selecciona el tipo de incidente que deseas reportar."
      });
      enfocarCampoConError(tipoSelect);
      return;
    }

    if (!direccionInput.value.trim()) {
      mostrarAlertaModal({
        titulo: "Ubicación Requerida",
        mensaje: "Ingresa la dirección o una referencia exacta del suceso."
      });
      enfocarCampoConError(direccionInput);
      return;
    }

    if (!descripcionInput.value.trim()) {
      mostrarAlertaModal({
        titulo: "Descripción Requerida",
        mensaje: "Por favor describe brevemente lo ocurrido para orientar al personal de Serenazgo."
      });
      enfocarCampoConError(descripcionInput);
      return;
    }

    const horasInput = document.getElementById("horas-resguardo");
    const efectivosInput = document.getElementById("efectivos-adicionales");
    const horas = Number(horasInput.value);
    const efectivos = Number(efectivosInput.value);

    if (!Number.isInteger(horas) || horas < 0 || horas > 24) {
      mostrarAlertaModal({ titulo: "Horas inválidas", mensaje: "Las horas de resguardo deben ser un número entero entre 0 y 24." });
      enfocarCampoConError(horasInput);
      return;
    }
    if (!Number.isInteger(efectivos) || efectivos < 0 || efectivos > 20) {
      mostrarAlertaModal({ titulo: "Efectivos inválidos", mensaje: "Los efectivos adicionales deben ser un número entero entre 0 y 20." });
      enfocarCampoConError(efectivosInput);
      return;
    }

    // El monto se recalcula al guardar: no se confía en lo que muestra la pantalla
    const datos = leerFormulario(form);
    const monto = calcularMontoServicio(datos);
    const estadoPago = estadoPagoInicial(monto);
    const codigo = `INC-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
    const zona = document.getElementById("zona-patrullaje").value;
    const urgencia = form.querySelector('input[name="urgencia"]:checked')?.value || "Alta";
    const botonEnviar = document.getElementById("btn-submit-report");
    botonEnviar.disabled = true;                // evita el doble clic = doble registro

    try {
      const filas = await sql`
        INSERT INTO incidencias (
          codigo, cliente, dni, suministro_zona, tipo_incidencia, unidad, estado, sustento, respuesta,
          fecha_registro, usuario_id, telefono, urgencia,
          horas_resguardo, efectivos_adicionales, monto_calculado, estado_pago
        ) VALUES (
          ${codigo}, ${nombreInput.value.trim()}, ${dniVal || null},
          ${direccionInput.value.trim() + " - " + zona}, ${tipoSelect.value}, 'Móvil-01', 'PENDIENTE',
          ${descripcionInput.value.trim()}, 'Alerta recepcionada por la central.',
          NOW(), ${usuario.id}, ${telVal}, ${urgencia},
          ${horas}, ${efectivos}, ${monto}, ${estadoPago}
        )
        RETURNING id;
      `;

      // Si el vecino informó su DNI y su cuenta aún no lo tiene, se guarda para que caja lo encuentre
      if (dniVal) {
        try {
          await sql`UPDATE usuarios SET dni = ${dniVal} WHERE id = ${usuario.id} AND dni IS NULL;`;
        } catch (errorDni) {
          console.warn("No se pudo guardar el DNI en la cuenta:", errorDni);
        }
      }

      if (estadoPago === "pendiente") {
        mostrarAlertaModal({
          titulo: "Reporte registrado",
          mensaje: `El reporte ${codigo} quedó pendiente de pago (${formatearSoles(monto)}). Te llevamos a la pasarela.`,
          redirigirA: `pago.html?id=${filas[0].id}`
        });
      } else {
        mostrarAlertaModal({
          titulo: "¡Alerta registrada!",
          mensaje: `La alerta ${codigo} fue enviada a la Central de Serenazgo. Es una alerta de auxilio: no tiene costo.`,
          redirigirA: "actualizar.html"
        });
      }
    } catch (error) {
      console.error(error);
      mostrarAlertaModal({
        titulo: "No se pudo registrar",
        mensaje: "Hubo un problema al guardar el reporte en la base de datos. Intenta nuevamente."
      });
      botonEnviar.disabled = false;
    }
  });
}

// INICIALIZACIÓN
document.addEventListener("DOMContentLoaded", () => {
  vincularModalAuth();
  actualizarNavegacion();
  aplicarRestriccionesInputs();
  inicializarFormulario();

  const usuarioActivo = obtenerUsuarioActual();
  if (usuarioActivo && usuarioActivo.nombre) {
    const nombreInput = document.getElementById("nombre-completo");
    if (nombreInput) nombreInput.value = usuarioActivo.nombre;
  }
});