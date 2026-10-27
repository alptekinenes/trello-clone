import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateListDto, ListAnchorsDto, ListQueryDto, UpdateListDto } from './list.dto.js';

type DtoClass<T> = new () => T;

function check<T extends object>(cls: DtoClass<T>, body: Record<string, unknown>) {
  const dto = plainToInstance(cls, body);
  const errors = validateSync(dto, { whitelist: true, forbidNonWhitelisted: true });
  return { dto, invalidFields: errors.map((e) => e.property).sort() };
}

const ID = '6f1c3c1e-7a51-4b8a-9d55-0f3a3e1d2c4b';

describe('CreateListDto', () => {
  it('accepts a title with optional anchors and trims it', () => {
    const { dto, invalidFields } = check(CreateListDto, {
      title: '  Yapılacaklar ',
      afterListId: ID,
      beforeListId: null,
    });
    expect(invalidFields).toEqual([]);
    expect(dto.title).toBe('Yapılacaklar');
  });

  it.each([
    ['title', { title: '' }],
    ['title', { title: 'x'.repeat(101) }],
    ['afterListId', { title: 'A', afterListId: 'nope' }],
    ['beforeListId', { title: 'A', beforeListId: 12 }],
    ['position', { title: 'A', position: 5 }],
  ])('rejects an invalid %s: %j', (field, body) => {
    expect(check(CreateListDto, body).invalidFields).toEqual([field]);
  });
});

describe('ListAnchorsDto', () => {
  it('accepts no anchors', () => {
    expect(check(ListAnchorsDto, {}).invalidFields).toEqual([]);
  });

  it('never accepts a raw position', () => {
    expect(check(ListAnchorsDto, { position: 1.5 }).invalidFields).toEqual(['position']);
  });
});

describe('UpdateListDto', () => {
  it('accepts a title, an archive flag or both', () => {
    expect(check(UpdateListDto, { title: 'A', archived: false }).invalidFields).toEqual([]);
  });

  it('rejects null values and non-boolean flags', () => {
    expect(check(UpdateListDto, { title: null, archived: 'true' }).invalidFields).toEqual([
      'archived',
      'title',
    ]);
  });
});

describe('ListQueryDto', () => {
  it.each([
    ['true', true],
    ['false', false],
  ])('parses ?archived=%s', (value, expected) => {
    const { dto, invalidFields } = check(ListQueryDto, { archived: value });
    expect(invalidFields).toEqual([]);
    expect(dto.archived).toBe(expected);
  });

  it('rejects other values', () => {
    expect(check(ListQueryDto, { archived: 'yes' }).invalidFields).toEqual(['archived']);
  });
});
