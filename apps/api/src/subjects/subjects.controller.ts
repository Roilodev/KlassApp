import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { SchoolRoles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { SubjectsService } from './subjects.service.js';
import type { SaveSubjectInput } from './subjects.service.js';

@Controller('subjects')
@UseGuards(RolesGuard)
@SchoolRoles('admin', 'teacher')
export class SubjectsController {
  constructor(private readonly subjects: SubjectsService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.subjects.list(request.user.schoolId);
  }

  @Post()
  @SchoolRoles('admin')
  create(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Informe o nome da matéria.');
    }
    return this.subjects.create(
      request.user.schoolId,
      request.user.id,
      body as SaveSubjectInput,
    );
  }

  @Patch(':id')
  @SchoolRoles('admin')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id') subjectId: string,
    @Body() body: unknown,
  ) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Informe o nome da matéria.');
    }
    return this.subjects.update(
      request.user.schoolId,
      request.user.id,
      subjectId,
      body as SaveSubjectInput,
    );
  }

  @Delete(':id')
  @SchoolRoles('admin')
  remove(@Req() request: AuthenticatedRequest, @Param('id') subjectId: string) {
    return this.subjects.remove(request.user.schoolId, request.user.id, subjectId);
  }
}
