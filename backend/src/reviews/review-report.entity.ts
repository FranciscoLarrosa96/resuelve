import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Review } from './review.entity';

export const REPORT_REASONS = ['FAKE', 'OFFENSIVE', 'SPAM', 'OTHER'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export type ReportStatus = 'OPEN' | 'HIDDEN' | 'DISMISSED';

/** Reporte de una reseña pública. Una por persona y reseña; lo resuelve un administrador a mano. */
@Entity('review_reports')
@Index('uq_review_reports_review_reporter', ['reviewId', 'reporterId'], { unique: true })
@Index('IDX_review_reports_status', ['status', 'createdAt'])
export class ReviewReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  reviewId: string;

  @ManyToOne(() => Review, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'review_id' })
  review: Review;

  @Column('uuid')
  reporterId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reporter_id' })
  reporter: User;

  @Column({ type: 'varchar', length: 12 })
  reason: ReportReason;

  @Column({ type: 'varchar', length: 500, nullable: true })
  details: string | null;

  @Column({ type: 'varchar', length: 12, default: 'OPEN' })
  status: ReportStatus;

  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  resolvedBy: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
