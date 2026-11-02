import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  ChecklistAnchorsDto,
  CreateChecklistDto,
  CreateChecklistItemDto,
  MoveChecklistItemDto,
  UpdateChecklistDto,
  UpdateChecklistItemDto,
} from './checklist.dto.js';

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

describe('CreateChecklistItemDto', () => {
  it('trims the content and accepts 500 characters', () => {
    const { dto, invalidFields } = check(CreateChecklistItemDto, { content: '  Madde ' });
    expect(invalidFields).toEqual([]);
    expect(dto.content).toBe('Madde');
    expect(check(CreateChecklistItemDto, { content: 'x'.repeat(500) }).invalidFields).toEqual([]);
  });

  it.each([{ content: '  ' }, { content: 'x'.repeat(501) }, { content: null }, {}])(
    'rejects %j',
    (body) => {
      expect(check(CreateChecklistItemDto, body).invalidFields).toEqual(['content']);
    },
  );

  it('rejects completion, positions and other unknown fields', () => {
    expect(
      check(CreateChecklistItemDto, { content: 'A', isCompleted: true, position: 1 }).invalidFields,
    ).toEqual(['isCompleted', 'position']);
  });
});

describe('UpdateChecklistItemDto', () => {
  it('accepts either field, both or none', () => {
    expect(check(UpdateChecklistItemDto, { content: ' Yeni ' }).dto.content).toBe('Yeni');
    expect(check(UpdateChecklistItemDto, { isCompleted: false }).invalidFields).toEqual([]);
    expect(check(UpdateChecklistItemDto, { content: 'A', isCompleted: true }).invalidFields).toEqual(
      [],
    );
    expect(check(UpdateChecklistItemDto, {}).invalidFields).toEqual([]);
  });

  it('rejects null, blank and non-boolean values', () => {
    expect(
      check(UpdateChecklistItemDto, { content: null, isCompleted: null }).invalidFields,
    ).toEqual(['content', 'isCompleted']);
    expect(check(UpdateChecklistItemDto, { content: '  ' }).invalidFields).toEqual(['content']);
    expect(check(UpdateChecklistItemDto, { isCompleted: 'true' }).invalidFields).toEqual([
      'isCompleted',
    ]);
    expect(check(UpdateChecklistItemDto, { content: 'x'.repeat(501) }).invalidFields).toEqual([
      'content',
    ]);
  });
});

describe('MoveChecklistItemDto', () => {
  it('requires a target checklist id; anchors are optional', () => {
    expect(check(MoveChecklistItemDto, { checklistId: ID }).invalidFields).toEqual([]);
    expect(
      check(MoveChecklistItemDto, { checklistId: ID, afterItemId: ID, beforeItemId: null })
        .invalidFields,
    ).toEqual([]);
    expect(check(MoveChecklistItemDto, {}).invalidFields).toEqual(['checklistId']);
    expect(check(MoveChecklistItemDto, { checklistId: 'nope' }).invalidFields).toEqual([
      'checklistId',
    ]);
  });

  it('rejects malformed anchors and a raw position', () => {
    expect(
      check(MoveChecklistItemDto, { checklistId: ID, afterItemId: 'x', position: 1 }).invalidFields,
    ).toEqual(['afterItemId', 'position']);
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
