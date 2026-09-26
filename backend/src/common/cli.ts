import { createInterface } from 'readline/promises';

/** Utilidades compartidas por los comandos de operación (verification:review, admin:grant). */

export interface CliArgs {
  command: string;
  id?: string;
  flags: Record<string, string | true>;
}

export function parseArgs(argv: string[]): CliArgs {
  const [command = 'help', ...rest] = argv;
  const flags: Record<string, string | true> = {};
  let id: string | undefined;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg.startsWith('--')) {
      const next = rest[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[arg.slice(2)] = next;
        i++;
      } else flags[arg.slice(2)] = true;
    } else if (!id) id = arg;
  }
  return { command, id, flags };
}

/** ¿La base es remota? (No se imprime ni el host ni la URL.) */
export function isRemoteDatabase(databaseUrl: string | undefined, nodeEnv = process.env.NODE_ENV): boolean {
  if (nodeEnv === 'production') return true;
  try {
    const host = new URL(databaseUrl ?? '').hostname;
    return !['localhost', '127.0.0.1', '::1', ''].includes(host);
  } catch {
    return true;
  }
}

/** Pide escribir `word` (p. ej. APPROVE) antes de modificar una base remota. */
export async function confirmWord(word: string): Promise<boolean> {
  if (!process.stdin.isTTY) {
    console.error(`Base remota: hace falta confirmar escribiendo ${word} en una terminal interactiva.`);
    return false;
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`Estás modificando producción. Escribí ${word} para continuar: `);
  rl.close();
  return answer.trim() === word;
}
