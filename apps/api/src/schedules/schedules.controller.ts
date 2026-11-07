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
import { SchedulesService } from './schedules.service.js';
import type { CreateScheduleInput } from './schedules.service.js';

@Controller('schedules')
@UseGuards(RolesGuard)
@SchoolRoles('admin')
export class SchedulesController {
  constructor(private readonly schedules: SchedulesService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.schedules.list(request.user.schoolId);
  }

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Informe os dados do horário.');
    }
    return this.schedules.create(
      request.user.schoolId,
      request.user.id,
      body as CreateScheduleInput,
    );
  }

  @Patch(':id')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id') scheduleId: string,
    @Body() body: unknown,
  ) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Informe os dados do horário.');
    }
    return this.schedules.update(
      request.user.schoolId,
      request.user.id,
      scheduleId,
      body as CreateScheduleInput,
    );
  }

  @Delete(':id')
  remove(
    @Req() request: AuthenticatedRequest,
    @Param('id') scheduleId: string,
  ) {
    return this.schedules.remove(
      request.user.schoolId,
      request.user.id,
      scheduleId,
    );
  }
}
