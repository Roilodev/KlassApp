import { Injectable } from '@nestjs/common';
import { randomBytes, scrypt as callbackScrypt, timingSafeEqual } from 'node:crypto';

const KEY_LENGTH = 64;

function scrypt(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    callbackScrypt(password, salt, KEY_LENGTH, (error, derivedKey) => {
      if (error) {
        reject(error);
      } else {
        resolve(derivedKey);
      }
    });
  });
}

@Injectable()
export class PasswordService {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(16);
    const derivedKey = await scrypt(password, salt);
    return `scrypt$${salt.toString('hex')}$${derivedKey.toString('hex')}`;
  }

  async verify(password: string, encodedHash: string): Promise<boolean> {
    const [algorithm, saltHex, keyHex] = encodedHash.split('$');
    if (
      algorithm !== 'scrypt' ||
      !saltHex ||
      !/^[0-9a-f]{32}$/i.test(saltHex) ||
      !keyHex ||
      !/^[0-9a-f]{128}$/i.test(keyHex)
    ) {
      return false;
    }

    const expected = Buffer.from(keyHex, 'hex');
    if (expected.length !== KEY_LENGTH) {
      return false;
    }
    const actual = await scrypt(password, Buffer.from(saltHex, 'hex'));
    return timingSafeEqual(actual, expected);
  }
}
