import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthController } from './auth/auth.controller.js';
import { AuthGuard } from './auth/auth.guard.js';
import { AuthService } from './auth/auth.service.js';
import { PasswordService } from './auth/password.service.js';
import { RolesGuard } from './auth/roles.guard.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DatabaseModule } from './database/database.module.js';
import { SchoolStructureController } from './school-structure/school-structure.controller.js';
import { SchoolStructureService } from './school-structure/school-structure.service.js';
import { TeachersController } from './teachers/teachers.controller.js';
import { TeachersService } from './teachers/teachers.service.js';
import { StudentsController } from './students/students.controller.js';
import { StudentsService } from './students/students.service.js';
import { SchedulesController } from './schedules/schedules.controller.js';
import { SchedulesService } from './schedules/schedules.service.js';
import { EventsController } from './events/events.controller.js';
import { EventsService } from './events/events.service.js';
import { AssessmentsController } from './assessments/assessments.controller.js';
import { AssessmentsService } from './assessments/assessments.service.js';
import { BehaviorController } from './behavior/behavior.controller.js';
import { BehaviorService } from './behavior/behavior.service.js';
import { ProfilesController } from './profiles/profiles.controller.js';
import { ProfilesService } from './profiles/profiles.service.js';
import { DashboardController } from './dashboard/dashboard.controller.js';
import { DashboardService } from './dashboard/dashboard.service.js';
import { SubjectsController } from './subjects/subjects.controller.js';
import { SubjectsService } from './subjects/subjects.service.js';
import { SettingsController } from './settings/settings.controller.js';
import { SettingsService } from './settings/settings.service.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../.env',
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 30 }]),
    DatabaseModule,
  ],
  controllers: [
    AppController,
    AuthController,
    SchoolStructureController,
    TeachersController,
    StudentsController,
    SchedulesController,
    EventsController,
    AssessmentsController,
    BehaviorController,
    ProfilesController,
    DashboardController,
    SubjectsController,
    SettingsController,
  ],
  providers: [
    AppService,
    AuthService,
    AuthGuard,
    RolesGuard,
    PasswordService,
    SchoolStructureService,
    TeachersService,
    StudentsService,
    SchedulesService,
    EventsService,
    AssessmentsService,
    BehaviorService,
    ProfilesService,
    DashboardService,
    SubjectsService,
    SettingsService,
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
