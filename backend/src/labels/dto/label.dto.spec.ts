import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateLabelDto, UpdateLabelDto } from './label.dto.js';

type DtoClass<T> = new () => T;

function check<T extends object>(cls: DtoClass<T>, body: Record<string, unknown>) {
  const dto = plainToInstance(cls, body);
  const errors = validateSync(dto, { whitelist: true, forbidNonWhitelisted: true });
  return { dto, invalidFields: errors.map((e) => e.property).sort() };
}

describe('CreateLabelDto', () => {
  it('needs only a color; the name is optional', () => {
    expect(check(CreateLabelDto, { color: 'RED' }).invalidFields).toEqual([]);
  });

  it('trims the name and allows an empty one', () => {
    const named = check(CreateLabelDto, { name: '  Acil  ', color: 'RED' });
    expect(named.invalidFields).toEqual([]);
    expect(named.dto.name).toBe('Acil');
    expect(check(CreateLabelDto, { name: '   ', color: 'RED' }).dto.name).toBe('');
  });

  it('accepts a name of 50 characters and rejects 51', () => {
    expect(check(CreateLabelDto, { name: 'x'.repeat(50), color: 'BLUE' }).invalidFields).toEqual(
      [],
    );
    expect(check(CreateLabelDto, { name: 'x'.repeat(51), color: 'BLUE' }).invalidFields).toEqual([
      'name',
    ]);
  });

  it.each([
    ['color', { color: 'TEAL' }],
    ['color', { color: 'red' }],
    ['color', {}],
    ['name', { name: null, color: 'RED' }],
    ['name', { name: 5, color: 'RED' }],
    ['boardId', { color: 'RED', boardId: 'x' }],
  ])('rejects an invalid %s: %j', (field, body) => {
    expect(check(CreateLabelDto, body).invalidFields).toEqual([field]);
  });
});

describe('UpdateLabelDto', () => {
  it('accepts either field, both or none', () => {
    expect(check(UpdateLabelDto, { name: 'Yeni' }).invalidFields).toEqual([]);
    expect(check(UpdateLabelDto, { color: 'PINK' }).invalidFields).toEqual([]);
    expect(check(UpdateLabelDto, { name: '', color: 'PINK' }).invalidFields).toEqual([]);
    expect(check(UpdateLabelDto, {}).invalidFields).toEqual([]);
  });

  it('rejects null values, bad colors and unknown fields', () => {
    expect(
      check(UpdateLabelDto, { name: null, color: null, id: 'x' }).invalidFields,
    ).toEqual(['color', 'id', 'name']);
    expect(check(UpdateLabelDto, { color: 'TEAL' }).invalidFields).toEqual(['color']);
  });
});
