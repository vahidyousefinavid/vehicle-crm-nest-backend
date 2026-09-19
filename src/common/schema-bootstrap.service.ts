import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PRESET_PARTS, PRESET_PRODUCTS, PRESET_SERVICES } from '../catalog/catalog.seed-data';

/**
 * This service never owns the shared schema — vehicle/service does, with
 * synchronize: true — but the two tables added for the admin panel are the
 * panel's own. Creating them here (idempotently, matching exactly what
 * synchronize would emit) means the panel works whichever service deploys
 * first, and never rewrites a column the consumer app owns.
 */
@Injectable()
export class SchemaBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(SchemaBootstrapService.name);

  constructor(private ds: DataSource) {}

  async onModuleInit() {
    await this.ensureTables();
    await this.seedCatalog();
  }

  private async ensureTables() {
    await this.ds.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await this.ds.query(`
      CREATE TABLE IF NOT EXISTS catalog_items (
        id uuid NOT NULL DEFAULT uuid_generate_v4(),
        kind character varying NOT NULL,
        key character varying NOT NULL,
        name character varying NOT NULL,
        category character varying NOT NULL,
        unit character varying,
        "suggestedPrice" real NOT NULL DEFAULT 0,
        description text,
        "serviceType" character varying,
        "customName" character varying,
        "supportsInShop" boolean NOT NULL DEFAULT true,
        "supportsOnSite" boolean NOT NULL DEFAULT false,
        "availableNow" boolean NOT NULL DEFAULT false,
        active boolean NOT NULL DEFAULT true,
        "sortOrder" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_catalog_items" PRIMARY KEY (id)
      )
    `);
    await this.ds.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_catalog_items_kind_key" ON catalog_items (kind, key)
    `);
    // جدول از قبل ساخته شده بود، پس ستون تازه باید جداگانه هم اضافه شود.
    await this.ds.query(`
      ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS "availableNow" boolean NOT NULL DEFAULT false
    `);

    await this.ds.query(`
      CREATE TABLE IF NOT EXISTS admin_permissions (
        id uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        permissions text NOT NULL DEFAULT '',
        "isSuper" boolean NOT NULL DEFAULT false,
        "createdById" uuid,
        note character varying,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_admin_permissions" PRIMARY KEY (id)
      )
    `);
    await this.ds.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_admin_permissions_userId" ON admin_permissions ("userId")
    `);
    // Added separately so a re-run against an existing table is a no-op rather than an error.
    await this.ds.query(`
      DO $$ BEGIN
        ALTER TABLE admin_permissions
          ADD CONSTRAINT "FK_admin_permissions_user"
          FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);
  }

  /**
   * One-time transfer of the hardcoded preset lists into the table. Keyed on
   * (kind, key) and skipped entirely once rows exist, so an admin's later edit
   * or deletion is never resurrected by a restart.
   */
  private async seedCatalog() {
    const [{ count }] = await this.ds.query(`SELECT COUNT(*)::int AS count FROM catalog_items`);
    if (count > 0) return;

    const rows: any[][] = [];
    PRESET_PARTS.forEach((p, i) =>
      rows.push(['part', p.key, p.name, p.category, p.unit, p.suggestedPrice, null, null, null, true, false, i]));
    PRESET_PRODUCTS.forEach((p, i) =>
      rows.push(['product', p.key, p.name, p.category, p.unit, p.suggestedPrice, p.description ?? null, null, null, true, false, i]));
    PRESET_SERVICES.forEach((s, i) =>
      rows.push(['service', s.key, s.customName || s.serviceType, s.category, null, s.suggestedPrice, null,
        s.serviceType, s.customName ?? null, s.supportsInShop, s.supportsOnSite, i]));

    const values = rows
      .map((_, r) => `(${Array.from({ length: 12 }, (_, c) => `$${r * 12 + c + 1}`).join(',')})`)
      .join(',');

    await this.ds.query(
      `INSERT INTO catalog_items
        (kind, key, name, category, unit, "suggestedPrice", description, "serviceType", "customName", "supportsInShop", "supportsOnSite", "sortOrder")
       VALUES ${values}
       ON CONFLICT (kind, key) DO NOTHING`,
      rows.flat(),
    );
    this.logger.log(`Seeded catalog_items with ${rows.length} preset rows`);
  }
}
