import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthService } from './auth.service';
import { AdminAccessService } from './admin-access.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private auth: AuthService, private access: AdminAccessService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.CRM_JWT_SECRET || 'vehicle-crm-secret-key',
    });
  }

  async validate(payload: { sub: string }) {
    const user = await this.auth.findById(payload.sub);
    // every endpoint in this app is admin-only, so a non-admin or deactivated
    // token must never pass, even if it was somehow issued by the consumer app
    if (!user || !user.active || user.role !== 'admin') throw new UnauthorizedException();

    // Permissions are read per request rather than baked into the token, so a
    // revoked grant takes effect immediately instead of at the next login.
    const { isSuper, permissions } = await this.access.resolve(user);
    return Object.assign(user, { isSuper, permissions });
  }
}
