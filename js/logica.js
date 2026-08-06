// Hogandia — funciones puras extraídas de app.js para poder testearlas con
// `node --test` (ver tests/logica.test.mjs) sin necesitar un DOM ni Supabase.
// Patrón UMD simple: en Node se exportan como módulo; en el navegador quedan
// como globales (mismo nombre que tenían antes en app.js, así los call sites
// existentes no cambian).

function avg(resenas){
  if(!resenas || !resenas.length) return null;
  return (resenas.reduce((a, r) => a + r.estrellas, 0) / resenas.length).toFixed(1);
}

function diaSemanaDeFecha(dateObj){
  const map = ['D', 'L', 'M', 'X', 'J', 'V', 'S']; // Date.getDay(): 0=domingo
  return map[dateObj.getDay()];
}

// Aproximación del monto de una cita: tarifa base del trabajador + recargo
// por urgencia si aplica. No hay un precio por servicio guardado en ningún
// lado (ver comentario en simularPago, js/app.js).
function calcularMonto(worker, esUrgente){
  if(!worker) return null;
  return worker.tarifa + (esUrgente ? (worker.tarifa_urgente || 0) : 0);
}

// Horas que un trabajador tiene abiertas un día de la semana dado ('L','M',...).
function horasDisponiblesDia(disponibilidad, dia){
  return (disponibilidad && disponibilidad[dia]) || [];
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { avg, diaSemanaDeFecha, calcularMonto, horasDisponiblesDia };
} else {
  window.avg = avg;
  window.diaSemanaDeFecha = diaSemanaDeFecha;
  window.calcularMonto = calcularMonto;
  window.horasDisponiblesDia = horasDisponiblesDia;
}
