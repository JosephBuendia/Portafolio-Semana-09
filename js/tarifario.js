// js/tarifario.js
// Regla de negocio del caso 6 (Serenazgo): tasa de resguardo en eventos privados.
// Funciones PURAS: reciben datos y devuelven valores. No tocan el DOM ni la base de datos,
// por eso se pueden probar en la consola:
//   calcularMontoServicio({ horas_resguardo: '4', efectivos_adicionales: '2' })  // 240
//   calcularMontoServicio({ horas_resguardo: '0' })                              // 0 (alerta)

export function redondear(valor) {
  return Math.round(valor * 100) / 100;
}

export function formatearSoles(monto) {
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(monto);
}

// Un checkbox marcado llega en FormData como 'on'; si no está marcado, NO llega
export const marcado = (valor) => valor === 'on';

// S/ 50.00 por hora + S/ 20.00 por cada efectivo adicional.
// Una alerta de auxilio real nunca se cobra: si horas_resguardo = 0 el monto es 0 (exonerado).
export const TARIFA_HORA = 50.00;
export const TARIFA_EFECTIVO_ADICIONAL = 20.00;

export function calcularMontoServicio(d) {
  const horas = Math.max(0, Math.trunc(Number(d.horas_resguardo) || 0));
  if (horas === 0) return 0;                                   // alerta de auxilio: gratuita
  const efectivos = Math.max(0, Math.trunc(Number(d.efectivos_adicionales) || 0));
  return redondear(TARIFA_HORA * horas + TARIFA_EFECTIVO_ADICIONAL * efectivos);
}

// Estado financiero inicial según el monto
export const estadoPagoInicial = (monto) => (monto === 0 ? 'exonerado' : 'pendiente');
