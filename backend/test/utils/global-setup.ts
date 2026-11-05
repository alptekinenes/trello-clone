import { rm } from 'node:fs/promises';

/** Removes the temporary upload directory when the whole e2e run is over. */
export default function globalSetup(): () => Promise<void> {
  return async () => {
    const dir = process.env.UPLOAD_DIR;
    if (dir) await rm(dir, { recursive: true, force: true });
  };
}
