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

// Insignias de desempeño calculadas solo con datos que ya existen (reseñas),
// sin necesitar tracking nuevo (ej. tiempo de respuesta no se mide todavía).
// "Top calificado" y "Recomendado" son excluyentes (la primera implica la
// segunda); "Muy solicitado" es independiente y se puede combinar con cualquiera.
function insigniasTrabajador(resenas){
  const n = (resenas || []).length;
  const prom = n ? Number(avg(resenas)) : null;
  const insignias = [];
  if(prom !== null && prom >= 4.8 && n >= 5) insignias.push({icono:'🏆', texto:'Top calificado'});
  else if(prom !== null && prom >= 4.5 && n >= 3) insignias.push({icono:'⭐', texto:'Recomendado'});
  if(n >= 10) insignias.push({icono:'🔥', texto:'Muy solicitado'});
  return insignias;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { avg, diaSemanaDeFecha, calcularMonto, horasDisponiblesDia, insigniasTrabajador };
} else {
  window.avg = avg;
  window.diaSemanaDeFecha = diaSemanaDeFecha;
  window.calcularMonto = calcularMonto;
  window.horasDisponiblesDia = horasDisponiblesDia;
  window.insigniasTrabajador = insigniasTrabajador;
}
