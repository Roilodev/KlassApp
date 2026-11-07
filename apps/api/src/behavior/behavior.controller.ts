import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { SchoolRoles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { BehaviorService } from './behavior.service.js';
import type { CreateBehaviorRecordInput } from './behavior.service.js';

@Controller('behavior')
@UseGuards(RolesGuard)
@SchoolRoles('admin', 'teacher')
export class BehaviorController {
  constructor(private readonly behavior: BehaviorService) {}

  @Get('classes')
  listClasses(@Req() request: AuthenticatedRequest) {
    return this.behavior.listClasses(
      request.user.schoolId,
      request.user.id,
      request.user.role,
    );
  }

  @Get('classes/:classId/students')
  listStudents(
    @Req() request: AuthenticatedRequest,
    @Param('classId') classId: string,
  ) {
    return this.behavior.listStudents(
      request.user.schoolId,
      request.user.id,
      request.user.role,
      classId,
    );
  }

  @Get('students/:studentId/records')
  listRecords(
    @Req() request: AuthenticatedRequest,
    @Param('studentId') studentId: string,
  ) {
    return this.behavior.listRecords(
      request.user.schoolId,
      request.user.id,
      request.user.role,
      studentId,
    );
  }

  @Post('records')
  create(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Informe os dados da observação.');
    }
    return this.behavior.create(
      request.user.schoolId,
      request.user.id,
      request.user.role,
      body as CreateBehaviorRecordInput,
    );
  }
}
