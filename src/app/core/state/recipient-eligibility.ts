import { Injector, computed, effect, inject, runInInjectionContext, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { RequestsApiService } from '../api/requests-api.service';
import { RequestStore } from './request.store';

/** Cuántos candidatos (los primeros del listado que pueden recibirlo) se consultan al backend. */
export const CANDIDATES_TO_CHECK = 12;

/**
 * "¿Quién puede RESPONDER este pedido ahora?" para toda recomendación previa al envío (sugeridos
 * de "Revisá tu pedido" y "Sumá otro para comparar"). Única fuente en el front: pregunta a
 * `POST /requests/eligible-recipients`, que usa la misma regla que el envío (cupo, solicitudes
 * activadas, perfil pausado, servicio y cobertura). Solo revisa los primeros `CANDIDATES_TO_CHECK`
 * candidatos del listado: nunca debe afirmarse que "no hay nadie". Sin respuesta no se recomienda a nadie; el
 * envío revalida igual porque la elegibilidad cambia entre un paso y otro.
 */
export function createRecipientEligibility<T extends { id: string }>(candidates: () => readonly T[], injector = inject(Injector), limit = CANDIDATES_TO_CHECK) {
  return runInInjectionContext(injector, () => {
    const api = inject(RequestsApiService);
    const store = inject(RequestStore);
    const list = computed(() => candidates().slice(0, limit));
    /** Qué se consultó y qué respondió el backend (`ids: null` = no se pudo verificar). */
    const verified = signal<{ key: string; ids: string[] | null } | null>(null);
    const revision = signal(0);
    const key = computed(() => {
      const generation = revision();
      const ids = list().map((p) => p.id);
      const payload = store.buildPayload();
      if (!ids.length || !payload) return null;
      return JSON.stringify([payload.serviceId, payload.localityId, payload.zoneId, payload.urgency ?? 'FLEXIBLE', ids, generation]);
    });
    const current = computed(() => {
      const v = verified();
      return v && v.key === key() ? v : null;
    });
    effect(() => {
      const k = key();
      if (!k) return;
      untracked(() => {
        if (verified()?.key === k) return;
        const payload = store.buildPayload()!;
        firstValueFrom(
          api.eligibleRecipients({
            serviceId: payload.serviceId,
            ...(payload.localityId ? { localityId: payload.localityId } : {}),
            ...(payload.zoneId ? { zoneId: payload.zoneId } : {}),
            urgency: payload.urgency ?? 'FLEXIBLE',
            professionalIds: list().map((p) => p.id),
          }),
        ).then(
          (res) => { if (key() === k) verified.set({ key: k, ids: res.eligibleIds }); },
          () => { if (key() === k) verified.set({ key: k, ids: null }); },
        );
      });
    });
    return {
      refresh: () => revision.update((n) => n + 1),
      unavailable: computed(() => {
        const ok = current()?.ids;
        return ok ? list().filter((p) => !ok.includes(p.id)) : [];
      }),
      /** Se está preguntando. */
      loading: computed(() => !!key() && !current()),
      /** No se pudo verificar: no se recomienda a nadie sin saberlo. */
      unverified: computed(() => current()?.ids === null),
      /** Entre los candidatos revisados (una selección limitada) ninguno puede responder ahora; no dice nada del resto del listado. */
      noneEligible: computed(() => {
        const v = current();
        return !!v && v.ids !== null && v.ids.length === 0;
      }),
      /** Los candidatos que pueden responder, en el orden recibido. */
      eligible: computed(() => {
        const ok = current()?.ids;
        return ok ? list().filter((p) => ok.includes(p.id)) : [];
      }),
    };
  });
}
