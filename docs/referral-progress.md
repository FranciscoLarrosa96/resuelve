# Referidos: regla simple y festejo

Regla única en `backend/src/acquisition/referrals.ts`.

## Regla

1. Juan comparte su enlace (`/registro/profesional?ref=PRO-…`, Mi plan → "Regalá 15 días de PRO a un colega").
2. Pepe abre el enlace y crea su cuenta (el código queda en `referrals`, una sola persona que invita por cuenta; con verificación de email, al verificar).
3. Pepe crea su perfil profesional (el alta ya exige servicio y cobertura). **En esa misma transacción** (`ProfessionalsService.create` → `activateReferral`) los dos suman `REFERRAL_REWARD_DAYS` (15) de PRO (`bonus_pro_until`, `referral_rewards`). Sin presupuestos, matrícula ni más pasos.

- Si Pepe se registró como cliente con el enlace y arma su perfil más tarde, el premio sale en ese momento.
- **Tope de quien invita:** `REFERRAL_MAX_REWARDS` (3) amigos con días, en total. Del siguiente en adelante el amigo igual recibe los suyos y Juan recibe el aviso "Un colega se sumó con tu enlace" sin días. Se lee con el perfil de Juan bloqueado: altas simultáneas no lo pasan. Mientras el email no se verifique (`EMAIL_VERIFICATION_ENABLED=false`), el tope es lo que impide regalarse PRO eterno con cuentas truchas.
- Antifraude que se mantiene: código inexistente y autoinvitación bloqueados; una cuenta existente no puede agregar un código después; un referente por cuenta; un premio por invitación y persona (reintentos y concurrencia no duplican).
- `REFERRAL_REWARDS_ENABLED=false`: la invitación queda `ACTIVATED` sin días; al habilitarlas, `POST /pro/acquisition/referrals/claim` (o la misma activación) las otorga una sola vez.
- Invitaciones anteriores a esta regla que quedaron `REGISTERED` con el perfil ya creado: la tarjeta del invitado muestra "Activar mis 15 días de PRO" → `POST /pro/acquisition/referrals/claim` (misma activación, idempotente).
- Mercado Pago y las suscripciones no se tocan: el bonus extiende el acceso efectivo.

## API

- `GET /pro/acquisition/referrals` → `{ enabled, code, rewardsEnabled, rewardDays, maxRewards, rewardsLeft, counts, items, incoming }`. `incoming = { status, rewardDays } | null` (sin pasos: no hay requisitos que mostrar).
- `POST /pro/acquisition/referrals/claim` → `{ incoming }`.
- `GET /pro/me` → `referralCelebration: { rewardId, role: REFERRER | REFERRED, friendName, days, accessUntil, rewardsLeft } | null`: el premio más viejo sin festejar (`referral_rewards.celebrated_at` NULL). Solo nombre de pila del amigo.
- `POST /pro/acquisition/referrals/celebrations/:rewardId/ack` → cierra el festejo propio (idempotente; el de otro no cambia).
- Migración `1793600000000-ReferralCelebration`: `referral_rewards.celebrated_at` (los premios anteriores se marcan como vistos: nunca se festejan premios viejos).

## Presentación

- **Festejo** (`ProShell`, una vez por premio, nunca encima del de primer cliente): `app-celebrate` + diálogo.
  - Juan: "🎉 ¡Pepe se sumó con tu enlace!", hasta cuándo dura su PRO y cuántos colegas más le suman días; "Invitar a otro colega" lleva a `/pro/plan#invitar`.
  - Pepe: "🎉 ¡Juan te regaló 15 días de PRO!", hasta cuándo y "Empezar".
- **Mi plan** (`ReferralsPanel`): "apenas arme su perfil profesional, los dos tienen 15 días de PRO", colegas que todavía suman días (o tope alcanzado) y el listado (se registró / armó su perfil · +15 días para vos / sin días para vos).
- **Registro con `?ref=`**: "apenas armes tu perfil profesional, los dos tienen días de Resuelve PRO de regalo".
- Términos (`/terminos`, versión `2026-10-07`) y Privacidad (el invitado ve el nombre de pila de quien lo invitó) lo describen.

## Tests

`backend/test/phase6-acquisition.e2e-spec.ts` (alta → premio al instante, concurrencia, festejo y ack, tope 3, cliente que arma el perfil después, invitación vieja con "Activar", recompensas apagadas), `phase7-retention.e2e-spec.ts` (avisos), `referral-progress.spec.ts` (back y front), `referrals-panel.spec.ts`, `pro-shell.spec.ts`.
