import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  avg, diaSemanaDeFecha, calcularMonto, horasDisponiblesDia, insigniasTrabajador,
  parseFechaHoraCita, formatearFechaCita, calendarioMes, primerDiaDisponible,
  calcularCompletitudPerfil,
} = require('../js/logica.js');

test('avg: sin reseñas devuelve null', () => {
  assert.equal(avg([]), null);
  assert.equal(avg(null), null);
  assert.equal(avg(undefined), null);
});

test('avg: promedia las estrellas con un decimal', () => {
  assert.equal(avg([{ estrellas: 5 }, { estrellas: 4 }]), '4.5');
  assert.equal(avg([{ estrellas: 3 }]), '3.0');
});

test('diaSemanaDeFecha: mapea Date.getDay() a las siglas lunes-primero', () => {
  assert.equal(diaSemanaDeFecha(new Date(2024, 0, 1)), 'L');  // lunes
  assert.equal(diaSemanaDeFecha(new Date(2024, 0, 7)), 'D');  // domingo
  assert.equal(diaSemanaDeFecha(new Date(2024, 0, 6)), 'S');  // sábado
});

test('calcularMonto: sin trabajador devuelve null', () => {
  assert.equal(calcularMonto(null, false), null);
});

test('calcularMonto: usa solo la tarifa base si no es urgente', () => {
  assert.equal(calcularMonto({ tarifa: 40000, tarifa_urgente: 15000 }, false), 40000);
});

test('calcularMonto: suma el recargo de urgencia cuando aplica', () => {
  assert.equal(calcularMonto({ tarifa: 40000, tarifa_urgente: 15000 }, true), 55000);
});

test('calcularMonto: urgente sin recargo definido no rompe (usa 0)', () => {
  assert.equal(calcularMonto({ tarifa: 40000 }, true), 40000);
});

test('horasDisponiblesDia: devuelve las horas del día pedido', () => {
  const disponibilidad = { L: ['8:00 am', '10:00 am'], M: [] };
  assert.deepEqual(horasDisponiblesDia(disponibilidad, 'L'), ['8:00 am', '10:00 am']);
});

test('horasDisponiblesDia: día sin horas o sin disponibilidad devuelve []', () => {
  assert.deepEqual(horasDisponiblesDia({ L: [] }, 'L'), []);
  assert.deepEqual(horasDisponiblesDia({ L: ['8:00 am'] }, 'M'), []);
  assert.deepEqual(horasDisponiblesDia(null, 'L'), []);
});

test('insigniasTrabajador: sin reseñas no da insignias', () => {
  assert.deepEqual(insigniasTrabajador([]), []);
  assert.deepEqual(insigniasTrabajador(null), []);
});

test('insigniasTrabajador: promedio alto con pocas reseñas no llega a "Top calificado"', () => {
  const resenas = [{ estrellas: 5 }, { estrellas: 5 }];
  assert.deepEqual(insigniasTrabajador(resenas), []);
});

test('insigniasTrabajador: "Recomendado" con promedio >=4.5 y al menos 3 reseñas', () => {
  const resenas = [{ estrellas: 5 }, { estrellas: 4 }, { estrellas: 5 }];
  assert.deepEqual(insigniasTrabajador(resenas), [{ icono: '⭐', texto: 'Recomendado' }]);
});

test('insigniasTrabajador: "Top calificado" con promedio >=4.8 y al menos 5 reseñas (excluye "Recomendado")', () => {
  const resenas = Array(5).fill({ estrellas: 5 });
  assert.deepEqual(insigniasTrabajador(resenas), [{ icono: '🏆', texto: 'Top calificado' }]);
});

test('insigniasTrabajador: "Muy solicitado" con 10+ reseñas se combina con la de calificación', () => {
  const resenas = Array(10).fill({ estrellas: 5 });
  assert.deepEqual(insigniasTrabajador(resenas), [
    { icono: '🏆', texto: 'Top calificado' },
    { icono: '🔥', texto: 'Muy solicitado' },
  ]);
});

/* ---------------- FECHAS DE CITA ---------------- */

