import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ArchivedQueryDto } from './archived-query.dto.js';

function check(query: Record<string, unknown>) {
  const dto = plainToInstance(ArchivedQueryDto, query);
  const errors = validateSync(dto, { whitelist: true, forbidNonWhitelisted: true });
  return { dto, invalidFields: errors.map((e) => e.property) };
}

describe('ArchivedQueryDto', () => {
  it.each([
    ['true', true],
    ['false', false],
  ])('parses ?archived=%s', (value, expected) => {
    const { dto, invalidFields } = check({ archived: value });
    expect(invalidFields).toEqual([]);
    expect(dto.archived).toBe(expected);
  });

  it('allows the flag to be left out', () => {
    expect(check({}).invalidFields).toEqual([]);
  });

  it('rejects other values', () => {
    expect(check({ archived: 'yes' }).invalidFields).toEqual(['archived']);
  });
});
