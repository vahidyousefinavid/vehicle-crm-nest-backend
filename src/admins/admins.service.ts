import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '../users/user.entity';
import { AdminPermission } from './admin-permission.entity';
import { AdminAccessService } from '../auth/admin-access.service';
import { ALL_PERMISSIONS, PERMISSION_GROUPS, READ_ONLY_PERMISSIONS, isValidPermission } from '../auth/permissions';

export interface CreateAdminInput {
  phone: string;
  name: string;
  password: string;
  permissions?: string[];
  isSuper?: boolean;
  note?: string;
}

@Injectable()
export class AdminsService {
  constructor(
    @InjectRepository(User) private users: Repository<User>,
    @InjectRepository(AdminPermission) private perms: Repository<AdminPermission>,
    private access: AdminAccessService,
  ) {}

  catalogOfPermissions() {
    return { groups: PERMISSION_GROUPS, all: ALL_PERMISSIONS, readOnly: READ_ONLY_PERMISSIONS };
  }

  async list() {
    const admins = await this.users.find({ where: { role: 'admin' }, order: { createdAt: 'ASC' } });
    const rows = await this.perms.find();
    const byUser = new Map(rows.map((r) => [r.userId, r]));

    return {
      total: admins.length,
      items: admins.map((u) => {
        const row = byUser.get(u.id);
        const isRoot = this.access.isRoot(u);
        return {
          id: u.id,
          phone: u.phone,
          name: u.name,
          active: u.active,
          createdAt: u.createdAt,
          isRoot,
          isSuper: isRoot || !!row?.isSuper,
          permissions: isRoot || row?.isSuper ? ALL_PERMISSIONS : (row?.permissions ?? []),
          note: row?.note ?? null,
        };
      }),
    };
  }

  async detail(id: string) {
    const user = await this.requireAdmin(id);
    const row = await this.perms.findOne({ where: { userId: id } });
    const isRoot = this.access.isRoot(user);
    return {
      id: user.id, phone: user.phone, name: user.name, active: user.active, createdAt: user.createdAt,
      isRoot,
      isSuper: isRoot || !!row?.isSuper,
      permissions: isRoot || row?.isSuper ? ALL_PERMISSIONS : (row?.permissions ?? []),
      note: row?.note ?? null,
    };
  }

  async create(dto: CreateAdminInput, actorId: string) {
    const phone = dto.phone.trim();
    if (!/^09\d{9}$/.test(phone)) throw new BadRequestException('شماره موبایل باید ۱۱ رقم و با ۰۹ شروع شود');
    if (!dto.name?.trim()) throw new BadRequestException('نام مدیر الزامی است');
    if (!dto.password || dto.password.length < 6) throw new BadRequestException('رمز عبور باید حداقل ۶ کاراکتر باشد');

    const existing = await this.users.findOne({ where: { phone } });
    // An existing owner/mechanic/seller keeps their account and data; promoting
    // them is the only way to make a real person an admin without a duplicate row.
    if (existing && existing.role !== 'admin') {
      throw new BadRequestException(`این شماره متعلق به یک ${this.roleLabel(existing.role)} است. برای ارتقا از دکمه «ارتقا به مدیر» در صفحه همان کاربر استفاده کنید.`);
    }
    if (existing) throw new BadRequestException('این شماره قبلاً به‌عنوان مدیر ثبت شده است');

    const user = await this.users.save(this.users.create({
      phone,
      name: dto.name.trim(),
      role: 'admin',
      active: true,
      password: await bcrypt.hash(dto.password, 10),
    }));

    await this.access.setAccess(user.id, {
      permissions: this.sanitize(dto.permissions ?? READ_ONLY_PERMISSIONS),
      isSuper: !!dto.isSuper,
      note: dto.note,
      createdById: actorId,
    });

    return this.detail(user.id);
  }

  /** Turns an existing owner/mechanic/seller into an admin without touching their data. */
  async promote(userId: string, dto: { password?: string; permissions?: string[]; isSuper?: boolean }, actorId: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('کاربر پیدا نشد');
    if (user.role === 'admin') throw new BadRequestException('این کاربر از قبل مدیر است');
    if (!dto.password || dto.password.length < 6) throw new BadRequestException('برای ورود به پنل باید رمز عبور حداقل ۶ کاراکتری تعیین کنید');

    user.role = 'admin';
    user.active = true;
    user.password = await bcrypt.hash(dto.password, 10);
    await this.users.save(user);

    await this.access.setAccess(user.id, {
      permissions: this.sanitize(dto.permissions ?? READ_ONLY_PERMISSIONS),
      isSuper: !!dto.isSuper,
      createdById: actorId,
      note: 'ارتقا از کاربر عادی',
    });
    return this.detail(user.id);
  }

