import { Controller, Post, Get, Body, UseGuards, Request } from '@nestjs/common';
import { IsString } from 'class-validator';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PERMISSION_GROUPS } from './permissions';

class LoginDto {
  @IsString() phone: string;
  @IsString() password: string;
}

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.phone, dto.password);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Request() req) {
    const { id, phone, name, role, isSuper, permissions } = req.user;
    return { id, phone, name, role, isSuper, permissions, permissionGroups: PERMISSION_GROUPS };
  }
}
