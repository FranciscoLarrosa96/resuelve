/**
 * El backend hace un POST al `endpoint` que manda el navegador: solo se
 * aceptan los servicios de push reales (https), nunca una URL cualquiera
 * (evita que alguien use el servidor para pegarle a otra dirección).
 */
const PUSH_HOSTS: readonly RegExp[] = [
  /^fcm\.googleapis\.com$/, // Chrome, Edge (Chromium), Samsung, Android
  /^android\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/, // Firefox
  /^push\.services\.mozilla\.com$/,
  /^web\.push\.apple\.com$/, // Safari (macOS e iOS con la app instalada)
  /^[a-z0-9-]+\.push\.apple\.com$/,
  /^[a-z0-9-]+\.notify\.windows\.com$/, // Edge antiguo / Windows
];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return false;
  return PUSH_HOSTS.some((host) => host.test(url.hostname.toLowerCase()));
}
