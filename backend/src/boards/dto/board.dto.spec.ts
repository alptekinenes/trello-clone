import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UpdateMemberDto } from '../../members/dto/update-member.dto.js';
import { CreateBoardDto, UpdateBoardDto } from './board.dto.js';

type DtoClass<T> = new () => T;

function check<T extends object>(cls: DtoClass<T>, body: Record<string, unknown>) {
  const dto = plainToInstance(cls, body);
  const errors = validateSync(dto, { whitelist: true, forbidNonWhitelisted: true });
  return { dto, invalidFields: errors.map((e) => e.property).sort() };
}

describe('CreateBoardDto', () => {
  it('accepts a title alone and trims it', () => {
    const { dto, invalidFields } = check(CreateBoardDto, { title: '  Proje  ' });
    expect(invalidFields).toEqual([]);
    expect(dto.title).toBe('Proje');
  });

  it.each([
    ['title', { title: '   ' }],
    ['title', { title: 'x'.repeat(101) }],
    ['title', { title: 42 }],
    ['title', {}],
    ['background', { title: 'Proje', background: 'neon' }],
    ['background', { title: 'Proje', background: null }],
  ])('rejects an invalid %s: %j', (field, body) => {
    expect(check(CreateBoardDto, body).invalidFields).toEqual([field]);
  });
});

describe('UpdateBoardDto', () => {
  it('accepts an empty body or either field', () => {
    expect(check(UpdateBoardDto, {}).invalidFields).toEqual([]);
    expect(check(UpdateBoardDto, { background: 'grey' }).invalidFields).toEqual([]);
    expect(check(UpdateBoardDto, { title: 'Yeni' }).invalidFields).toEqual([]);
  });

  it('rejects null and empty values', () => {
    expect(check(UpdateBoardDto, { title: null, background: null }).invalidFields).toEqual([
      'background',
      'title',
    ]);
    expect(check(UpdateBoardDto, { title: '  ' }).invalidFields).toEqual(['title']);
  });
});

describe('UpdateMemberDto', () => {
  it('accepts ADMIN and MEMBER only', () => {
    expect(check(UpdateMemberDto, { role: 'ADMIN' }).invalidFields).toEqual([]);
    expect(check(UpdateMemberDto, { role: 'MEMBER' }).invalidFields).toEqual([]);
    expect(check(UpdateMemberDto, { role: 'OWNER' }).invalidFields).toEqual(['role']);
    expect(check(UpdateMemberDto, {}).invalidFields).toEqual(['role']);
  });
});