test('parseFechaHoraCita: interpreta la hora en formato 12h', () => {
  const d = parseFechaHoraCita('15 de agosto', '3:00 pm');
  assert.equal(d.getHours(), 15);
  assert.equal(d.getMinutes(), 0);
  assert.equal(d.getDate(), 15);
  assert.equal(d.getMonth(), 7);
});

test('parseFechaHoraCita: 12 am es medianoche y 12 pm es mediodía', () => {
  assert.equal(parseFechaHoraCita('1 de marzo', '12:00 am').getHours(), 0);
  assert.equal(parseFechaHoraCita('1 de marzo', '12:00 pm').getHours(), 12);
});

test('parseFechaHoraCita: usa el año explícito cuando la fecha lo trae', () => {
  assert.equal(parseFechaHoraCita('15 de agosto de 2027', '8:00 am').getFullYear(), 2027);
});

test('parseFechaHoraCita: sin año usa el año del respaldo, no el del reloj', () => {
  // Cita creada en diciembre de 2026 para el 3 de enero: el año correcto es 2026.
  const d = parseFechaHoraCita('3 de enero', '9:00 am', '2026-12-20T10:00:00Z');
  assert.equal(d.getFullYear(), 2026);
});

test('parseFechaHoraCita: rechaza textos inválidos o fechas que no existen', () => {
  assert.equal(parseFechaHoraCita('', '8:00 am'), null);
  assert.equal(parseFechaHoraCita('agosto 15', '8:00 am'), null);
  assert.equal(parseFechaHoraCita('15 de agosto', '8am'), null);
  assert.equal(parseFechaHoraCita('31 de febrero', '8:00 am'), null); // no existe
  assert.equal(parseFechaHoraCita('15 de agosto', '25:00 pm'), null); // rueda de día
});

test('formatearFechaCita: omite el año salvo que se pida incluirlo', () => {
  const d = new Date(2026, 7, 15);
  assert.equal(formatearFechaCita(d, false), '15 de agosto');
  assert.equal(formatearFechaCita(d, true), '15 de agosto de 2026');
});

/* ---------------- CALENDARIO DE AGENDAMIENTO ---------------- */

test('calendarioMes: rellena los huecos para que el 1 caiga en su día de la semana', () => {
  // 1 de agosto de 2026 es sábado -> 5 huecos antes (L M X J V).
  const celdas = calendarioMes(2026, 7, null, null);
  assert.equal(celdas.filter(c => c.dia).length, 31);
  assert.deepEqual(celdas.slice(0, 5).map(c => c.dia), [null, null, null, null, null]);
  assert.equal(celdas[5].dia, 1);
});

test('calendarioMes: la grilla siempre es múltiplo de 7 (cierra la última semana)', () => {
  // Recorre 24 meses seguidos: ninguno puede quedar con una fila incompleta,
  // porque el calendario se pinta con grid-template-columns:repeat(7,1fr).
  for(let mes=0; mes<24; mes++){
    const celdas = calendarioMes(2026, mes, null, null);
    assert.equal(celdas.length % 7, 0, `el mes ${mes} no cierra la grilla`);
    const delMes = celdas.filter(c => c.dia);
    assert.equal(delMes.length, new Date(2026, mes + 1, 0).getDate());
  }
});

test('calendarioMes: los días pasados del mes en curso quedan bloqueados', () => {
  const celdas = calendarioMes(2026, 7, new Date(2026, 7, 10), null);
  const porDia = new Map(celdas.filter(c => c.dia).map(c => [c.dia, c]));
  assert.equal(porDia.get(9).muted, true);
  assert.equal(porDia.get(9).open, false);
  assert.equal(porDia.get(10).muted, false); // hoy sí se puede
  assert.equal(porDia.get(10).open, true);
});

test('calendarioMes: en un mes futuro ningún día queda bloqueado por ser pasado', () => {
  const celdas = calendarioMes(2026, 8, new Date(2026, 7, 31), null);
  assert.equal(celdas.filter(c => c.dia && c.muted).length, 0);
});

