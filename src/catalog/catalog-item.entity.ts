import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export type CatalogKind = 'part' | 'product' | 'service';

/**
 * The reference catalogue mechanics and sellers import from with one click.
 * It used to live in a hardcoded TypeScript file (catalog.data.ts), which meant
 * nobody could change a price or add an item without a redeploy. The table is
 * seeded from that file once and is the source of truth from then on.
 */
@Entity('catalog_items')
@Index(['kind', 'key'], { unique: true })
export class CatalogItem {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column() kind: CatalogKind;

  /** Stable identifier the consumer app imports by — never reused across kinds. */
  @Column() key: string;

  /** Display name. For a service this mirrors customName || serviceType. */
  @Column() name: string;

  @Column() category: string;

  @Column({ nullable: true }) unit: string;

  @Column({ type: 'real', default: 0 }) suggestedPrice: number;

  @Column({ type: 'text', nullable: true }) description: string;

  /* ── service-only columns ── */
  @Column({ nullable: true }) serviceType: string;
  @Column({ nullable: true }) customName: string;
  @Column({ default: true }) supportsInShop: boolean;
  @Column({ default: false }) supportsOnSite: boolean;

  /** Hidden from the consumer app without losing the row or its history. */
  /**
   * فرق «در کاتالوگ هست» با «همین حالا واقعاً ارائه می‌شود».
   * active یعنی ردیف در کاتالوگ دیده شود؛ availableNow یعنی مشتری می‌تواند
   * همین امروز سفارش بدهد. خدماتی که هنوز راه نیفتاده‌اند در کاتالوگ می‌مانند
   * تا خدمات‌دهنده بتواند از حالا به لیست خودش اضافه کند، ولی در اپ مشتری
   * با برچسب «به‌زودی» و بدون امکان سفارش نمایش داده می‌شوند.
   * پیش‌فرض false است تا هیچ خدمتی بدون تصمیم صریح «موجود» اعلام نشود.
   */
  @Column({ default: false }) availableNow: boolean;

  @Column({ default: true }) active: boolean;

  @Column({ type: 'int', default: 0 }) sortOrder: number;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
