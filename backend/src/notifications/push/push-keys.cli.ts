import webpush from 'web-push';

/**
 * Genera el par de claves VAPID para los avisos push:
 *
 *   npm run push:keys
 *
 * Se cargan una sola vez en el entorno (Render): cambiarlas invalida todas las
 * suscripciones (cada persona tendría que volver a activar los avisos). La
 * privada es secreta: no se commitea ni se comparte.
 */
const keys = webpush.generateVAPIDKeys();
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log('VAPID_SUBJECT=mailto:tu-cuenta@gmail.com');
console.log('PUSH_NOTIFICATIONS_ENABLED=true');
