/**
 * Prueba viva del cobro recurrente contra el Sandbox de Wompi.
 * NO toca la base de datos: solo ejercita el cliente HTTP de Wompi.
 *
 * Requiere en el entorno:
 *   PLATFORM_WOMPI_PUBLIC_KEY=pub_test_...
 *   PLATFORM_WOMPI_PRIVATE_KEY=prv_test_...
 *   PLATFORM_WOMPI_INTEGRITY_SECRET=test_integrity_...
 *   PLATFORM_WOMPI_ENVIRONMENT=test
 *
 * Uso:  npm run test:wompi
 *
 * Pasos: tokeniza una tarjeta de prueba, pide tokens de aceptacion, crea la
 * fuente de pago, hace un cobro recurrente y consulta el estado hasta terminar.
 * Tarjetas de prueba: https://docs.wompi.co/docs/colombia/datos-de-prueba/
 */
import {
  tokenizeCard, getAcceptanceTokens, createPaymentSource,
  chargeRecurring, getTransaction, newReference,
} from '../lib/wompi.ts';

const EMAIL = 'prueba@turnosya.com';
const AMOUNT = 1_000_000; // $10.000 COP en centavos

async function main(): Promise<void> {
  console.log('1) Tokenizando tarjeta de prueba (VISA aprobada)...');
  const cardToken = await tokenizeCard({
    number: '4242424242424242',
    cvc: '123',
    expMonth: '12',
    expYear: '29',
    cardHolder: 'Pepe Prueba',
  });
  console.log('   token:', cardToken);

  console.log('2) Pidiendo tokens de aceptacion...');
  const acc = await getAcceptanceTokens();

  console.log('3) Creando fuente de pago...');
  const sourceId = await createPaymentSource({
    token: cardToken,
    customerEmail: EMAIL,
    acceptanceToken: acc.acceptanceToken,
    personalAuthToken: acc.personalAuthToken,
  });
  console.log('   payment_source_id:', sourceId);

  console.log('4) Cobrando $10.000 COP (recurrente)...');
  const reference = newReference('00000000-test');
  const tx = await chargeRecurring({
    paymentSourceId: sourceId,
    amountInCents: AMOUNT,
    reference,
    customerEmail: EMAIL,
  });
  console.log('   transaction id:', tx.id, 'estado:', tx.status);

  console.log('5) Esperando estado final...');
  let status = tx.status;
  for (let i = 0; i < 10 && (status === 'PENDING' || !status); i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const cur = await getTransaction(tx.id);
    status = cur.status;
    console.log('   ...', status);
  }

  console.log('RESULTADO FINAL:', status);
  if (status !== 'APPROVED') {
    console.error('La transaccion no fue APPROVED. Revisa las llaves y la tarjeta.');
    process.exit(2);
  }
  console.log('OK: cobro recurrente aprobado en Sandbox.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error en la prueba de Sandbox:', err);
    process.exit(1);
  });
