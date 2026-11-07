import {
  BadRequestException,
  Body,
  Controller,
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
import { SchoolStructureService } from './school-structure.service.js';
import type { CreateSchoolClassInput } from './school-structure.service.js';

@Controller('school-structure')
@UseGuards(RolesGuard)
@SchoolRoles('admin')
export class SchoolStructureController {
  constructor(private readonly schoolStructure: SchoolStructureService) {}

  @Get('classes')
  listClasses(@Req() request: AuthenticatedRequest) {
    return this.schoolStructure.listClasses(request.user.schoolId);
  }

  @Post('classes')
  createClass(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Informe o ano, o ano escolar e a turma.');
    }
    return this.schoolStructure.createClass(
      request.user.schoolId,
      body as CreateSchoolClassInput,
    );
  }

  @Patch('classes/:id')
  updateClass(
    @Req() request: AuthenticatedRequest,
    @Param('id') classId: string,
    @Body() body: unknown,
  ) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Informe o ano, o ano escolar e a turma.');
    }
    return this.schoolStructure.updateClass(
      request.user.schoolId,
      request.user.id,
      classId,
      body as CreateSchoolClassInput,
    );
  }
}
