/**
 * Distribución de trabajos simultáneos en una columna de la agenda.
 *
 * Grupos de superposición: los bloques que se pisan (directa o
 * transitivamente) forman un grupo y comparten el ancho de la columna en
 * carriles. Cada bloque va al primer carril libre; todos los del grupo usan
 * la misma cantidad de carriles, así los anchos quedan parejos.
 *
 * "Se pisan" se mide con la altura VISIBLE: un trabajo de 15 minutos se
 * dibuja con una altura mínima, así que dos trabajos cortos seguidos también
 * se separan en carriles aunque sus horarios no se toquen.
 */
export interface LaneSlot {
  /** Carril del bloque, desde 0 (izquierda). */
  lane: number;
  /** Carriles del grupo al que pertenece (1 = ocupa todo el ancho). */
  lanes: number;
}

export interface TimedBlock {
  id: string;
  startMin: number;
  endMin: number;
}

export function layoutLanes(blocks: readonly TimedBlock[], minVisibleMinutes = 0): Map<string, LaneSlot> {
  const out = new Map<string, LaneSlot>();
  const sorted = [...blocks].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin || a.id.localeCompare(b.id));
  const visibleEnd = (b: TimedBlock) => Math.max(b.endMin, b.startMin + minVisibleMinutes);

  let group: { id: string; lane: number }[] = [];
  let laneEnds: number[] = [];
  let groupEnd = -Infinity;

  const closeGroup = () => {
    for (const { id, lane } of group) out.set(id, { lane, lanes: laneEnds.length });
    group = [];
    laneEnds = [];
    groupEnd = -Infinity;
  };

  for (const block of sorted) {
    if (block.startMin >= groupEnd) closeGroup();
    const end = visibleEnd(block);
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= block.startMin);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(end);
    } else {
      laneEnds[lane] = end;
    }
    group.push({ id: block.id, lane });
    groupEnd = Math.max(groupEnd, end);
  }
  closeGroup();
  return out;
}
