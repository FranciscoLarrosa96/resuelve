/** Estilos compartidos por las páginas legales (`/privacidad`, `/terminos`): solo tokens semánticos. */
export const LEGAL_PAGE_STYLES = `
  :host { display: block; }
  .legal h2 { scroll-margin-top: 1.5rem; }
  .legal h3 { margin-top: 1.25rem; font-size: 16.5px; font-weight: 700; color: var(--color-ink); }
  .legal p, .legal li, .legal dd { font-size: 16px; line-height: 1.65; color: var(--color-ink-soft); }
  .legal p { margin-top: 0.75rem; }
  .legal ul { margin-top: 0.625rem; display: flex; flex-direction: column; gap: 0.375rem; padding-left: 1.25rem; list-style: disc; }
  .legal li::marker { color: var(--color-muted); }
  .legal strong, .legal dt { color: var(--color-ink); font-weight: 600; }
  .legal a:not(.plain) { color: var(--color-brand); font-weight: 600; text-decoration: underline; text-underline-offset: 2px; }
  .ph { border-radius: 0.3rem; background: var(--color-accent-soft); color: var(--color-accent-ink); padding: 0 0.3rem; font-weight: 600; white-space: nowrap; }
`;
