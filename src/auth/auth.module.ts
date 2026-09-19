import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { AdminPermission } from '../admins/admin-permission.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AdminAccessService } from './admin-access.service';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, AdminPermission]),
    PassportModule,
    JwtModule.register({
      secret: process.env.CRM_JWT_SECRET || 'vehicle-crm-secret-key',
      signOptions: { expiresIn: '12h' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AdminAccessService, JwtStrategy],
  exports: [AuthService, AdminAccessService],
})
export class AuthModule {}
