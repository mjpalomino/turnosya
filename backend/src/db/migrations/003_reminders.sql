-- =====================================================================
-- Migración 003: control de recordatorios enviados
-- Evita enviar el recordatorio de una cita más de una vez.
-- =====================================================================

ALTER TABLE appointments
  ADD COLUMN reminder_sent_at TIMESTAMPTZ;

CREATE INDEX appointments_reminder_idx
  ON appointments (starts_at)
  WHERE reminder_sent_at IS NULL AND status IN ('booked', 'confirmed');
