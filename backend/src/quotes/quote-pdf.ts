import PDFDocument from 'pdfkit';
import { Quote } from './quote.entity';

/**
 * Presupuesto en PDF (PRO) con la identidad de Resuelve: encabezado Petrol con
 * el ícono dibujado en vector y, debajo, un documento sobrio de filetes (sin
 * cajas ni tarjetas): profesional, trabajo, tabla de conceptos, total sobre un
 * filete grueso y aclaraciones; pie legal en cada página.
 *
 * Solo datos reales del presupuesto y del perfil (matrícula verificada del
 * servicio pedido, puntaje con reseñas por Resuelve, enlace al perfil activo).
 * Nunca datos del cliente ni imágenes remotas.
 */
export interface QuotePdfContext {
  /** Matrícula verificada del servicio pedido (no de cualquier servicio). */
  licenseVerified: boolean;
  /** Puntaje público (null sin reseñas por Resuelve) y su cantidad. */
  rating: number | null;
  reviewsCount: number;
  /** Perfil público, solo si está activo. */
  profileUrl: string | null;
}

export interface QuotePdfRow {
  description: string;
  quantity: string;
  unitPrice: string;
  subtotal: string;
}

export interface QuotePdfModel {
  title: string;
  reference: string;
  issuedOn: string;
  professional: { name: string; headline: string | null };
  badges: { license: boolean; rating: string | null };
  description: string;
  rows: QuotePdfRow[];
  subtotals: { label: string; amount: string }[];
  total: string;
  facts: { label: string; value: string }[];
  note: string | null;
  legal: string;
  profileUrl: string | null;
}

export const QUOTE_PDF_LEGAL =
  'Presupuesto emitido por el profesional. No es una factura ni un comprobante de pago. Compartir este archivo no registra una aceptación en Resuelve.';

/** Sin caracteres de control ni glifos que la tipografía no tiene. */
export const pdfText = (value: string) =>
  Array.from(value)
    .filter((char) => char.charCodeAt(0) >= 32 || char === '\n' || char === '\r')
    .join('')
    .replace(/[^ -ɏ\n\r‐-‧€]/gu, '');
const money = (value: string | number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(Number(value));
const date = (value: Date) => new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }).format(value);
const quantity = (value: string) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(Number(value));

/** Qué dice el PDF (puro, testeable): el dibujo lo hace `quotePdf`. */
export function quotePdfModel(quote: Quote, ctx: QuotePdfContext): QuotePdfModel {
  const user = quote.professional.user;
  const name = pdfText(`${user.firstName} ${user.lastName}`).trim();
  const rows = [...(quote.items ?? [])]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item) => ({
      description: pdfText(item.description),
      quantity: quantity(item.quantity),
      unitPrice: money(item.unitPrice),
      subtotal: money(Math.round(Number(item.quantity) * Number(item.unitPrice) * 100) / 100),
    }));
  const facts: { label: string; value: string }[] = [];
  if (quote.validUntil) facts.push({ label: 'Válido hasta', value: date(quote.validUntil) });
  if (quote.estimatedDuration) facts.push({ label: 'Duración estimada', value: pdfText(quote.estimatedDuration) });
  const rating =
    ctx.rating !== null && ctx.reviewsCount > 0
      ? `${new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(ctx.rating)} · ${ctx.reviewsCount} ${ctx.reviewsCount === 1 ? 'reseña' : 'reseñas'} en Resuelve`
      : null;
  return {
    title: 'Presupuesto',
    reference: quote.id.slice(0, 8).toUpperCase(),
    issuedOn: date(quote.createdAt),
    professional: { name, headline: quote.professional.headline ? pdfText(quote.professional.headline) : null },
    badges: { license: ctx.licenseVerified, rating },
    description: pdfText(quote.description),
    rows,
    subtotals: [
      { label: 'Mano de obra', amount: money(quote.laborAmount) },
      { label: 'Materiales', amount: money(quote.materialsAmount) },
    ],
    total: money(quote.totalAmount),
    facts,
    note: quote.note ? pdfText(quote.note) : null,
    legal: QUOTE_PDF_LEGAL,
    profileUrl: ctx.profileUrl,
  };
}

/** Marca (manual de marca V1). */
const C = {
  petrol: '#1D4F5C',
  petrolDeep: '#163F49',
  ink: '#1D2423',
  muted: '#606B67',
  accent: '#A85432',
  cream: '#F7F3EB',
  line: '#E5DFD5',
  white: '#FFFFFF',
};
const PAGE = { margin: 48, footer: 72 };