test('calendarioMes: marca cerrados los días de la semana sin disponibilidad', () => {
  // Solo atiende lunes (L). El 2 de agosto de 2026 es domingo, el 3 es lunes.
  const celdas = calendarioMes(2026, 7, null, { L: ['8:00 am'], M: [], X: [], J: [], V: [], S: [], D: [] });
  const porDia = new Map(celdas.filter(c => c.dia).map(c => [c.dia, c]));
  assert.equal(porDia.get(2).closed, true);   // domingo
  assert.equal(porDia.get(2).open, false);
  assert.equal(porDia.get(3).closed, false);  // lunes
  assert.equal(porDia.get(3).open, true);
});

test('calendarioMes: sin disponibilidad consultada no cierra ningún día', () => {
  // null/undefined = todavía no se pidió el horario del trabajador. Bloquear
  // todo el calendario mientras carga dejaría al cliente sin poder agendar.
  const celdas = calendarioMes(2026, 7, null, null);
  assert.equal(celdas.filter(c => c.dia && c.open).length, 31);
  assert.equal(celdas.filter(c => c.dia && c.closed).length, 0);
});

test('calendarioMes: sin disponibilidad cargada cierra todos los días', () => {
  const celdas = calendarioMes(2026, 7, null, {});
  assert.equal(celdas.filter(c => c.dia && c.open).length, 0);
});

test('primerDiaDisponible: sugiere el próximo día abierto, no el 1 ciego', () => {
  const disponibilidad = { L: ['8:00 am'], M: [], X: [], J: [], V: [], S: [], D: [] };
  const celdas = calendarioMes(2026, 7, new Date(2026, 7, 5), disponibilidad); // miércoles 5
  assert.equal(primerDiaDisponible(celdas, new Date(2026, 7, 5)), 10); // lunes siguiente
});

test('primerDiaDisponible: en un mes futuro arranca en el primer día abierto', () => {
  const disponibilidad = { L: ['8:00 am'], M: [], X: [], J: [], V: [], S: [], D: [] };
  const celdas = calendarioMes(2026, 7, new Date(2026, 6, 1), disponibilidad);
  assert.equal(primerDiaDisponible(celdas, new Date(2026, 6, 1)), 3); // lunes 3 de agosto
});

test('primerDiaDisponible: null cuando el mes no tiene ningún día abierto', () => {
  const celdas = calendarioMes(2026, 7, null, {});
  assert.equal(primerDiaDisponible(celdas, null), null);
});

/* ---------------- COMPLETITUD DEL PERFIL ---------------- */

test('calcularCompletitudPerfil: sin perfil devuelve 0 y sin faltantes', () => {
  assert.deepEqual(calcularCompletitudPerfil(null), { porcentaje: 0, completos: 0, total: 0, faltantes: [] });
});

test('calcularCompletitudPerfil: perfil vacío lista los 6 puntos pendientes', () => {
  const r = calcularCompletitudPerfil({});
  assert.equal(r.porcentaje, 0);
  assert.equal(r.total, 6);
  assert.equal(r.faltantes.length, 6);
  assert.equal(r.faltantes[0].anchor, 'wp-foto-btn'); // en el mismo orden del panel
});

test('calcularCompletitudPerfil: perfil completo llega a 100% sin faltantes', () => {
  const r = calcularCompletitudPerfil({
    foto_url: 'x.jpg', galeria_fotos: ['a.jpg'], servicios: ['Fugas'],
    zona: 'Centro', disponibilidad: { L: ['8:00 am'] }, verificado: true,
  });
  assert.equal(r.porcentaje, 100);
  assert.deepEqual(r.faltantes, []);
});

test('calcularCompletitudPerfil: "Sin definir" no cuenta como zona válida', () => {
  const r = calcularCompletitudPerfil({ zona: 'Sin definir' });
  assert.ok(r.faltantes.some(f => f.anchor === 'wp-zona'));
});

test('calcularCompletitudPerfil: una verificación pendiente ya cuenta como hecha', () => {
  const r = calcularCompletitudPerfil({ verificacionPendiente: true });
  assert.ok(!r.faltantes.some(f => f.anchor === 'wp-verif-btn'));
});

test('calcularCompletitudPerfil: disponibilidad con todos los días vacíos no cuenta', () => {
  const r = calcularCompletitudPerfil({ disponibilidad: { L: [], M: [] } });
  assert.ok(r.faltantes.some(f => f.anchor === 'wp-disponibilidad'));
});
