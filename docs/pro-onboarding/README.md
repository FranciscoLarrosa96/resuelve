# Alta del profesional: capturas antes / después (390 px)

Capturas hechas con cuentas de prueba y una base local (nunca producción). Las hojas `antes-*` son `main` antes de este cambio; las `despues-*`, esta rama.

| Antes | Después |
|---|---|
| `antes-1-pasos.png` (registro, paso 3 con título vacío y "0", paso 4 casi vacío, paso 5 con datos repetidos) | `despues-1-pasos.png` (título sugerido, opcionales marcados, retoma al recargar, revisar sin duplicados, error con foco) |
| `antes-2-final.png` (contacto, bienvenida con "Compartir" primero, panel que repite foto y WhatsApp) | `despues-2-final.png` (contacto, bienvenida con un solo próximo paso, F5 → panel sin repetir la foto) |
| `antes-3-pendiente-y-pestana.png` (oficio sugerido, perfil pendiente con reseñas/invitar, pestaña nueva pierde todo) | `despues-3-pendiente.png` (sin título sugerido, revisar pendiente, bienvenida y panel sin reseñas ni invitar) |
| — | `despues-4-teclado-y-cuentas.png` (error por teclado con foco, otra cuenta arranca limpia, la cuenta A retoma, pestaña nueva retoma) |

Controles automáticos de cada pantalla modificada a 390 px (axe WCAG 2 A/AA, incluido contraste): sin violaciones, sin scroll horizontal, foco en el título del paso (`#onboarding-title`) o en el aviso de error (`#onboarding-error`). La única entrada de consola es el `ERR_FAILED` de la request que se bloqueó a propósito para probar el error al guardar.
