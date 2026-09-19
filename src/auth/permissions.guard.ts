import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY } from './require-permission.decorator';
import { PERMISSION_LABEL } from './permissions';

/**
 * Runs after JwtAuthGuard, which has already put the admin (and the permission
 * set resolved from admin_permissions) on the request. A route with no
 * @RequirePermission is open to any authenticated admin.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string | undefined>(PERMISSION_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required) return true;

    const user = ctx.switchToHttp().getRequest().user;
    if (!user) throw new ForbiddenException();
    if (user.isSuper) return true;
    if (Array.isArray(user.permissions) && user.permissions.includes(required)) return true;

    throw new ForbiddenException(`دسترسی «${PERMISSION_LABEL[required] || required}» برای حساب شما فعال نیست`);
  }
}
