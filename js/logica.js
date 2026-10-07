// Hogandia — funciones puras extraídas de app.js para poder testearlas con
// `node --test` (ver tests/logica.test.mjs) sin necesitar un DOM ni Supabase.
// Patrón UMD simple: en Node se exportan como módulo; en el navegador quedan
// como globales (mismo nombre que tenían antes en app.js, así los call sites
// existentes no cambian).

/* ---------------- CALIFICACIONES E INSIGNIAS ---------------- */

function avg(resenas){
  if(!resenas || !resenas.length) return null;
  return (resenas.reduce((a, r) => a + r.estrellas, 0) / resenas.length).toFixed(1);
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

/* ---------------- FECHAS Y DISPONIBILIDAD ---------------- */

const MESES_LOGICA = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

function diaSemanaDeFecha(dateObj){
  const map = ['D', 'L', 'M', 'X', 'J', 'V', 'S']; // Date.getDay(): 0=domingo
  return map[dateObj.getDay()];
}

// Horas que un trabajador tiene abiertas un día de la semana dado ('L','M',...).
function horasDisponiblesDia(disponibilidad, dia){
  return (disponibilidad && disponibilidad[dia]) || [];
}

// La fecha de una cita se guarda como texto en español (ej. "15 de agosto" o
// "15 de agosto de 2027"). El año se omite cuando es el año en curso, así que
// se puede pasar un respaldo (normalmente created_at de la cita) para no
// depender del reloj del navegador: si alguien abre en enero una cita creada
// en diciembre, el año correcto es el de la cita, no el de hoy.
function parseFechaHoraCita(fecha, hora, anioRespaldo){
  const m = (fecha||'').match(/^(\d+) de (\w+)(?: de (\d+))?$/i);
  if(!m) return null;
  const dia = Number(m[1]);
  const mes = MESES_LOGICA.indexOf(m[2].toLowerCase());
  if(mes<0) return null;
  let anio;
  if(m[3]) anio = Number(m[3]);
  else if(anioRespaldo) anio = new Date(anioRespaldo).getFullYear();
  else anio = new Date().getFullYear();
  if(!Number.isFinite(anio)) anio = new Date().getFullYear();
  const hm = (hora||'').match(/^(\d+):(\d+)\s*(am|pm)$/i);
  if(!hm) return null;
  const hora12 = Number(hm[1]);
  const minutos = Number(hm[2]);
  // En formato 12h la hora válida es 1..12 (el 12 es el caso especial: 12 am =
  // medianoche, 12 pm = mediodía).
  if(hora12 < 1 || hora12 > 12 || minutos > 59) return null;
  let h = hora12 % 12;
  if(/pm/i.test(hm[3])) h += 12;
  const d = new Date(anio, mes, dia, h, minutos);
  // Rechaza fechas y horas que "ruedan" (ej. 31 de febrero -> 2 de marzo, o
  // 25:00 pm -> 1:00 pm del día siguiente): mejor null que un evento de
  // calendario en el día o la hora equivocados.
  if(d.getFullYear()!==anio || d.getMonth()!==mes || d.getDate()!==dia) return null;
  if(d.getHours()!==h || d.getMinutes()!==minutos) return null;
  return d;
}

// Texto de fecha tal como se guarda en la columna `citas.fecha`, incluyendo el
// año solo cuando no es el año en curso (mismo formato de siempre).
function formatearFechaCita(fecha, incluirAnio){
  const anioSufijo = incluirAnio ? ` de ${fecha.getFullYear()}` : '';
  return `${fecha.getDate()} de ${MESES_LOGICA[fecha.getMonth()]}${anioSufijo}`;
}

// Celdas de un mes de calendario para el agendamiento. Función pura: no toca
// el DOM y no lee el reloj internamente (recibe `hoy`), así que se puede
// testear. Marca tres estados:
//   muted  -> día de otro mes (relleno) o ya pasado: no se puede elegir
//   closed -> el trabajador no atiende ese día de la semana: no se puede elegir
//   open   -> elegible
// Si `disponibilidad` es null/undefined no se cierra ningún día: significa que
// todavía no se consultó el horario del trabajador (mientras se consulta, es
// mejor dejar el calendario utilizable que bloquearlo entero).
function calendarioMes(anio, mes, hoy, disponibilidad){
  const primerDia = new Date(anio, mes, 1);
  const diasEnMes = new Date(anio, mes + 1, 0).getDate();
  const esMesActual = hoy && primerDia.getFullYear()===hoy.getFullYear() && primerDia.getMonth()===hoy.getMonth();
  const conHorario = disponibilidad != null;
  // Date.getDay() es domingo=0; el calendario de la app arranca en lunes.
  const huecos = (primerDia.getDay() + 6) % 7;

  const celdas = Array.from({ length: huecos }, () => ({ dia:null, muted:true, closed:false, open:false }));
  for(let d=1; d<=diasEnMes; d++){
    const fecha = new Date(anio, mes, d);
    const muted = !!(esMesActual && d < hoy.getDate());
    const closed = conHorario && !muted && horasDisponiblesDia(disponibilidad, diaSemanaDeFecha(fecha)).length === 0;
    celdas.push({ dia:d, fecha, muted, closed, open: !muted && !closed });
  }
  // Relleno final: la grilla del calendario es de 7 columnas, así que se
  // completan las celdas que faltan para cerrar la última fila.
  const sobran = (7 - (celdas.length % 7)) % 7;
  for(let i=0; i<sobran; i++) celdas.push({ dia:null, muted:true, closed:false, open:false });
  return celdas;
}

// Sugiere el primer día elegible del mes (hoy o más adelante) para preseleccionar
// el calendario y no obligar al cliente a adivinar qué días hay atención.
// Devuelve null si no queda ningún día abierto en ese mes.
function primerDiaDisponible(celdas, hoy){
  const abiertos = celdas.filter(c => c.open);
  if(!abiertos.length) return null;
  if(!hoy) return abiertos[0].dia;
  const delMesActual = abiertos.find(c => c.fecha.getFullYear()===hoy.getFullYear()
    && c.fecha.getMonth()===hoy.getMonth() && c.fecha.getDate() >= hoy.getDate());
  return (delMesActual || abiertos[0]).dia;
}

/* ---------------- PRECIOS ---------------- */

// Aproximación del monto de una cita: tarifa base del trabajador + recargo
// por urgencia si aplica. No hay un precio por servicio guardado en ningún
// lado (ver abrirDeclararPago en js/app.js).
function calcularMonto(worker, esUrgente){
  if(!worker) return null;
  return worker.tarifa + (esUrgente ? (worker.tarifa_urgente || 0) : 0);
}

/* ---------------- PERFIL DEL TRABAJADOR ---------------- */

// Qué le falta al perfil de un trabajador para generar confianza, con el id del
// elemento al que hay que llevarlo para completar cada punto (ver
// irACampoPerfil en js/app.js). Pura: no toca el DOM.
function calcularCompletitudPerfil(w){
  if(!w) return { porcentaje: 0, completos: 0, total: 0, faltantes: [] };
  const items = [
    { ok: !!w.foto_url, label: 'Subí una foto de perfil', anchor: 'wp-foto-btn' },
    { ok: !!(w.galeria_fotos && w.galeria_fotos.length), label: 'Agregá al menos una foto de trabajos anteriores', anchor: 'wp-galeria-btn' },
    { ok: !!(w.servicios && w.servicios.length), label: 'Contá qué servicios ofrecés', anchor: 'wp-servicios' },
    { ok: !!(w.zona && w.zona !== 'Sin definir'), label: 'Indicá la zona donde trabajás', anchor: 'wp-zona' },
    { ok: Object.values(w.disponibilidad || {}).some(horas => Array.isArray(horas) && horas.length > 0), label: 'Configurá tu disponibilidad semanal', anchor: 'wp-disponibilidad' },
    { ok: !!(w.verificado || w.verificacionPendiente), label: 'Solicitá la verificación de tu identidad', anchor: 'wp-verif-btn' },
  ];
  const completos = items.filter(i => i.ok).length;
  return {
    porcentaje: Math.round((completos / items.length) * 100),
    completos,
    total: items.length,
    faltantes: items.filter(i => !i.ok),
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    avg, insigniasTrabajador,
    diaSemanaDeFecha, horasDisponiblesDia, parseFechaHoraCita, formatearFechaCita,
    calendarioMes, primerDiaDisponible,
    calcularMonto, calcularCompletitudPerfil,
  };
} else {
  window.avg = avg;
  window.insigniasTrabajador = insigniasTrabajador;
  window.diaSemanaDeFecha = diaSemanaDeFecha;
  window.horasDisponiblesDia = horasDisponiblesDia;
  window.parseFechaHoraCita = parseFechaHoraCita;
  window.formatearFechaCita = formatearFechaCita;
  window.calendarioMes = calendarioMes;
  window.primerDiaDisponible = primerDiaDisponible;
  window.calcularMonto = calcularMonto;
  window.calcularCompletitudPerfil = calcularCompletitudPerfil;
}