export function quotePdf(quote: Quote, ctx: QuotePdfContext): Promise<Buffer> {
  const m = quotePdfModel(quote, ctx);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      bufferPages: true,
      margins: { top: PAGE.margin, left: PAGE.margin, right: PAGE.margin, bottom: PAGE.margin + PAGE.footer },
      info: { Title: `Presupuesto ${m.reference} · ${m.professional.name}`, Author: m.professional.name, Creator: 'Resuelve' },
    });
    const font = (file: string) => require.resolve(file);
    doc.registerFont('Sans', font('@fontsource/archivo/files/archivo-latin-400-normal.woff'));
    doc.registerFont('Sans-Bold', font('@fontsource/archivo/files/archivo-latin-700-normal.woff'));
    doc.registerFont('Serif', font('@fontsource/source-serif-4/files/source-serif-4-latin-700-normal.woff'));
    doc.registerFont('Serif-Semi', font('@fontsource/source-serif-4/files/source-serif-4-latin-600-normal.woff'));
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = PAGE.margin;
    const width = doc.page.width - PAGE.margin * 2;
    const right = left + width;
    const bottom = () => doc.page.height - doc.page.margins.bottom;
    /** Si no entra `h`, sigue en otra página. */
    const ensure = (h: number) => {
      if (doc.y + h > bottom()) doc.addPage();
    };
    /** Rótulo de sección: negrita sobria (las mayúsculas espaciadas quedan solo en el encabezado). */
    const label = (text: string, y = doc.y, x = left) => {
      doc.font('Sans-Bold').fontSize(10.5).fillColor(C.petrol).text(text, x, y);
      doc.moveDown(0.35);
    };
    const rule = (y: number, w = 0.8, color = C.line, from = left) => {
      doc.moveTo(from, y).lineTo(right, y).lineWidth(w).strokeColor(color).stroke();
    };

    // ---- Encabezado ----------------------------------------------------------
    doc.rect(0, 0, doc.page.width, 104).fill(C.petrol);
    drawMark(doc, left, 34, 36);
    doc.font('Sans-Bold').fontSize(19).fillColor(C.cream).text('Resuelve', left + 48, 41, { lineBreak: false });
    doc.font('Sans-Bold').fontSize(8.5).fillColor(C.cream).opacity(0.75)
      .text('PRESUPUESTO', left, 34, { width, align: 'right', characterSpacing: 1.6 });
    doc.opacity(1).font('Serif').fontSize(18).fillColor(C.white).text(`N.º ${m.reference}`, left, 48, { width, align: 'right' });
    doc.font('Sans').fontSize(9.5).fillColor(C.cream).text(`Emitido el ${m.issuedOn}`, left, 72, { width, align: 'right' });

    // ---- Profesional ---------------------------------------------------------
    doc.font('Serif').fontSize(22).fillColor(C.ink).text(m.professional.name, left, 140, { width });
    if (m.professional.headline) doc.font('Sans').fontSize(11).fillColor(C.muted).text(m.professional.headline, left, doc.y + 1, { width });
    // Sellos reales en una línea de texto con ícono, sin pastillas.
    const facts: { text: string; icon: 'check' | 'star' }[] = [];
    if (m.badges.license) facts.push({ text: 'Matrícula verificada', icon: 'check' });
    if (m.badges.rating) facts.push({ text: m.badges.rating, icon: 'star' });
    if (facts.length) {
      let bx = left;
      let by = doc.y + 8;
      doc.font('Sans-Bold').fontSize(9.5);
      for (const f of facts) {
        const w = doc.widthOfString(f.text) + 16;
        if (bx + w > right) {
          bx = left;
          by += 18;
        }
        if (f.icon === 'check') drawCheck(doc, bx, by + 1.5, 9, C.petrol);
        else drawStar(doc, bx + 4.5, by + 6, 5.2, C.accent);
        doc.fillColor(f.icon === 'check' ? C.petrol : C.ink).text(f.text, bx + 14, by, { lineBreak: false });
        bx += w + 18;
      }
      doc.y = by + 14;
    }
    doc.y += 18;
    rule(doc.y);
    doc.y += 22;

    // ---- Trabajo -------------------------------------------------------------
    label('Trabajo');
    doc.font('Sans').fontSize(12).fillColor(C.ink).text(m.description, left, doc.y, { width, lineGap: 4 });
    doc.y += 22;

    // ---- Detalle -------------------------------------------------------------
    if (m.rows.length) {
      ensure(80);
      label('Detalle de materiales y otros conceptos');
      const cols = [
        { key: 'description', title: 'Concepto', w: width - 250, align: 'left' as const },
        { key: 'quantity', title: 'Cant.', w: 50, align: 'right' as const },
        { key: 'unitPrice', title: 'Unitario', w: 100, align: 'right' as const },
        { key: 'subtotal', title: 'Subtotal', w: 100, align: 'right' as const },
      ];
      const pad = 10;
      const header = () => {
        const y = doc.y;
        let x = left;
        doc.font('Sans-Bold').fontSize(9).fillColor(C.muted);
        for (const c of cols) {
          doc.text(c.title, x + (c.align === 'left' ? 0 : pad), y + 8.5, { width: c.w - pad, align: c.align, lineBreak: false });
          x += c.w;
        }
        rule(y + 26, 1.2, C.petrol);
        doc.y = y + 26;
      };
      header();
      m.rows.forEach((row, i) => {
        doc.font('Sans').fontSize(10.5);
        const h = Math.max(doc.heightOfString(row.description, { width: cols[0].w - pad }), 13) + 16;
        if (doc.y + h > bottom()) {
          doc.addPage();
          header();
        }
        const y = doc.y;
        let x = left;
        for (const c of cols) {
          doc.font(c.key === 'subtotal' ? 'Sans-Bold' : 'Sans').fontSize(10.5).fillColor(C.ink)
            .text(row[c.key as keyof QuotePdfRow], x + (c.align === 'left' ? 0 : pad), y + 8, { width: c.w - pad, align: c.align });
          x += c.w;
        }
        if (i < m.rows.length - 1) rule(y + h, 0.6);
        doc.y = y + h;
      });
      doc.y += 14;
    }

    // ---- Subtotales y total --------------------------------------------------
    ensure(48 + 96);
    const sx = right - 240;
    for (const s of m.subtotals) {
      const y = doc.y;
      doc.font('Sans').fontSize(11).fillColor(C.muted).text(s.label, sx, y, { width: 120, lineBreak: false });
      doc.font('Sans-Bold').fillColor(C.ink).text(s.amount, sx + 110, y, { width: 130, align: 'right' });
      doc.y = y + 20;
    }
    doc.y += 6;
    const ty = doc.y;
    rule(ty, 2.2, C.petrol);
    doc.font('Sans-Bold').fontSize(12).fillColor(C.ink).text('Total', left, ty + 22, { lineBreak: false });
    doc.font('Serif').fontSize(28).fillColor(C.petrol).text(m.total, left, ty + 12, { width, align: 'right', lineBreak: false });
    doc.y = ty + 54;
    if (m.facts.length) {
      // Validez y duración en una fila, alineadas a la misma línea de base.
      const fy = doc.y;
      let fx = left;
      for (const f of m.facts) {
        doc.font('Sans').fontSize(9.5).fillColor(C.muted).text(f.label, fx, fy, { lineBreak: false });
        fx += doc.widthOfString(f.label) + 5;
        doc.font('Sans-Bold').fontSize(9.5).fillColor(C.ink).text(f.value, fx, fy, { lineBreak: false });
        fx += doc.widthOfString(f.value) + 24;
      }
      doc.y = fy + 16;
    }
    doc.y += 18;

    // ---- Aclaraciones --------------------------------------------------------
    if (m.note) {
      ensure(80);
      rule(doc.y);
      doc.y += 16;
      label('Aclaraciones');
      doc.font('Sans').fontSize(11).fillColor(C.ink).text(m.note, left, doc.y, { width, lineGap: 3 });
    }

    // ---- Pie en cada página --------------------------------------------------
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const saved = doc.page.margins.bottom;
      doc.page.margins.bottom = 0; // escribir dentro del margen sin abrir otra página
      const fy0 = doc.page.height - PAGE.margin - PAGE.footer + 18;
      doc.moveTo(left, fy0).lineTo(right, fy0).lineWidth(0.8).strokeColor(C.line).stroke();
      drawMark(doc, left, fy0 + 14, 16);
      doc.font('Sans').fontSize(8).fillColor(C.muted).text(m.legal, left + 26, fy0 + 12, { width: width - 120, lineGap: 1.5 });
      if (m.profileUrl) doc.font('Sans-Bold').fontSize(8).fillColor(C.petrol).text(m.profileUrl, left + 26, doc.y + 3, { width: width - 120, link: m.profileUrl, lineBreak: false });
      doc.font('Sans').fontSize(8).fillColor(C.muted).text(`Página ${i - range.start + 1} de ${range.count}`, right - 90, fy0 + 12, { width: 90, align: 'right', lineBreak: false });
      doc.page.margins.bottom = saved;
    }
    doc.end();
  });
}

