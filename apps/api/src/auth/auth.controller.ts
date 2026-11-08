import {
  Body,
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import type { AuthenticatedRequest } from './auth.guard.js';
import { AUTH_SESSION_DURATION_SECONDS, AuthService } from './auth.service.js';
import { Public } from './public.decorator.js';

interface LoginBody {
  email?: unknown;
  password?: unknown;
}

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
  maxAge: AUTH_SESSION_DURATION_SECONDS * 1000,
};

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(
    @Body() body: LoginBody,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      typeof body.email !== 'string' ||
      typeof body.password !== 'string' ||
      body.email.length > 254 ||
      body.password.length > 128
    ) {
      throw new BadRequestException('Informe email e senha válidos.');
    }

    const result = await this.auth.login(body.email, body.password);
    response.cookie('klassapp_session', result.token, cookieOptions);
    return {
      user: result.user,
      memberships: result.memberships,
    };
  }

  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) response: Response): void {
    response.clearCookie('klassapp_session', cookieOptions);
  }

  @Get('me')
  getCurrentUser(@Req() request: AuthenticatedRequest) {
    return {
      user: {
        id: request.user.id,
        email: request.user.email,
        displayName: request.user.displayName,
      },
      school: {
        id: request.user.schoolId,
        name: request.user.schoolName,
        role: request.user.role,
      },
    };
  }
}
