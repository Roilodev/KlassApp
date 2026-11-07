import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { SchoolRoles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { AssessmentsService } from './assessments.service.js';
import type {
  CreateAssessmentInput,
  RecordAssessmentResultInput,
} from './assessments.service.js';

@Controller('assessments')
@UseGuards(RolesGuard)
@SchoolRoles('admin', 'teacher')
export class AssessmentsController {
  constructor(private readonly assessments: AssessmentsService) {}

  @Get('classes')
  listClasses(@Req() request: AuthenticatedRequest) {
    return this.assessments.listClasses(
      request.user.schoolId,
      request.user.id,
      request.user.role,
    );
  }

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.assessments.list(
      request.user.schoolId,
      request.user.id,
      request.user.role,
    );
  }

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Informe os dados da avaliação.');
    }
    return this.assessments.create(
      request.user.schoolId,
      request.user.id,
      request.user.role,
      body as CreateAssessmentInput,
    );
  }

  @Get(':id/students')
  listStudentResults(
    @Req() request: AuthenticatedRequest,
    @Param('id') assessmentId: string,
  ) {
    return this.assessments.listStudentResults(
      request.user.schoolId,
      request.user.id,
      request.user.role,
      assessmentId,
    );
  }

  @Put(':id/results')
  recordResult(
    @Req() request: AuthenticatedRequest,
    @Param('id') assessmentId: string,
    @Body() body: unknown,
  ) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Informe o aluno e a pontuação.');
    }
    return this.assessments.recordResult(
      request.user.schoolId,
      request.user.id,
      request.user.role,
      assessmentId,
      body as RecordAssessmentResultInput,
    );
  }
}
