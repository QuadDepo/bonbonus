import { describe, expect, it } from 'vitest';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const execFile = promisify(execFileCb);

const runCli = async (args: string[]) => {
  try {
    const { stdout, stderr } = await execFile('npx', ['tsx', 'src/cli.ts', 'extract', ...args], {
      cwd: process.cwd(),
      maxBuffer: 10 * 1024 * 1024,
      env: {
        ...process.env,
        BONBONUS_CONCURRENCY: '20',
      },
    });

    return { stdout, stderr, exitCode: 0 };
  } catch (error: any) {
    return {
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? '',
      exitCode: error.code ?? 1,
    };
  }
};

describe('cli format flag', { timeout: 120000 }, () => {
  it('defaults to json output', async () => {
    const result = await runCli([]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim().startsWith('{')).toBe(true);
  });

  it('supports csv output to stdout', async () => {
    const result = await runCli(['--format', 'csv']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      'id,gtin,title,subtitle,priceText,bonusMechanic,validFrom,validUntil,imageUrl,productSize,category,url,sourcePageUrl,sourcePageTitle,tag_bonus,tag_vandaag,tag_available_in_store,tag_nutriscore_b,tag_nutriscore_c',
    );
  });

  it('supports csv output to file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bonbonus-cli-'));
    const target = join(dir, 'bonus.csv');

    const result = await runCli(['--format', 'csv', '--output', target]);
    const file = await readFile(target, 'utf8');

    expect(result.exitCode).toBe(0);
    expect(file.startsWith('id,gtin,title,subtitle,priceText')).toBe(true);
  });

  it('rejects invalid format values', async () => {
    const result = await runCli(['--format', 'xml']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Usage: bonbonus extract');
  });
});
