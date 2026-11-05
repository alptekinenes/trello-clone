import { mkdir, readdir, rm } from 'node:fs/promises';

/** Directory of the e2e run (set in vitest.config.e2e.ts). */
export function uploadDir(): string {
  const dir = process.env.UPLOAD_DIR;
  if (!dir) throw new Error('UPLOAD_DIR is not set for the e2e run');
  return dir;
}

/** Empties the upload directory so a test sees only its own files. */
export async function resetUploads(): Promise<void> {
  await rm(uploadDir(), { recursive: true, force: true });
  await mkdir(uploadDir(), { recursive: true });
}

/** Names of the files currently stored. */
export async function storedFiles(): Promise<string[]> {
  return readdir(uploadDir());
}
