import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SchoolRoles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { StudentsService } from './students.service.js';
import type { CreateStudentInput, StudentRecord } from './students.service.js';

@Controller('students')
@UseGuards(RolesGuard)
@SchoolRoles('admin')
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest): Promise<StudentRecord[]> {
    return this.students.list(request.user.schoolId);
  }

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<StudentRecord> {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Informe os dados do aluno e da matrícula.');
    }
    return this.students.create(
      request.user.schoolId,
      request.user.id,
      body as CreateStudentInput,
    );
  }
}
