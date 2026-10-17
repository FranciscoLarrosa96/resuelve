import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * PENDING: recibida sin sesión, sin verificar. LINKED: un admin verificó la identidad y la vinculó
 * con un pago (queda como solicitud registrada sobre ese pago, con la fecha ORIGINAL). RESOLVED: el
 * arrepentimiento de ese pago se resolvió. DISMISSED: no se pudo vincular (con nota interna).
 */
export enum WithdrawalContactStatus {
  PENDING = 'PENDING',
  LINKED = 'LINKED',
  RESOLVED = 'RESOLVED',
  DISMISSED = 'DISMISSED',
}

/**
 * Solicitud de arrepentimiento enviada por quien no puede ingresar a su cuenta. Guarda lo mínimo para
 * localizar la contratación y contactar a la persona. NO se cruza con cuentas al recibirla: registrarla no
 * revela ni confirma nada, y no modifica accesos, pagos ni devoluciones.
 */
@Entity('withdrawal_contact_requests')
export class WithdrawalContactRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Código de la solicitud (`ARR-XXXXXX`): el comprobante que se muestra al enviarla. */
  @Index('UQ_withdrawal_contact_requests_code', { unique: true })
  @Column({ length: 12 })
  code: string;

  @Column({ length: 120 })
  name: string;

  @Column({ length: 254 })
  email: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone: string | null;

  /** Código `RES-XXXXXX` que dice tener (sin validar ni buscar al recibirla). */
  @Column({ type: 'varchar', length: 20, nullable: true })
  paymentReference: string | null;

  /** Lo que recuerda del pago (fecha, monto, plan): ayuda al admin a localizarlo. */
  @Column({ type: 'varchar', length: 500, nullable: true })
  note: string | null;

  @Column({ type: 'varchar', length: 12, default: WithdrawalContactStatus.PENDING })
  status: WithdrawalContactStatus;

  /** Fecha y hora del SERVIDOR al recibirla: la que cuenta para evaluar el plazo. */
  @Column({ type: 'timestamptz', default: () => 'now()' })
  requestedAt: Date;

  @Column({ type: 'uuid', nullable: true })
  linkedPaymentId: string | null;

  @Column({ type: 'uuid', nullable: true })
  handledByUserId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  handledAt: Date | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  adminNote: string | null;
}