/** Ícono de la app (casa + tilde) en vector: cuadrado Petrol con trazo crema. */
function drawMark(doc: PDFKit.PDFDocument, x: number, y: number, size: number) {
  const s = size / 96;
  doc.save();
  doc.roundedRect(x, y, size, size, size * 0.22).fill(C.petrolDeep);
  doc.translate(x, y).scale(s);
  doc.lineWidth(7).lineCap('round').lineJoin('round').strokeColor(C.cream);
  // Casa (con chimenea), abierta a la derecha donde sale el tilde.
  doc.moveTo(70, 50).lineTo(70, 72).lineTo(26, 72).lineTo(26, 46).lineTo(48, 26).lineTo(58, 35).lineTo(58, 28).lineTo(64, 28).lineTo(64, 40).stroke();
  doc.moveTo(36, 50).lineTo(46, 60).lineTo(74, 36).lineWidth(9).stroke();
  doc.restore();
}

function drawCheck(doc: PDFKit.PDFDocument, x: number, y: number, size: number, color: string) {
  doc.save();
  doc.lineWidth(1.6).lineCap('round').lineJoin('round').strokeColor(color);
  doc.moveTo(x, y + size * 0.5).lineTo(x + size * 0.38, y + size * 0.88).lineTo(x + size, y + size * 0.1).stroke();
  doc.restore();
}

function drawStar(doc: PDFKit.PDFDocument, cx: number, cy: number, r: number, color: string) {
  const pts: [number, number][] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  doc.save();
  doc.polygon(...pts).fill(color);
  doc.restore();
}
