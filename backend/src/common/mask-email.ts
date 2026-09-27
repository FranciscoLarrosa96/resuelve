/** `fra••••@gmail.com`: nunca se muestra el email completo si no hace falta. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const visible = local.slice(0, Math.min(3, local.length));
  return `${visible}••••@${domain}`;
}
