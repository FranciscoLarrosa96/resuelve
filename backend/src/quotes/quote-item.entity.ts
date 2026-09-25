import { Check, Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { moneyTransformer } from '../common/money/money';
import { Quote } from './quote.entity';

/** Material u otro concepto del presupuesto. */
@Entity('quote_items')
@Check('ck_quote_items_quantity', '"quantity" > 0')
@Check('ck_quote_items_unit_price', '"unit_price" >= 0')
export class QuoteItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  quoteId: string;

  @ManyToOne(() => Quote, (q) => q.items, { onDelete: 'CASCADE', orphanedRowAction: 'delete' })
  @JoinColumn({ name: 'quote_id' })
  quote: Quote;

  @Column({ length: 200 })
  description: string;

  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: moneyTransformer })
  quantity: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: moneyTransformer })
  unitPrice: string;
}
