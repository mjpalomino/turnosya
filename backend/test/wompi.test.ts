/**
 * Tests de la firma de eventos de Wompi.
 *
 * Usamos el string de entrada del ejemplo oficial
 * (https://docs.wompi.co/docs/colombia/eventos/):
 *   1234-1610641025-49201 + APPROVED + 4490000 + 1530291411 + secreto
 * NOTA: el checksum impreso en esa página (3476DD...) es ilustrativo y NO es el
 * SHA256 real de esa cadena. El SHA256 verdadero es el de abajo (EXPECTED), que
 * es contra el que debe validar nuestra implementación.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// El secreto de la doc. Lo fijamos en el entorno ANTES de importar el módulo,
// que lee config al cargar.
process.env.PLATFORM_WOMPI_EVENTS_SECRET = 'prod_events_OcHnIzeBl5socpwByQ4hA52Em3USQ93Z';
process.env.JWT_SECRET = 'x'.repeat(32);
process.env.ENCRYPTION_KEY = '0'.repeat(64);
process.env.DATABASE_URL = 'postgres://x:x@localhost:5432/x';
process.env.USER_ADMIN = 'admin@test.com';
process.env.PASSWORD_ADMIN = 'secret1';

const { verifyEventSignature } = await import('../src/lib/wompi.ts');

const docEvent = {
  event: 'transaction.updated',
  data: {
    transaction: {
      id: '1234-1610641025-49201',
      status: 'APPROVED',
      amount_in_cents: 4490000,
      reference: 'MZQ3X2DE2SMX',
    },
  },
  signature: {
    properties: ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'],
    // SHA256 real de: <id><status><amount><timestamp><secret>
    checksum: '5A18EC5E8FDB7DF463E9F94774CBA8F583BA21BD04A09CEFF2EA68A4BC0AEFBE',
  },
  timestamp: 1530291411,
};

test('acepta la firma válida del ejemplo oficial de Wompi', () => {
  assert.equal(verifyEventSignature(docEvent), true);
});

test('acepta el checksum vía header X-Event-Checksum', () => {
  const noChecksumInBody = { ...docEvent, signature: { properties: docEvent.signature.properties } };
  assert.equal(verifyEventSignature(noChecksumInBody, docEvent.signature.checksum), true);
});

test('rechaza una firma manipulada', () => {
  const tampered = {
    ...docEvent,
    data: { transaction: { ...docEvent.data.transaction, amount_in_cents: 9999999 } },
  };
  assert.equal(verifyEventSignature(tampered), false);
});

test('rechaza si falta el timestamp', () => {
  const noTs = { ...docEvent, timestamp: undefined };
  assert.equal(verifyEventSignature(noTs as never), false);
});
