import { PasswordService } from './password.service.js';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('hashes a password without storing it as plain text', async () => {
    const hash = await service.hash('correct horse battery staple');

    expect(hash).not.toContain('correct horse battery staple');
    expect(await service.verify('correct horse battery staple', hash)).toBe(true);
    expect(await service.verify('incorrect password', hash)).toBe(false);
  });

  it('rejects malformed hashes', async () => {
    await expect(service.verify('password', 'not-a-hash')).resolves.toBe(false);
  });
});
