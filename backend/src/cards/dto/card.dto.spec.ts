import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateCardDto, MoveCardDto, UpdateCardDto } from './card.dto.js';

type DtoClass<T> = new () => T;

function check<T extends object>(cls: DtoClass<T>, body: Record<string, unknown>) {
  const dto = plainToInstance(cls, body);
  const errors = validateSync(dto, { whitelist: true, forbidNonWhitelisted: true });
  return { dto, invalidFields: errors.map((e) => e.property).sort() };
}

const ID = '6f1c3c1e-7a51-4b8a-9d55-0f3a3e1d2c4b';

describe('CreateCardDto', () => {
  it('accepts a title with optional anchors and trims it', () => {
    const { dto, invalidFields } = check(CreateCardDto, {
      title: '  Taslak hazırla ',
      afterCardId: ID,
      beforeCardId: null,
    });
    expect(invalidFields).toEqual([]);
    expect(dto.title).toBe('Taslak hazırla');
  });

  it('accepts a title of 512 characters', () => {
    expect(check(CreateCardDto, { title: 'x'.repeat(512) }).invalidFields).toEqual([]);
  });

  it.each([
    ['title', { title: '   ' }],
    ['title', { title: 'x'.repeat(513) }],
    ['afterCardId', { title: 'A', afterCardId: 'nope' }],
    ['beforeCardId', { title: 'A', beforeCardId: 7 }],
    ['position', { title: 'A', position: 5 }],
    ['listId', { title: 'A', listId: ID }],
  ])('rejects an invalid %s: %j', (field, body) => {
    expect(check(CreateCardDto, body).invalidFields).toEqual([field]);
  });
});

describe('UpdateCardDto', () => {
  it('accepts a title, an archive flag or both', () => {
    expect(check(UpdateCardDto, { title: 'A', archived: true }).invalidFields).toEqual([]);
    expect(check(UpdateCardDto, {}).invalidFields).toEqual([]);
  });

  it('rejects null values, non-boolean flags and unknown fields', () => {
    expect(
      check(UpdateCardDto, { title: null, archived: 'true', listId: ID }).invalidFields,
    ).toEqual(['archived', 'listId', 'title']);
  });
});

describe('UpdateCardDto description', () => {
  it('turns a blank description into null and trims the rest', () => {
    expect(check(UpdateCardDto, { description: '   \n ' }).dto.description).toBeNull();
    expect(check(UpdateCardDto, { description: '' }).dto.description).toBeNull();
    expect(check(UpdateCardDto, { description: '  Ayrıntı  ' }).dto.description).toBe('Ayrıntı');
  });

  it('accepts null and leaves a missing description undefined', () => {
    const withNull = check(UpdateCardDto, { description: null });
    expect(withNull.invalidFields).toEqual([]);
    expect(withNull.dto.description).toBeNull();
    expect(check(UpdateCardDto, {}).dto.description).toBeUndefined();
  });

  it('allows 10000 characters and rejects 10001', () => {
    expect(check(UpdateCardDto, { description: 'x'.repeat(10_000) }).invalidFields).toEqual([]);
    expect(check(UpdateCardDto, { description: 'x'.repeat(10_001) }).invalidFields).toEqual([
      'description',
    ]);
  });

  it('counts the length after trimming', () => {
    const padded = ` ${'x'.repeat(10_000)} `;
    expect(check(UpdateCardDto, { description: padded }).invalidFields).toEqual([]);
  });

  it('rejects a number', () => {
    expect(check(UpdateCardDto, { description: 5 }).invalidFields).toEqual(['description']);
  });
});

describe('UpdateCardDto due date', () => {
  it.each(['2026-11-05T12:00:00Z', '2026-11-05T12:00:00.000Z', '2026-11-05T15:00:00+03:00'])(
    'accepts %s',
    (dueDate) => {
      expect(check(UpdateCardDto, { dueDate }).invalidFields).toEqual([]);
    },
  );

  it.each(['1970-01-01T00:00:00Z', '9999-12-31T23:59:59Z', '1970-01-01T02:00:00+02:00'])(
    'accepts %s at the edge of the supported years',
    (dueDate) => {
      expect(check(UpdateCardDto, { dueDate }).invalidFields).toEqual([]);
    },
  );

  // The last one is 9999 locally but year 10000 in UTC, which Date cannot read back.
  it.each(['1969-12-31T23:59:59Z', '0001-01-01T00:00:00Z', '9999-12-31T23:59:00-23:59'])(
    'rejects %s outside the supported years in UTC',
    (dueDate) => {
      expect(check(UpdateCardDto, { dueDate }).invalidFields).toEqual(['dueDate']);
    },
  );

  it('accepts null to clear the date', () => {
    expect(check(UpdateCardDto, { dueDate: null }).invalidFields).toEqual([]);
  });

  it.each(['2026-11-05T12:00:00', '2026-11-05', 'yarın', '2026-13-45T12:00:00Z', 12, true])(
    'rejects %j',
    (dueDate) => {
      expect(check(UpdateCardDto, { dueDate }).invalidFields).toEqual(['dueDate']);
    },
  );

  it('accepts a boolean dueComplete and rejects null or text', () => {
    expect(check(UpdateCardDto, { dueComplete: true }).invalidFields).toEqual([]);
    expect(check(UpdateCardDto, { dueComplete: null }).invalidFields).toEqual(['dueComplete']);
    expect(check(UpdateCardDto, { dueComplete: 'yes' }).invalidFields).toEqual(['dueComplete']);
  });
});

describe('MoveCardDto', () => {
  it('requires a target list id', () => {
    expect(check(MoveCardDto, { listId: ID }).invalidFields).toEqual([]);
    expect(check(MoveCardDto, {}).invalidFields).toEqual(['listId']);
    expect(check(MoveCardDto, { listId: 'nope' }).invalidFields).toEqual(['listId']);
  });

  it('never accepts a raw position', () => {
    expect(check(MoveCardDto, { listId: ID, position: 1.5 }).invalidFields).toEqual(['position']);
  });
});
