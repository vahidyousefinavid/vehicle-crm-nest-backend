import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { CatalogItem, CatalogKind } from './catalog-item.entity';

export interface UpsertCatalogInput {
  kind?: CatalogKind;
  key?: string;
  name?: string;
  category?: string;
  unit?: string;
  suggestedPrice?: number;
  description?: string;
  serviceType?: string;
  customName?: string;
  supportsInShop?: boolean;
  supportsOnSite?: boolean;
  availableNow?: boolean;
  active?: boolean;
  sortOrder?: number;
}

const KINDS: CatalogKind[] = ['part', 'product', 'service'];

@Injectable()
export class CatalogService {
  constructor(@InjectRepository(CatalogItem) private repo: Repository<CatalogItem>) {}

  async list(params: { kind?: CatalogKind; category?: string; q?: string; active?: string; page: number; pageSize: number }) {
    const kind = params.kind && KINDS.includes(params.kind) ? params.kind : undefined;
    const limit = Math.min(Math.max(params.pageSize, 1), 200);

    const qb = this.repo.createQueryBuilder('c');
    if (kind) qb.andWhere('c.kind = :kind', { kind });
    if (params.category) qb.andWhere('c.category = :category', { category: params.category });
    if (params.active === 'true') qb.andWhere('c.active = true');
    if (params.active === 'false') qb.andWhere('c.active = false');
    if (params.q) {
      const needle = `%${params.q.trim()}%`;
      qb.andWhere(
        new Brackets((w) =>
          w.where('c.name ILIKE :needle', { needle })
            .orWhere('c.category ILIKE :needle', { needle })
            .orWhere('c.key ILIKE :needle', { needle })
            .orWhere('c."serviceType" ILIKE :needle', { needle })
            .orWhere('c."customName" ILIKE :needle', { needle }),
        ),
      );
    }

    const [items, total] = await qb
      .orderBy('c.kind', 'ASC')
      .addOrderBy('c.category', 'ASC')
      .addOrderBy('c.sortOrder', 'ASC')
      .addOrderBy('c.name', 'ASC')
      .skip((Math.max(params.page, 1) - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { total, page: params.page, pageSize: limit, items };
  }

  /** Category lists and per-kind counts, so the UI can build its filters in one call. */
  async meta() {
    const rows = await this.repo
      .createQueryBuilder('c')
      .select('c.kind', 'kind')
      .addSelect('c.category', 'category')
      .addSelect('COUNT(*)::int', 'count')
      .addSelect('COUNT(*) FILTER (WHERE c.active)::int', 'activeCount')
      .groupBy('c.kind')
      .addGroupBy('c.category')
      .orderBy('c.kind', 'ASC')
      .addOrderBy('COUNT(*)', 'DESC')
      .getRawMany<{ kind: CatalogKind; category: string; count: number; activeCount: number }>();

    const byKind = KINDS.map((kind) => {
      const categories = rows.filter((r) => r.kind === kind);
      return {
        kind,
        total: categories.reduce((s, c) => s + Number(c.count), 0),
        active: categories.reduce((s, c) => s + Number(c.activeCount), 0),
        categories: categories.map((c) => ({ category: c.category, count: Number(c.count) })),
      };
    });
    return { byKind };
  }

  async detail(id: string) {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('این آیتم پیدا نشد');
    return row;
  }

  async create(dto: UpsertCatalogInput) {
    const kind = dto.kind;
    if (!kind || !KINDS.includes(kind)) throw new BadRequestException('نوع آیتم نامعتبر است');
    if (!dto.category?.trim()) throw new BadRequestException('دسته‌بندی الزامی است');

    const name = this.resolveName(kind, dto);
    if (!name) throw new BadRequestException('نام آیتم الزامی است');

    const key = (dto.key?.trim() || (await this.generateKey(kind, name)));
    const clash = await this.repo.findOne({ where: { kind, key } });
    if (clash) throw new BadRequestException('این شناسه قبلاً استفاده شده است');

    const row = this.repo.create({
      kind,
      key,
      name,
      category: dto.category.trim(),
      unit: kind === 'service' ? null : (dto.unit?.trim() || 'عدد'),
      suggestedPrice: Number(dto.suggestedPrice) || 0,
      description: dto.description?.trim() || null,
      serviceType: kind === 'service' ? (dto.serviceType?.trim() || 'سایر') : null,
      customName: kind === 'service' ? (dto.customName?.trim() || null) : null,
      supportsInShop: kind === 'service' ? (dto.supportsInShop ?? true) : true,
      supportsOnSite: kind === 'service' ? (dto.supportsOnSite ?? false) : false,
      // خدمت تازه پیش‌فرض «به‌زودی» است تا چیزی بدون تصمیم صریح، موجود اعلام نشود.
      availableNow: kind === 'service' ? (dto.availableNow ?? false) : true,
      active: dto.active ?? true,
      sortOrder: Number(dto.sortOrder) || 0,
    });
    this.guardServiceModes(row);
    return this.repo.save(row);
  }

  async update(id: string, dto: UpsertCatalogInput) {
    const row = await this.detail(id);

    // The panel echoes the whole row back on save, nullable columns included, so
    // every field is read through a helper that treats null like "not sent"
    // rather than calling .trim() on it.
    const text = (v: string | undefined | null): string | undefined =>
      v === undefined || v === null ? undefined : v.trim();

    // kind and key are the contract the consumer app imports by; changing them
    // would orphan every shop that already imported the item.
    const category = text(dto.category);
    if (category !== undefined) {
      if (!category) throw new BadRequestException('دسته‌بندی الزامی است');
      row.category = category;
    }

    const unit = text(dto.unit);
    if (unit !== undefined && row.kind !== 'service') row.unit = unit || 'عدد';
    if (dto.suggestedPrice !== undefined) row.suggestedPrice = Number(dto.suggestedPrice) || 0;

    const description = text(dto.description);
    if (description !== undefined) row.description = description || null;
    if (dto.active !== undefined) row.active = dto.active;
    if (dto.sortOrder !== undefined) row.sortOrder = Number(dto.sortOrder) || 0;

    const name = text(dto.name);
    if (row.kind === 'service') {
      const serviceType = text(dto.serviceType);
      const customName = text(dto.customName);
      if (serviceType !== undefined) row.serviceType = serviceType || 'سایر';
      if (customName !== undefined) row.customName = customName || null;
      if (dto.supportsInShop !== undefined) row.supportsInShop = dto.supportsInShop;
      if (dto.supportsOnSite !== undefined) row.supportsOnSite = dto.supportsOnSite;
      if (dto.availableNow !== undefined) row.availableNow = dto.availableNow;
      row.name = row.customName || row.serviceType;
      if (name) row.name = name;
    } else if (name !== undefined) {
      if (!name) throw new BadRequestException('نام آیتم الزامی است');
      row.name = name;
    }

    this.guardServiceModes(row);
    return this.repo.save(row);
  }

  async setActive(id: string, active: boolean) {
    const row = await this.detail(id);
    row.active = active;
    return this.repo.save(row);
  }

  async remove(id: string) {
    const row = await this.detail(id);
    await this.repo.remove(row);
    return { ok: true };
  }

  /** Bulk activate/deactivate, used by the checkbox selection in the panel. */
  async bulkSetActive(ids: string[], active: boolean) {
    if (!ids?.length) return { updated: 0 };
    const res = await this.repo
      .createQueryBuilder()
      .update(CatalogItem)
      .set({ active })
      .whereInIds(ids)
      .execute();
    return { updated: res.affected ?? 0 };
  }

  private resolveName(kind: CatalogKind, dto: UpsertCatalogInput): string {
    if (kind === 'service') return (dto.customName?.trim() || dto.name?.trim() || dto.serviceType?.trim() || '');
    return dto.name?.trim() || '';
  }

  /** A service with neither mode selected can never be booked, so keep in-shop on. */
  private guardServiceModes(row: CatalogItem) {
    if (row.kind === 'service' && !row.supportsInShop && !row.supportsOnSite) row.supportsInShop = true;
  }

  /** Latin slug from a Persian name is useless, so fall back to a kind-prefixed counter. */
  private async generateKey(kind: CatalogKind, name: string): Promise<string> {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const prefix = kind === 'service' ? 's' : kind === 'product' ? 'p' : 'part';
    if (slug) {
      const candidate = `${prefix}-${slug}`.slice(0, 60);
      const taken = await this.repo.findOne({ where: { kind, key: candidate } });
      if (!taken) return candidate;
    }
    for (let i = 1; i < 10000; i++) {
      const candidate = `${prefix}-custom-${i}`;
      const taken = await this.repo.findOne({ where: { kind, key: candidate } });
      if (!taken) return candidate;
    }
    throw new BadRequestException('امکان ساخت شناسه یکتا نبود');
  }
}
