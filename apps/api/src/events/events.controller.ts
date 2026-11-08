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
import { EventsService } from './events.service.js';
import type { CreateEventInput, EventDetailsInput } from './events.service.js';

@Controller('events')
@UseGuards(RolesGuard)
@SchoolRoles('admin')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get('next')
  @SchoolRoles('admin', 'teacher')
  next(@Req() request: AuthenticatedRequest) {
    return this.events.nextFor(
      request.user.schoolId,
      request.user.id,
      request.user.role,
    );
  }

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.events.list(request.user.schoolId);
  }

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Informe os dados do evento.');
    }
    return this.events.create(
      request.user.schoolId,
      request.user.id,
      body as CreateEventInput,
    );
  }

  @Patch(':id')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id') eventId: string,
    @Body() body: unknown,
  ) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Informe os dados do evento.');
    }
    return this.events.update(
      request.user.schoolId,
      request.user.id,
      eventId,
      body as EventDetailsInput,
    );
  }

  @Post(':id/publish')
  publish(
    @Req() request: AuthenticatedRequest,
    @Param('id') eventId: string,
  ) {
    return this.events.publish(request.user.schoolId, request.user.id, eventId);
  }

  @Delete(':id')
  cancel(
    @Req() request: AuthenticatedRequest,
    @Param('id') eventId: string,
  ) {
    return this.events.cancel(request.user.schoolId, request.user.id, eventId);
  }
}
