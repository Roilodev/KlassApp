import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { SchoolRoles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { DashboardService } from './dashboard.service.js';

@Controller('dashboard')
@UseGuards(RolesGuard)
@SchoolRoles('admin', 'teacher')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  summary(@Req() request: AuthenticatedRequest) {
    return this.dashboard.getSummary(
      request.user.schoolId,
      request.user.id,
      request.user.role,
    );
  }
}
