import { BadRequestException, Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { SchoolRoles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { SettingsService } from './settings.service.js';

@Controller('settings')
@UseGuards(RolesGuard)
@SchoolRoles('admin')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('school-recess')
  getSchoolRecess(@Req() request: AuthenticatedRequest) {
    return this.settings.getSchoolRecess(request.user.schoolId);
  }

  @Put('school-recess')
  saveSchoolRecess(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Informe o horário do recreio.');
    }
    return this.settings.saveSchoolRecess(
      request.user.schoolId,
      request.user.id,
      body,
    );
  }
}
