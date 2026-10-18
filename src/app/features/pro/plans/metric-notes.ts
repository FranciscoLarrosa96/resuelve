import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Definiciones compartidas: los hechos quedan a la vista y el detalle se consulta a pedido. */
@Component({
  selector: 'app-metric-notes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <details class="mt-5 border-t border-line pt-3" data-testid="metric-notes">
      <summary class="min-h-11 cursor-pointer py-2 text-[14px] font-semibold text-brand">Cómo contamos</summary>
      <ul class="mt-2 grid gap-3 text-[13px] leading-5 text-muted">
        <li><b>Apariciones y visitas.</b> Una aparición es una tarjeta vista en pantalla; una visita es una apertura del perfil. Son eventos del período, no personas únicas ni etapas de un mismo grupo de clientes.</li>
        <li><b>WhatsApp y Llamar.</b> Contamos toques, no conversaciones ni trabajos. Tocar el botón no confirma que se hayan comunicado. Los toques seguidos de la misma persona se deduplican. Los totales están disponibles también en Gratis.</li>
        <li><b>Presupuestos y trabajos.</b> Un presupuesto aceptado es una propuesta elegida en Resuelve; un trabajo realizado tiene su cierre registrado. El valor aceptado es lo acordado, no necesariamente lo cobrado.</li>
        @if (featured()) {
          <li><b>Destacados.</b> Las solicitudes se cuentan por su envío y los aceptados por su fecha de aceptación: pueden venir de pedidos de otro mes. No forman una tasa de conversión. No identificamos qué visitas o toques vinieron de Destacados; origen desconocido no significa cero.</li>
          <li><b>Acceso anticipado.</b> Solo contamos pedidos con evidencia de que un Free tuvo acceso después. Hoy, urgentes y dirigidos no tienen espera nueva.</li>
        }
        <li>Son registros del período, sin atribuir los resultados al plan ni garantizar que se repitan.</li>
      </ul>
    </details>
  `,
})
export class MetricNotes {
  readonly featured = input(false);
}
