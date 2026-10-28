/** Tests de las plantillas de correo (puras, sin SMTP). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bookedEmail,
  cancelledEmail,
  reminderEmail,
  type AppointmentEmailData,
} from '../src/lib/email-templates.ts';

const data: AppointmentEmailData = {
  businessName: 'Barbería Fígaro',
  customerName: 'Ana',
  serviceName: 'Corte clásico',
  staffName: 'Luis',
  when: 'lun 3 nov, 10:30',
  address: 'Calle 1 #2-3',
  brandColor: '#EC542F',
};

test('bookedEmail incluye negocio, servicio y color de marca', () => {
  const { subject, html } = bookedEmail(data);
  assert.match(subject, /Barbería Fígaro/);
  assert.match(html, /Corte clásico/);
  assert.match(html, /lun 3 nov, 10:30/);
  assert.match(html, /#EC542F/);
  assert.match(html, /Ana/);
});

test('cancelledEmail menciona la cancelación', () => {
  const { subject, html } = cancelledEmail(data);
  assert.match(subject, /cancelada/i);
  assert.match(html, /cancelada/i);
});

test('reminderEmail es un recordatorio', () => {
  const { subject, html } = reminderEmail(data);
  assert.match(subject, /[Rr]ecordatorio/);
  assert.match(html, /recordamos/i);
});

test('usa color por defecto si no se pasa', () => {
  const { html } = bookedEmail({ ...data, brandColor: undefined });
  assert.match(html, /#2563EB/);
});
