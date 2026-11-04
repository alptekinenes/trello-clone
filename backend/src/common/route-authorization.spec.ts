import { PATH_METADATA } from '@nestjs/common/constants.js';
import { AppModule } from '../app.module.js';
import { BOARD_ROLE_KEY } from '../access/board-access.guard.js';
import { IS_PUBLIC_KEY } from './decorators/public.decorator.js';

type Constructor = abstract new (...args: never[]) => unknown;

/**
 * Routes with neither @BoardRole nor @Public. Each one only touches data owned by the
 * caller (`@CurrentUser()`), or is authorized by a secret in the URL (invitation token).
 */
const OWNERSHIP_SCOPED = new Set([
  'BoardsController.list',
  'BoardsController.create',
  'UsersController.me',
  'UsersController.updateMe',
  'InvitationsController.accept',
]);

function metadataOf(key: string, target: object): unknown {
  return Reflect.getMetadata(key, target);
}

function collectControllers(module: Constructor, seen = new Set<Constructor>()): Constructor[] {
  if (seen.has(module)) return [];
  seen.add(module);
  const own = (metadataOf('controllers', module) as Constructor[] | undefined) ?? [];
  const imports = (metadataOf('imports', module) as Constructor[] | undefined) ?? [];
  return [...own, ...imports.flatMap((child) => collectControllers(child, seen))];
}

function routeHandlers(controller: Constructor): { id: string; handler: object }[] {
  const prototype = controller.prototype as Record<string, unknown>;
  return Object.getOwnPropertyNames(prototype)
    .filter((name) => name !== 'constructor' && typeof prototype[name] === 'function')
    .filter((name) => metadataOf(PATH_METADATA, prototype[name] as object) !== undefined)
    .map((name) => ({ id: `${controller.name}.${name}`, handler: prototype[name] as object }));
}

function isMarked(controller: Constructor, handler: object): boolean {
  return [BOARD_ROLE_KEY, IS_PUBLIC_KEY].some(
    (key) => metadataOf(key, handler) !== undefined || metadataOf(key, controller) !== undefined,
  );
}

describe('HTTP route authorization', () => {
  const controllers = collectControllers(AppModule);
  const routes = controllers.flatMap((controller) =>
    routeHandlers(controller).map((route) => ({ ...route, controller })),
  );

  it('finds the application routes', () => {
    expect(controllers.length).toBeGreaterThan(10);
    expect(routes.length).toBeGreaterThan(30);
  });

  it('marks every route with @BoardRole, @Public or an explicit ownership scope', () => {
    const unmarked = routes
      .filter(({ controller, handler }) => !isMarked(controller, handler))
      .map(({ id }) => id)
      .filter((id) => !OWNERSHIP_SCOPED.has(id));
    expect(unmarked).toEqual([]);
  });

  it('keeps the ownership allowlist free of stale or marked entries', () => {
    const unmarkedIds = new Set(
      routes.filter(({ controller, handler }) => !isMarked(controller, handler)).map(({ id }) => id),
    );
    expect([...OWNERSHIP_SCOPED].filter((id) => !unmarkedIds.has(id))).toEqual([]);
  });
});
