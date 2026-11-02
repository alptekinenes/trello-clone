import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ChecklistAnchorsDto, CreateChecklistDto, UpdateChecklistDto } from './checklist.dto.js';

type DtoClass<T> = new () => T;

function check<T extends object>(cls: DtoClass<T>, body: Record<string, unknown>) {
  const dto = plainToInstance(cls, body);
  const errors = validateSync(dto, { whitelist: true, forbidNonWhitelisted: true });
  return { dto, invalidFields: errors.map((e) => e.property).sort() };
}

const ID = '6f1c3c1e-7a51-4b8a-9d55-0f3a3e1d2c4b';

describe.each([
  ['CreateChecklistDto', CreateChecklistDto],
  ['UpdateChecklistDto', UpdateChecklistDto],
])('%s title', (_name, cls) => {
  it('trims the title and accepts 200 characters', () => {
    const { dto, invalidFields } = check(cls, { title: '  Yapılacaklar ' });
    expect(invalidFields).toEqual([]);
    expect(dto.title).toBe('Yapılacaklar');
    expect(check(cls, { title: 'x'.repeat(200) }).invalidFields).toEqual([]);
  });

  it.each([{ title: '   ' }, { title: 'x'.repeat(201) }, { title: null }, {}, { title: 4 }])(
    'rejects %j',
    (body) => {
      expect(check(cls, body).invalidFields).toEqual(['title']);
    },
  );

  it('rejects unknown fields such as a raw position', () => {
    expect(check(cls, { title: 'A', position: 1 }).invalidFields).toEqual(['position']);
  });
});

describe('ChecklistAnchorsDto', () => {
  it('accepts missing, null and uuid anchors', () => {
    expect(check(ChecklistAnchorsDto, {}).invalidFields).toEqual([]);
    expect(
      check(ChecklistAnchorsDto, { afterChecklistId: null, beforeChecklistId: ID }).invalidFields,
    ).toEqual([]);
  });

  it('rejects malformed anchors and unknown fields', () => {
    expect(
      check(ChecklistAnchorsDto, { afterChecklistId: 'nope', beforeChecklistId: 3, position: 1 })
        .invalidFields,
    ).toEqual(['afterChecklistId', 'beforeChecklistId', 'position']);
  });
});
