import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'required_permission';

/** Guards a route behind one permission key. Super admins bypass the check. */
export const RequirePermission = (permission: string) => SetMetadata(PERMISSION_KEY, permission);
