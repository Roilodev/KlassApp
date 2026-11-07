import { Test } from '@nestjs/testing';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { ProfilesController } from './profiles.controller.js';
import { ProfilesService } from './profiles.service.js';

describe('ProfilesController photo response', () => {
  it('serves stored JPEG bytes instead of serializing them as JSON', async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x10]);
    const profiles = {
      getPhoto: vi.fn().mockResolvedValue({ data: jpeg, mimeType: 'image/jpeg' }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [ProfilesController],
      providers: [{ provide: ProfilesService, useValue: profiles }],
    })
      .overrideGuard(RolesGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp: () => { getRequest: () => AuthenticatedRequest };
        }) => {
          const request = context.switchToHttp().getRequest();
          request.user = {
            id: 'admin-id',
            schoolId: 'school-id',
            role: 'admin',
          } as AuthenticatedRequest['user'];
          return true;
        },
      })
      .compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    try {
      const response = await request(app.getHttpServer())
        .get('/students/student-id/photo')
        .buffer(true)
        .parse((stream, callback) => {
          const chunks: Buffer[] = [];
          stream.on('data', (chunk: Buffer) => chunks.push(chunk));
          stream.on('end', () => callback(null, Buffer.concat(chunks)));
        })
        .expect(200)
        .expect('Content-Type', 'image/jpeg')
        .expect('Cache-Control', 'private, no-store');

      expect(response.body).toEqual(jpeg);
      expect(response.body.toString('utf8')).not.toContain('"type":"Buffer"');
      expect(profiles.getPhoto).toHaveBeenCalledWith(
        'student',
        'school-id',
        'student-id',
        'admin-id',
        'admin',
      );
    } finally {
      await app.close();
    }
  });
});
