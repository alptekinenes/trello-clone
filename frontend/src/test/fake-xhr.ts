import { vi } from 'vitest';

/** Stand-in for XMLHttpRequest: tests drive progress and the answer by hand. */
export class FakeXhr {
  static instances: FakeXhr[] = [];

  method = '';
  url = '';
  withCredentials = false;
  status = 0;
  responseText = '';
  headers: Record<string, string> = {};
  body: unknown = null;
  aborted = false;
  upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;

  constructor() {
    FakeXhr.instances.push(this);
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }

  send(body: unknown) {
    this.body = body;
  }

  abort() {
    this.aborted = true;
    this.onabort?.();
  }

  progress(loaded: number, total: number) {
    this.upload.onprogress?.({ lengthComputable: true, loaded, total } as ProgressEvent);
  }

  respond(status: number, body: unknown) {
    this.status = status;
    this.responseText = typeof body === 'string' ? body : JSON.stringify(body);
    this.onload?.();
  }

  fail() {
    this.onerror?.();
  }

  static get last(): FakeXhr {
    const instance = FakeXhr.instances.at(-1);
    if (!instance) throw new Error('No request was sent');
    return instance;
  }
}

/** Replaces XMLHttpRequest for the current test; call `restoreXhr` (or `vi.unstubAllGlobals`) after. */
export function installFakeXhr(): void {
  FakeXhr.instances = [];
  vi.stubGlobal('XMLHttpRequest', FakeXhr);
}

export function restoreXhr(): void {
  vi.unstubAllGlobals();
  FakeXhr.instances = [];
}