  async update(id: string, dto: { name?: string; password?: string; active?: boolean }, actor: User) {
    const user = await this.requireAdmin(id);
    await this.guardAccountEdit(user, actor);
    if (dto.active === false && user.id === actor.id) {
      throw new BadRequestException('نمی‌توانید حساب خودتان را غیرفعال کنید');
    }
    if (dto.name !== undefined) {
      if (!dto.name.trim()) throw new BadRequestException('نام نمی‌تواند خالی باشد');
      user.name = dto.name.trim();
    }
    if (dto.password) {
      if (dto.password.length < 6) throw new BadRequestException('رمز عبور باید حداقل ۶ کاراکتر باشد');
      user.password = await bcrypt.hash(dto.password, 10);
    }
    if (dto.active !== undefined) user.active = dto.active;
    await this.users.save(user);
    return this.detail(user.id);
  }

  async setPermissions(id: string, dto: { permissions?: string[]; isSuper?: boolean; note?: string }, actor: User) {
    const user = await this.requireAdmin(id);
    if (this.access.isRoot(user)) throw new ForbiddenException('دسترسی مدیر اصلی قابل تغییر نیست');
    if (user.id === actor.id) throw new BadRequestException('نمی‌توانید دسترسی خودتان را تغییر دهید');

    // Only a super admin can mint another one; otherwise an admin could grant
    // itself, via someone else, powers it does not hold.
    const wantsSuper = !!dto.isSuper;
    if (wantsSuper && !(await this.isActorSuper(actor))) {
      throw new ForbiddenException('فقط مدیر ارشد می‌تواند مدیر ارشد تعیین کند');
    }

    await this.access.setAccess(user.id, {
      permissions: wantsSuper ? [] : this.sanitize(dto.permissions ?? []),
      isSuper: wantsSuper,
      note: dto.note,
      createdById: actor.id,
    });
    return this.detail(user.id);
  }

  /**
   * Strips the admin role instead of deleting the account — the row may own
   * vehicles, invoices or reviews that must not cascade away.
   */
  async demote(id: string, actor: User) {
    const user = await this.requireAdmin(id);
    if (this.access.isRoot(user)) throw new ForbiddenException('حذف مدیر اصلی مجاز نیست');
    if (user.id === actor.id) throw new BadRequestException('نمی‌توانید حساب خودتان را حذف کنید');

    const remaining = await this.users.count({ where: { role: 'admin', active: true } });
    if (remaining <= 1) throw new BadRequestException('حداقل یک مدیر فعال باید باقی بماند');

    await this.access.remove(user.id);
    user.role = 'owner';
    user.password = null;
    await this.users.save(user);
    return { ok: true, id: user.id };
  }

  private async isActorSuper(actor: User) {
    return (await this.access.resolve(actor)).isSuper;
  }

  /**
   * Editing an admin's account means being able to set its password, which is
   * the same as becoming that admin. So `admins.manage` alone is not enough to
   * touch an account that outranks yours: only the root admin may edit root,
   * and only a super admin may edit another super admin. Everyone may always
   * edit their own account.
   */
  private async guardAccountEdit(target: User, actor: User) {
    if (target.id === actor.id) return;

    if (this.access.isRoot(target)) {
      throw new ForbiddenException('فقط مدیر اصلی می‌تواند حساب خودش را تغییر دهد');
    }

    const targetAccess = await this.access.resolve(target);
    if (targetAccess.isSuper && !(await this.isActorSuper(actor))) {
      throw new ForbiddenException('تغییر حساب یک مدیر ارشد فقط توسط مدیر ارشد ممکن است');
    }
  }

  private async requireAdmin(id: string) {
    const user = await this.users.findOne({ where: { id } });
    if (!user) throw new NotFoundException('کاربر پیدا نشد');
    if (user.role !== 'admin') throw new BadRequestException('این کاربر مدیر نیست');
    return user;
  }

  private sanitize(keys: string[]): string[] {
    return Array.from(new Set((keys || []).filter(isValidPermission)));
  }

  private roleLabel(role: string) {
    return { owner: 'مالک خودرو', mechanic: 'مکانیک', seller: 'فروشنده' }[role] || 'کاربر';
  }
}
