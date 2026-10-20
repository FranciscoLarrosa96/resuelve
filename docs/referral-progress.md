# Invitaciones y prueba única de PRO

Cada profesional puede invitar hasta tres colegas. Cada persona, quien invita incluido, dispone de una sola prueba de hasta siete días en total. No se suman semanas por colega, por entrar con otro enlace ni por activar la prueba desde otra pantalla.

## Recorrido

1. Compartir el enlace de Mi plan o Inicio.
2. El colega crea su cuenta con el enlace y luego su perfil. Se registra la invitación, pero no se consume ni se otorga PRO automáticamente.
3. Con perfil publicado, foto personal, un trabajo con foto pública y al menos un canal habilitado, cada persona confirma su prueba desde Mi plan o Tu mes. Solicitudes por Resuelve cuentan como canal; no se exige WhatsApp ni presupuesto aceptado.
4. La semana empieza al confirmar. Al terminar vuelve a Free sin cobros y conserva el resumen real de su período.

## Regla técnica

- `pro_trials` (única por profesional), `startProTrial` y `bonus_pro_until` siguen siendo la única activación. El endpoint antiguo `POST /pro/acquisition/referrals/claim` pasa por el mismo inicio y las mismas validaciones.
- `activateReferral` confirma el alta y avisa una sola vez, sin escribir `bonus_pro_until` ni nuevas filas de `referral_rewards`.
- El registro bloquea el perfil de quien invita antes de contar invitaciones válidas. Solo registra tres; un cuarto enlace no bloquea el alta, pero no crea otra invitación. La prueba general sigue disponible si esa persona es elegible.
- Nunca a quien ya pagó, tiene PRO vigente, usó la prueba o recibió un premio histórico por referido, aunque haya vencido. Dos pestañas o dos endpoints no crean otra semana.
- `REFERRALS_ENABLED` controla los enlaces. La duración y disponibilidad de la prueba salen de `PRO_TRIAL_DAYS` (máximo siete) y `PRO_TRIAL_ENABLED`. `REFERRAL_REWARDS_ENABLED`, `REFERRAL_REWARD_DAYS` y `REFERRAL_MAX_REWARDS` se aceptan por compatibilidad, pero no habilitan días acumulables ni cambian el tope de tres.

## Históricos

No se recortan ni borran premios anteriores, vencimientos ni festejos pendientes. Las filas existentes conservan los días efectivamente otorgados; las invitaciones registradas pero sin premio pasan a la regla de prueba única. La pantalla distingue los premios anteriores y ya no promete otros días por invitar.

## Verificación

`phase6-acquisition.e2e-spec.ts`: tope concurrente, una semana para quien invita, activación independiente del colega, reintentos y premio anterior. `pro-trial.e2e-spec.ts`: preparación, ausencia de primer cliente, duración, concurrencia y resumen. `referral-progress`/ `referrals-panel`: navegación a Mi plan sin activar el beneficio al mostrar la invitación.
