/**
 * Shared CLI I/O helpers for the run* command handlers and the per-command
 * dispatcher modules. Keeps output (stdout/file writes) and the
 * error-and-exit convention identical across commands.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export const writeOutput = async (body: string, outputPath: string | undefined): Promise<void> => {
  if (outputPath) {
    const absolutePath = resolve(process.cwd(), outputPath);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, body + '\n', 'utf8');
  } else {
    process.stdout.write(body + '\n');
  }
};

export const fail = (message: string, usage: string): never => {
  console.error(message);
  console.error(usage);
  process.exit(1);
};
