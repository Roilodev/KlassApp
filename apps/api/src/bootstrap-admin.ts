import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { Pool } from 'pg';
import { PasswordService } from './auth/password.service.js';

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function readHidden(prompt: string): Promise<string> {
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
    throw new Error('Execute este comando em um terminal interativo para digitar a senha com segurança.');
  }

  stdout.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    const finish = (error?: Error) => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdout.write('\n');
      if (error) {
        reject(error);
      } else {
        resolve(value);
      }
    };
    const onData = (chunk: Buffer) => {
      for (const character of chunk.toString('utf8')) {
        if (character === '\u0003') {
          finish(new Error('Configuración cancelada.'));
          return;
        }
        if (character === '\r' || character === '\n') {
          finish();
          return;
        }
        if (character === '\u007f' || character === '\b') {
          if (value.length > 0) {
            value = value.slice(0, -1);
            stdout.write('\b \b');
          }
          continue;
        }
        value += character;
        stdout.write('*');
      }
    };
    stdin.on('data', onData);
  });
}

const prompts = createInterface({ input: stdin, output: stdout });
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL não definido. Configure o arquivo .env na raiz do projeto.');
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  const schoolName = (await prompts.question('Nome da escola: ')).trim();
  const displayName = (await prompts.question('Nome da pessoa administradora: ')).trim();
  const email = (await prompts.question('Email de acesso: ')).trim().toLowerCase();
  prompts.close();
  const password = await readHidden('Senha (mínimo 12 caracteres): ');

  if (schoolName.length < 2 || schoolName.length > 160) {
    throw new Error('O nome da escola deve ter entre 2 e 160 caracteres.');
  }
  if (displayName.length < 1 || displayName.length > 160) {
    throw new Error('Informe um nome válido para a pessoa administradora.');
  }
  if (!isValidEmail(email) || email.length > 254) {
    throw new Error('Informe um email válido.');
  }
  if (password.length < 12 || password.length > 128) {
    throw new Error('A senha deve ter entre 12 e 128 caracteres.');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      'SELECT 1 FROM school_memberships WHERE role = $1 AND is_active = true LIMIT 1',
      ['admin'],
    );
    if (existing.rowCount) {
      throw new Error('Já existe uma conta administradora. Não é necessário repetir a configuração inicial.');
    }

    const passwordHash = await new PasswordService().hash(password);
    const school = await client.query<{ id: string }>(
      'INSERT INTO schools (name) VALUES ($1) RETURNING id',
      [schoolName],
    );
    const user = await client.query<{ id: string }>(
      'INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id',
      [email, displayName],
    );
    await client.query(
      'INSERT INTO password_credentials (user_id, password_hash) VALUES ($1, $2)',
      [user.rows[0].id, passwordHash],
    );
    await client.query(
      'INSERT INTO school_memberships (school_id, user_id, role) VALUES ($1, $2, $3)',
      [school.rows[0].id, user.rows[0].id, 'admin'],
    );
    await client.query('COMMIT');
    console.log(`Escola configurada. Acesse com ${email}.`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
} finally {
  prompts.close();
  await pool.end();
}
