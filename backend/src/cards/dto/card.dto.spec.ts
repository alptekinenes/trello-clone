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
