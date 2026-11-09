import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/public.decorator.js';
import { SchoolRoles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { TeachersService } from './teachers.service.js';
import type { TeacherInvitationInput, TeacherListItem } from './teachers.service.js';

@Controller()
export class TeachersController {
  constructor(private readonly teachers: TeachersService) {}

  @Get('teachers')
  @UseGuards(RolesGuard)
  @SchoolRoles('admin')
  list(@Req() request: AuthenticatedRequest): Promise<TeacherListItem[]> {
    return this.teachers.list(request.user.schoolId);
  }

  @Post('teachers/invitations')
  @UseGuards(RolesGuard)
  @SchoolRoles('admin')
  invite(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ): ReturnType<TeachersService['invite']> {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Informe nome, email e turmas do professor.');
    }
    return this.teachers.invite(
      request.user.schoolId,
      request.user.id,
      body as TeacherInvitationInput,
    );
  }

  @Patch('teachers/:id/subjects')
  @UseGuards(RolesGuard)
  @SchoolRoles('admin')
  updateSubjects(
    @Req() request: AuthenticatedRequest,
    @Param('id') teacherId: string,
    @Body() body: unknown,
  ) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Selecione as matérias do professor.');
    }
    return this.teachers.updateSubjects(
      request.user.schoolId,
      request.user.id,
      teacherId,
      body as { subjectIds: string[] },
    );
  }

  @Post('teachers/:id/classes')
  @UseGuards(RolesGuard)
  @SchoolRoles('admin')
  assignClass(
    @Req() request: AuthenticatedRequest,
    @Param('id') teacherId: string,
    @Body() body: unknown,
  ) {
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      !('classId' in body) ||
      typeof body.classId !== 'string'
    ) {
      throw new BadRequestException('Selecione uma turma válida.');
    }
    return this.teachers.assignClass(
      request.user.schoolId,
      request.user.id,
      teacherId,
      body.classId,
    );
  }

  @Post('teachers/invitations/:id/activate')
  @UseGuards(RolesGuard)
  @SchoolRoles('admin')
  activateInvitation(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      !('password' in body) ||
      typeof body.password !== 'string'
    ) {
      throw new BadRequestException('Informe uma senha de pelo menos 12 caracteres.');
    }
    return this.teachers.activateInvitation(
      request.user.schoolId,
      request.user.id,
      id,
      body.password,
    );
  }

  @Get('teacher-invitations/preview')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  preview(@Query('token') token: string) {
    if (typeof token !== 'string') {
      throw new BadRequestException('Convite inválido.');
    }
    return this.teachers.previewInvitation(token);
  }

  @Post('teacher-invitations/accept')
  @Public()
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  accept(@Body() body: unknown) {
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      !('token' in body) ||
      typeof body.token !== 'string' ||
      !('password' in body) ||
      typeof body.password !== 'string'
    ) {
      throw new BadRequestException('Informe o convite e uma senha válida.');
    }
    return this.teachers.acceptInvitation(body.token, body.password);
  }
}
