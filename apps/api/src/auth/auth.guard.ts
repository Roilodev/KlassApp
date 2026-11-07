import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import { AuthService, AuthenticatedUser } from './auth.service.js';

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}

function getSessionToken(cookieHeader?: string): string | undefined {
  return cookieHeader
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('klassapp_session='))
    ?.slice('klassapp_session='.length);
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = getSessionToken(request.headers.cookie);
    if (!token) {
      throw new UnauthorizedException('Faça login para continuar.');
    }

    const requestedSchoolId = request.header('x-school-id');
    request.user = await this.auth.authenticate(token, requestedSchoolId);
    return true;
  }
}
