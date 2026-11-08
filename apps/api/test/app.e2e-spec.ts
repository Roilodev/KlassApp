import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { vi } from 'vitest';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://test:test@localhost:5432/test');
    vi.stubEnv('AUTH_SECRET', 'test-auth-secret-with-at-least-32-bytes');
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok', service: 'klassapp-api' });
  });

  it('protects authenticated routes by default', () => {
    return request(app.getHttpServer())
      .get('/auth/me')
      .expect(401);
  });

  it('protects weekly schedule routes by default', async () => {
    await request(app.getHttpServer()).get('/schedules').expect(401);
    await request(app.getHttpServer()).post('/schedules').send({}).expect(401);
    await request(app.getHttpServer()).delete('/schedules/not-a-uuid').expect(401);
  });

  it('protects school event routes by default', async () => {
    await request(app.getHttpServer()).get('/events').expect(401);
    await request(app.getHttpServer()).post('/events').send({}).expect(401);
    await request(app.getHttpServer()).delete('/events/not-a-uuid').expect(401);
  });

  it('protects assessment routes by default', async () => {
    await request(app.getHttpServer()).get('/assessments/classes').expect(401);
    await request(app.getHttpServer()).get('/assessments').expect(401);
    await request(app.getHttpServer())
      .get('/assessments/not-a-uuid/students')
      .expect(401);
    await request(app.getHttpServer())
      .post('/assessments')
      .send({})
      .expect(401);
    await request(app.getHttpServer())
      .put('/assessments/not-a-uuid/results')
      .send({})
      .expect(401);
  });

  it('protects behavior records and student history by default', async () => {
    await request(app.getHttpServer()).get('/behavior/classes').expect(401);
    await request(app.getHttpServer())
      .get('/behavior/classes/not-a-uuid/students')
      .expect(401);
    await request(app.getHttpServer())
      .get('/behavior/students?q=student')
      .expect(401);
    await request(app.getHttpServer())
      .get('/behavior/students/not-a-uuid/records')
      .expect(401);
    await request(app.getHttpServer())
      .post('/behavior/records')
      .send({})
      .expect(401);
  });

  it('protects student and teacher profiles and photos by default', async () => {
    await request(app.getHttpServer()).get('/students/not-a-uuid/profile').expect(401);
    await request(app.getHttpServer()).get('/students/not-a-uuid/photo').expect(401);
    await request(app.getHttpServer())
      .put('/students/not-a-uuid/photo')
      .set('Content-Type', 'image/jpeg')
      .send(Buffer.from([0xff, 0xd8, 0xff]))
      .expect(401);
    await request(app.getHttpServer()).get('/teachers/not-a-uuid/profile').expect(401);
    await request(app.getHttpServer()).get('/teachers/not-a-uuid/photo').expect(401);
  });

  it('rejects malformed login bodies before accessing the database', () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({})
      .expect(400);
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });
});
