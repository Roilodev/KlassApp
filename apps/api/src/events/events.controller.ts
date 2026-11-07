import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { SchoolRoles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { EventsService } from './events.service.js';
import type { CreateEventInput } from './events.service.js';

@Controller('events')
@UseGuards(RolesGuard)
@SchoolRoles('admin')
export class EventsController {
  constructor(private readonly events: EventsService) {}

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

  @Delete(':id')
  cancel(
    @Req() request: AuthenticatedRequest,
    @Param('id') eventId: string,
  ) {
    return this.events.cancel(request.user.schoolId, request.user.id, eventId);
  }
}
