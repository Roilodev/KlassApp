import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Put,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { SchoolRoles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { ProfilesService } from './profiles.service.js';
import type {
  UpdateStudentProfileInput,
  UpdateTeacherProfileInput,
} from './profiles.service.js';

@Controller()
@UseGuards(RolesGuard)
@SchoolRoles('admin', 'teacher')
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  @Get('students/:id/profile')
  studentProfile(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.profiles.getStudentProfile(
      request.user.schoolId,
      request.user.id,
      request.user.role,
      id,
    );
  }

  @Patch('students/:id/profile')
  @SchoolRoles('admin')
  updateStudentProfile(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Informe os dados do aluno e dos responsáveis.');
    }
    return this.profiles.updateStudentProfile(
      request.user.schoolId,
      request.user.id,
      id,
      body as UpdateStudentProfileInput,
    );
  }

  @Get('students/:id/photo')
  async studentPhoto(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Res() response: Response,
  ): Promise<void> {
    const photo = await this.profiles.getPhoto(
      'student',
      request.user.schoolId,
      id,
      request.user.id,
      request.user.role,
    );
    response
      .status(200)
      .type(photo.mimeType)
      .set('Cache-Control', 'private, no-store')
      .set('X-Content-Type-Options', 'nosniff')
      .send(photo.data);
  }

  @Put('students/:id/photo')
  @SchoolRoles('admin')
  async saveStudentPhoto(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    const mimeType = request.headers['content-type'];
    if (typeof mimeType !== 'string') {
      throw new BadRequestException('Envie uma foto JPEG, PNG ou WebP.');
    }
    await this.profiles.savePhoto(
      'student',
      request.user.schoolId,
      request.user.id,
      id,
      mimeType,
      request.body,
      request.headers['x-photo-authorization-confirmed'] === 'true',
    );
    return { saved: true };
  }

  @Delete('students/:id/photo')
  @SchoolRoles('admin')
  async deleteStudentPhoto(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    await this.profiles.deletePhoto(
      'student',
      request.user.schoolId,
      request.user.id,
      id,
    );
    return { deleted: true };
  }

  @Get('teachers/:id/profile')
  @SchoolRoles('admin')
  teacherProfile(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.profiles.getTeacherProfile(request.user.schoolId, id);
  }

  @Patch('teachers/:id/profile')
  @SchoolRoles('admin')
  updateTeacherProfile(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Informe nome, email e turmas do professor.');
    }
    return this.profiles.updateTeacherProfile(
      request.user.schoolId,
      request.user.id,
      id,
      body as UpdateTeacherProfileInput,
    );
  }

  @Get('teachers/:id/photo')
  @SchoolRoles('admin')
  async teacherPhoto(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Res() response: Response,
  ): Promise<void> {
    const photo = await this.profiles.getPhoto(
      'teacher',
      request.user.schoolId,
      id,
      request.user.id,
      request.user.role,
    );
    response
      .status(200)
      .type(photo.mimeType)
      .set('Cache-Control', 'private, no-store')
      .set('X-Content-Type-Options', 'nosniff')
      .send(photo.data);
  }

  @Put('teachers/:id/photo')
  @SchoolRoles('admin')
  async saveTeacherPhoto(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    const mimeType = request.headers['content-type'];
    if (typeof mimeType !== 'string') {
      throw new BadRequestException('Envie uma foto JPEG, PNG ou WebP.');
    }
    await this.profiles.savePhoto(
      'teacher',
      request.user.schoolId,
      request.user.id,
      id,
      mimeType,
      request.body,
    );
    return { saved: true };
  }

  @Delete('teachers/:id/photo')
  @SchoolRoles('admin')
  async deleteTeacherPhoto(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    await this.profiles.deletePhoto(
      'teacher',
      request.user.schoolId,
      request.user.id,
      id,
    );
    return { deleted: true };
  }
}
