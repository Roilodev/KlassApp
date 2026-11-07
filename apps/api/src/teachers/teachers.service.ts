import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service.js';
import { PasswordService } from '../auth/password.service.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface TeacherInvitationInput {
  email: string;
  displayName: string;
  phone: string;
  classIds: string[];
}

interface TeacherClass {
  id: string;
  year: number;
  grade: string;
  name: string;
}

export interface TeacherListItem {
  id: string;
  email: string;
  displayName: string;
  phone: string | null;
  status: 'active' | 'inactive' | 'pending';
  hasPhoto: boolean;
  classes: TeacherClass[];
  invitationExpiresAt: string | null;
}

@Injectable()
export class TeachersService {
  private readonly webOrigin: string;

  constructor(
    private readonly database: DatabaseService,
    private readonly passwords: PasswordService,
    config: ConfigService,
  ) {
    this.webOrigin = config.getOrThrow<string>('WEB_ORIGIN');
  }

  async list(schoolId: string): Promise<TeacherListItem[]> {
    const result = await this.database.query<{
      id: string;
      email: string;
      display_name: string;
      phone_e164: string | null;
      status: 'active' | 'inactive' | 'pending';
      has_photo: boolean;
      classes: TeacherClass[];
      invitation_expires_at: Date | null;
    }>(
      `SELECT users.id, users.email, users.display_name,
             school_memberships.phone_e164,
             CASE WHEN school_memberships.is_active
                  THEN 'active'::text ELSE 'inactive'::text END AS status,
             EXISTS (
               SELECT 1 FROM teacher_photos
               WHERE teacher_photos.school_id = school_memberships.school_id
                 AND teacher_photos.user_id = users.id
             ) AS has_photo,
             COALESCE(
                json_agg(
                  json_build_object(
                    'id', classes.id,
                    'year', academic_years.year,
                    'grade', grades.name,
                    'name', classes.name
                  )
                  ORDER BY academic_years.year DESC, grades.name, classes.name
                ) FILTER (WHERE classes.id IS NOT NULL),
                '[]'::json
              ) AS classes,
              NULL::timestamptz AS invitation_expires_at
       FROM school_memberships
       JOIN users ON users.id = school_memberships.user_id
       LEFT JOIN teacher_class_assignments
         ON teacher_class_assignments.school_id = school_memberships.school_id
        AND teacher_class_assignments.user_id = school_memberships.user_id
       LEFT JOIN classes
         ON classes.school_id = teacher_class_assignments.school_id
        AND classes.id = teacher_class_assignments.class_id
       LEFT JOIN academic_years
         ON academic_years.school_id = classes.school_id
        AND academic_years.id = classes.academic_year_id
       LEFT JOIN grades
         ON grades.school_id = classes.school_id
        AND grades.id = classes.grade_id
       WHERE school_memberships.school_id = $1
         AND school_memberships.role = 'teacher'
       GROUP BY users.id, school_memberships.school_id, school_memberships.is_active,
                school_memberships.phone_e164
       UNION ALL
       SELECT teacher_invitations.id, teacher_invitations.email,
              teacher_invitations.display_name, teacher_invitations.phone_e164,
              'pending'::text AS status,
              false AS has_photo,
              COALESCE(
                json_agg(
                  json_build_object(
                    'id', classes.id,
                    'year', academic_years.year,
                    'grade', grades.name,
                    'name', classes.name
                  )
                  ORDER BY academic_years.year DESC, grades.name, classes.name
                ) FILTER (WHERE classes.id IS NOT NULL),
                '[]'::json
              ) AS classes,
              teacher_invitations.expires_at AS invitation_expires_at
       FROM teacher_invitations
       LEFT JOIN LATERAL unnest(teacher_invitations.class_ids) AS assigned(class_id) ON true
       LEFT JOIN classes
         ON classes.school_id = teacher_invitations.school_id
        AND classes.id = assigned.class_id
       LEFT JOIN academic_years
         ON academic_years.school_id = classes.school_id
        AND academic_years.id = classes.academic_year_id
       LEFT JOIN grades
         ON grades.school_id = classes.school_id
        AND grades.id = classes.grade_id
       WHERE teacher_invitations.school_id = $1
         AND teacher_invitations.accepted_at IS NULL
         AND teacher_invitations.expires_at > now()
       GROUP BY teacher_invitations.id`,
      [schoolId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      phone: row.phone_e164,
      status: row.status,
      hasPhoto: row.has_photo,
      classes: row.classes,
      invitationExpiresAt: row.invitation_expires_at?.toISOString() ?? null,
    }));
  }

  async invite(
    schoolId: string,
    createdBy: string,
    input: TeacherInvitationInput,
  ): Promise<
    | { status: 'active'; displayName: string; email: string; phone: string }
    | { status: 'invited'; displayName: string; email: string; phone: string; invitationUrl: string; expiresAt: string }
  > {
    if (
      !input ||
      typeof input !== 'object' ||
      typeof input.email !== 'string' ||
      typeof input.displayName !== 'string' ||
      typeof input.phone !== 'string' ||
      !Array.isArray(input.classIds)
    ) {
      throw new BadRequestException('Informe nome, email, telefone e turmas do professor.');
    }

    const email = input.email.trim().toLowerCase();
    const displayName = input.displayName.trim();
    const phone = this.normalizeBrazilianPhone(input.phone);
    const classIds = [...new Set(input.classIds)];
    if (!EMAIL_PATTERN.test(email) || email.length > 254) {
      throw new BadRequestException('Informe um email válido.');
    }
    if (displayName.length < 1 || displayName.length > 160) {
      throw new BadRequestException('O nome deve ter entre 1 e 160 caracteres.');
    }
    if (!phone) {
      throw new BadRequestException('Informe um telefone brasileiro válido com DDD.');
    }
    if (
      classIds.length === 0 ||
      classIds.length > 100 ||
      classIds.some((id) => typeof id !== 'string' || !UUID_PATTERN.test(id))
    ) {
      throw new BadRequestException('Selecione ao menos uma turma válida.');
    }

    try {
      return await this.database.transaction(async (client) => {
      const classes = await client.query(
        'SELECT id FROM classes WHERE school_id = $1 AND id = ANY($2::uuid[])',
        [schoolId, classIds],
      );
      if (classes.rowCount !== classIds.length) {
        throw new BadRequestException('Uma ou mais turmas não pertencem a esta escola.');
      }

      const existing = await client.query<{
        id: string;
        display_name: string;
        membership_role: 'admin' | 'teacher' | null;
      }>(
        `SELECT users.id, users.display_name, school_memberships.role AS membership_role
         FROM users
         LEFT JOIN school_memberships
           ON school_memberships.user_id = users.id
          AND school_memberships.school_id = $2
         WHERE lower(users.email) = $1
         LIMIT 1
         FOR UPDATE OF users`,
        [email, schoolId],
      );

      const account = existing.rows[0];
      if (account) {
        if (account.membership_role === 'admin') {
          throw new ConflictException('Este email já pertence a uma pessoa administradora desta escola.');
        }

        if (account.membership_role === null) {
          await client.query(
            `INSERT INTO school_memberships (school_id, user_id, role, phone_e164)
             VALUES ($1, $2, 'teacher', $3)
             ON CONFLICT (school_id, user_id)
             DO UPDATE SET role = 'teacher', is_active = true,
                           phone_e164 = EXCLUDED.phone_e164`,
            [schoolId, account.id, phone],
          );
        } else {
          await client.query(
            `UPDATE school_memberships
             SET is_active = true, phone_e164 = $3
             WHERE school_id = $1 AND user_id = $2 AND role = 'teacher'`,
            [schoolId, account.id, phone],
          );
        }
        await this.assignClasses(client, schoolId, account.id, classIds);
        return {
          status: 'active',
          teacherId: account.id,
          displayName: account.display_name,
          email,
          phone,
        };
      }

      const token = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const tokenHash = createHash('sha256').update(token).digest('hex');
      const invitation = await client.query<{ id: string }>(
        `INSERT INTO teacher_invitations
           (school_id, email, display_name, phone_e164, token_hash, class_ids, created_by, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6::uuid[], $7, $8)
         ON CONFLICT (school_id, email) WHERE accepted_at IS NULL
         DO UPDATE SET
           display_name = EXCLUDED.display_name,
           phone_e164 = EXCLUDED.phone_e164,
           token_hash = EXCLUDED.token_hash,
           class_ids = EXCLUDED.class_ids,
           created_by = EXCLUDED.created_by,
           expires_at = EXCLUDED.expires_at
         RETURNING id`,
        [schoolId, email, displayName, phone, tokenHash, classIds, createdBy, expiresAt],
      );

      return {
        status: 'invited',
        invitationId: invitation.rows[0].id,
        displayName,
        email,
        phone,
        invitationUrl: `${this.webOrigin}/accept-invitation?token=${token}`,
        expiresAt: expiresAt.toISOString(),
      };
      });
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === '23505' &&
        'constraint' in error &&
        error.constraint === 'users_email_lower_unique'
      ) {
        throw new ConflictException(
          'Este email foi ativado recentemente. Atualize a lista de professores.',
        );
      }
      throw error;
    }
  }

  async previewInvitation(token: string): Promise<{
    email: string;
    displayName: string;
    schoolName: string;
  }> {
    const invitation = await this.database.query<{
      email: string;
      display_name: string;
      school_name: string;
    }>(
      `SELECT teacher_invitations.email, teacher_invitations.display_name,
              schools.name AS school_name
       FROM teacher_invitations
       JOIN schools ON schools.id = teacher_invitations.school_id
       WHERE teacher_invitations.token_hash = $1
         AND teacher_invitations.accepted_at IS NULL
         AND teacher_invitations.expires_at > now()`,
      [this.hashInvitationToken(token)],
    );
    const row = invitation.rows[0];
    if (!row) {
      throw new NotFoundException('Este convite é inválido ou expirou.');
    }
    return {
      email: row.email,
      displayName: row.display_name,
      schoolName: row.school_name,
    };
  }

  async acceptInvitation(
    token: string,
    password: string,
  ): Promise<{ email: string; schoolName: string }> {
    if (typeof token !== 'string' || !/^[0-9a-f]{64}$/i.test(token)) {
      throw new UnauthorizedException('Este convite é inválido ou expirou.');
    }
    if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
      throw new BadRequestException('A senha deve ter entre 12 e 128 caracteres.');
    }

    const tokenHash = this.hashInvitationToken(token);
    return this.database.transaction(async (client) => {
      const result = await client.query<{
        id: string;
        school_id: string;
        email: string;
        display_name: string;
        phone_e164: string;
        class_ids: string[];
        school_name: string;
      }>(
        `SELECT teacher_invitations.id, teacher_invitations.school_id,
                teacher_invitations.email, teacher_invitations.display_name,
                teacher_invitations.phone_e164,
                teacher_invitations.class_ids, schools.name AS school_name
         FROM teacher_invitations
         JOIN schools ON schools.id = teacher_invitations.school_id
         WHERE teacher_invitations.token_hash = $1
           AND teacher_invitations.accepted_at IS NULL
           AND teacher_invitations.expires_at > now()
         FOR UPDATE OF teacher_invitations`,
        [tokenHash],
      );
      const invitation = result.rows[0];
      if (!invitation) {
        throw new UnauthorizedException('Este convite é inválido ou expirou.');
      }

      const existingAccount = await client.query(
        'SELECT 1 FROM users WHERE lower(email) = $1 FOR UPDATE',
        [invitation.email],
      );
      if (existingAccount.rowCount) {
        throw new ConflictException(
          'Este email já possui uma conta. Peça à administração da escola para vincular o acesso existente.',
        );
      }

      const passwordHash = await this.passwords.hash(password);
      const user = await client.query<{ id: string }>(
        'INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id',
        [invitation.email, invitation.display_name],
      );
      const userId = user.rows[0].id;
      await client.query(
        'INSERT INTO password_credentials (user_id, password_hash) VALUES ($1, $2)',
        [userId, passwordHash],
      );
      await client.query(
        `INSERT INTO school_memberships (school_id, user_id, role, phone_e164)
         VALUES ($1, $2, 'teacher', $3)`,
        [invitation.school_id, userId, invitation.phone_e164],
      );
      await this.assignClasses(client, invitation.school_id, userId, invitation.class_ids);
      await client.query(
        'UPDATE teacher_invitations SET accepted_at = now() WHERE id = $1',
        [invitation.id],
      );

      return {
        email: invitation.email,
        schoolName: invitation.school_name,
      };
    });
  }

  private async assignClasses(
    client: PoolClient,
    schoolId: string,
    userId: string,
    classIds: string[],
  ): Promise<void> {
    await client.query(
      `INSERT INTO teacher_class_assignments (school_id, user_id, class_id)
       SELECT $1, $2, assigned.class_id
       FROM unnest($3::uuid[]) AS assigned(class_id)
       ON CONFLICT (school_id, user_id, class_id) DO NOTHING`,
      [schoolId, userId, classIds],
    );
  }

  private hashInvitationToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private normalizeBrazilianPhone(value: string): string | null {
    const digits = value.replace(/\D/g, '');
    const localDigits = digits.startsWith('55') ? digits.slice(2) : digits;
    if (!/^[1-9][0-9]{9,10}$/.test(localDigits)) {
      return null;
    }
    return `+55${localDigits}`;
  }
}
