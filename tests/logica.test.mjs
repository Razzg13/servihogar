import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { avg, diaSemanaDeFecha, calcularMonto, horasDisponiblesDia, insigniasTrabajador } = require('../js/logica.js');

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
