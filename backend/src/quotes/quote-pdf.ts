import PDFDocument from 'pdfkit';
import { Quote } from './quote.entity';

/** No remote images or client contact details are fetched or embedded. */
export function quotePdf(quote: Quote): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: 'Presupuesto', Author: 'Resuelve' } });
    doc.registerFont('Archivo', require.resolve('@fontsource/archivo/files/archivo-latin-400-normal.woff'));
    doc.registerFont('Archivo-Bold', require.resolve('@fontsource/archivo/files/archivo-latin-700-normal.woff'));
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    const text = (value: string) => Array.from(value).filter((char) => char.charCodeAt(0) >= 32 || char === '\n' || char === '\r').join('').replace(/[^\u0020-\u024f\n\r\u2010-\u2027\u20ac]/gu, '');
    const money = (value: string) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(Number(value));
    const date = (value: Date) => new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }).format(value);
    doc.font('Archivo-Bold').fontSize(13).fillColor('#2B5B49').text('RESUELVE');
    doc.moveDown().fontSize(26).fillColor('#1F2521').text('Presupuesto');
    doc.fontSize(17).text(text(`${quote.professional.user.firstName} ${quote.professional.user.lastName}`));
    if (quote.professional.headline) doc.font('Archivo').fontSize(11).text(text(quote.professional.headline));
    doc.moveDown().font('Archivo').fontSize(10).fillColor('#555B56').text(`Emitido el ${date(quote.createdAt)} · Ref. ${quote.id.slice(0, 8)}`);
    doc.moveDown().fontSize(12).fillColor('#1F2521').text(text(quote.description), { lineGap: 4 });
    if (quote.items.length) {
      doc.moveDown().font('Archivo-Bold').text('Detalle de materiales y otros conceptos');
      for (const item of [...quote.items].sort((a, b) => a.sortOrder - b.sortOrder)) {
        doc.moveDown(0.4).font('Archivo').fontSize(11).text(text(`${item.description}: ${item.quantity} × ${money(item.unitPrice)}`));
      }
    }
    doc.moveDown().font('Archivo').fontSize(12).text(`Mano de obra: ${money(quote.laborAmount)}`);
    doc.text(`Materiales: ${money(quote.materialsAmount)}`);
    doc.moveDown(0.4).font('Archivo-Bold').fontSize(18).text(`Total: ${money(quote.totalAmount)}`);
    doc.font('Archivo').fontSize(11);
    if (quote.estimatedDuration) doc.moveDown().text(text(`Duración estimada: ${quote.estimatedDuration}`));
    if (quote.validUntil) doc.moveDown(0.5).text(`Válido hasta el ${date(quote.validUntil)}.`);
    if (quote.note) doc.moveDown().text(text(quote.note), { lineGap: 3 });
    doc.moveDown().fontSize(9).fillColor('#555B56').text('Presupuesto emitido por el profesional. No es una factura ni un comprobante de pago. Compartir este archivo no registra una aceptación en Resuelve.');
    doc.end();
  });
}
