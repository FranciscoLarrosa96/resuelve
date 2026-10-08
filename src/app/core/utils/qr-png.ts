/**
 * QR como PNG (data URL), generado en el navegador. Contraste alto y la zona
 * de silencio de cuatro módulos que exige el estándar, para que se lea impreso o en pantalla.
 * Única fuente: la usan "Compartí tu perfil" y "Sumá reseñas de tus clientes de siempre".
 */
export async function qrPngDataUrl(text: string): Promise<string> {
  const { default: qrcode } = await import('qrcode-generator');
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  const cell = 8;
  const margin = 4;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = (count + 2 * margin) * cell;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#153942';
  for (let row = 0; row < count; row++)
    for (let col = 0; col < count; col++)
      if (qr.isDark(row, col)) ctx.fillRect((col + margin) * cell, (row + margin) * cell, cell, cell);
  return canvas.toDataURL('image/png');
}
