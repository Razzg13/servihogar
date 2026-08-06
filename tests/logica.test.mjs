import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { avg, diaSemanaDeFecha, calcularMonto, horasDisponiblesDia } = require('../js/logica.js');

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
