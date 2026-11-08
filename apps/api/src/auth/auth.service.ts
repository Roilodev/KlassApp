import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { jwtVerify, SignJWT } from 'jose';
import { DatabaseService } from '../database/database.service.js';
import { PasswordService } from './password.service.js';

export const AUTH_SESSION_DURATION_SECONDS = 60 * 60;

export interface SchoolMembership {
  schoolId: string;
  schoolName: string;
  role: 'admin' | 'teacher';
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  schoolId: string;
  schoolName: string;
  role: 'admin' | 'teacher';
}

interface LoginResult {
  token: string;
  user: {
    id: string;
    email: string;
    displayName: string;
  };
  memberships: SchoolMembership[];
}

@Injectable()
export class AuthService {
  private readonly signingKey: Uint8Array;

  constructor(
    private readonly database: DatabaseService,
    private readonly passwords: PasswordService,
    config: ConfigService,
  ) {
    const secret = config.getOrThrow<string>('AUTH_SECRET');
    if (Buffer.byteLength(secret, 'utf8') < 32) {
      throw new Error('AUTH_SECRET must contain at least 32 bytes.');
    }
    this.signingKey = new TextEncoder().encode(secret);
  }

  async login(email: string, password: string): Promise<LoginResult> {
    const result = await this.database.query<{
      id: string;
      email: string;
      display_name: string;
      password_hash: string | null;
    }>(
      `SELECT users.id, users.email, users.display_name, password_credentials.password_hash
       FROM users
       LEFT JOIN password_credentials ON password_credentials.user_id = users.id
       WHERE lower(users.email) = lower($1)
       LIMIT 1`,
      [email.trim()],
    );
    const account = result.rows[0];
    const validPassword = account?.password_hash
      ? await this.passwords.verify(password, account.password_hash)
      : await this.passwords.verify(
          password,
          'scrypt$00000000000000000000000000000000$00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
        );
    if (!account || !validPassword) {
      throw new UnauthorizedException('Email ou senha inválidos.');
    }

    const memberships = await this.listMemberships(account.id);
    if (memberships.length === 0) {
      throw new UnauthorizedException('Email ou senha inválidos.');
    }

    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(account.id)
      .setIssuedAt()
      .setExpirationTime(`${AUTH_SESSION_DURATION_SECONDS}s`)
      .sign(this.signingKey);

    return {
      token,
      user: {
        id: account.id,
        email: account.email,
        displayName: account.display_name,
      },
      memberships,
    };
  }

  async authenticate(token: string, requestedSchoolId?: string): Promise<AuthenticatedUser> {
    let userId: string;
    try {
      const verified = await jwtVerify(token, this.signingKey, {
        algorithms: ['HS256'],
      });
      if (typeof verified.payload.sub !== 'string') {
        throw new Error('Missing subject');
      }
      userId = verified.payload.sub;
    } catch {
      throw new UnauthorizedException('Sessão inválida ou expirada.');
    }

    const account = await this.database.query<{
      email: string;
      display_name: string;
    }>(
      'SELECT email, display_name FROM users WHERE id = $1',
      [userId],
    );
    const user = account.rows[0];
    if (!user) {
      throw new UnauthorizedException('Sessão inválida ou expirada.');
    }

    const memberships = await this.listMemberships(userId);
    if (memberships.length === 0) {
      throw new ForbiddenException('Esta conta não possui acesso ativo a uma escola.');
    }

    let membership: SchoolMembership | undefined;
    if (requestedSchoolId) {
      membership = memberships.find((item) => item.schoolId === requestedSchoolId);
      if (!membership) {
        throw new ForbiddenException('Você não tem acesso a esta escola.');
      }
    } else if (memberships.length === 1) {
      membership = memberships[0];
    } else {
      throw new ForbiddenException('Selecione uma escola para continuar.');
    }

    return {
      id: userId,
      email: user.email,
      displayName: user.display_name,
      schoolId: membership.schoolId,
      schoolName: membership.schoolName,
      role: membership.role,
    };
  }

  async listMemberships(userId: string): Promise<SchoolMembership[]> {
    const result = await this.database.query<{
      school_id: string;
      school_name: string;
      role: 'admin' | 'teacher';
    }>(
      `SELECT school_memberships.school_id, schools.name AS school_name, school_memberships.role
       FROM school_memberships
       JOIN schools ON schools.id = school_memberships.school_id
       WHERE school_memberships.user_id = $1
         AND school_memberships.is_active = true
       ORDER BY schools.name`,
      [userId],
    );
    return result.rows.map((row) => ({
      schoolId: row.school_id,
      schoolName: row.school_name,
      role: row.role,
    }));
  }
}
