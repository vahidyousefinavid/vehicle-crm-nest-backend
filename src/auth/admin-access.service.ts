import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminPermission } from '../admins/admin-permission.entity';
import { User } from '../users/user.entity';
import { ALL_PERMISSIONS } from './permissions';

export interface EffectiveAccess {
  isSuper: boolean;
  permissions: string[];
}

/**
 * Resolves what an admin may do. Shared by the JWT strategy (every request) and
 * the admins module (the editor), so the two can never disagree about who is
 * super or what a grant means.
 */
@Injectable()
export class AdminAccessService {
  constructor(
    @InjectRepository(AdminPermission) private perms: Repository<AdminPermission>,
    @InjectRepository(User) private users: Repository<User>,
  ) {}

  /** The account seeded from ADMIN_PHONE — always super, never removable. */
  rootPhone(): string {
    return process.env.ADMIN_PHONE || '09182144790';
  }

  isRoot(user: Pick<User, 'phone'>): boolean {
    return user.phone === this.rootPhone();
  }

  async findRow(userId: string) {
    return this.perms.findOne({ where: { userId } });
  }

  async resolve(user: User): Promise<EffectiveAccess> {
    if (this.isRoot(user)) return { isSuper: true, permissions: ALL_PERMISSIONS };
    const row = await this.perms.findOne({ where: { userId: user.id } });
    if (!row) return { isSuper: false, permissions: [] };
    if (row.isSuper) return { isSuper: true, permissions: ALL_PERMISSIONS };
    return { isSuper: false, permissions: row.permissions ?? [] };
  }

  async setAccess(userId: string, input: { permissions?: string[]; isSuper?: boolean; note?: string; createdById?: string }) {
    let row = await this.perms.findOne({ where: { userId } });
    if (!row) row = this.perms.create({ userId, permissions: [], isSuper: false, createdById: input.createdById });
    if (input.permissions !== undefined) row.permissions = input.permissions;
    if (input.isSuper !== undefined) row.isSuper = input.isSuper;
    if (input.note !== undefined) row.note = input.note;
    return this.perms.save(row);
  }

  async remove(userId: string) {
    await this.perms.delete({ userId });
  }

  /**
   * Admins that predate the permission system had unrestricted access; leaving
   * them with no row would silently lock them out on the first deploy, so they
   * are grandfathered in with every current permission (adjustable afterwards),
   * while the root account is marked super.
   */
  async backfillExistingAdmins(): Promise<number> {
    const admins = await this.users.find({ where: { role: 'admin' } });
    let created = 0;
    for (const admin of admins) {
      const existing = await this.perms.findOne({ where: { userId: admin.id } });
      if (existing) continue;
      await this.perms.save(this.perms.create({
        userId: admin.id,
        isSuper: this.isRoot(admin),
        permissions: this.isRoot(admin) ? [] : ALL_PERMISSIONS,
        note: 'دسترسی خودکار برای مدیر موجود',
      }));
      created++;
    }
    return created;
  }
}
