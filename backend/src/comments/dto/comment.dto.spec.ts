import { COMMENT_LIMITS } from '@trello/contracts';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CommentBodyDto, FeedQueryDto } from './comment.dto.js';

function check<T extends object>(cls: new () => T, input: Record<string, unknown>) {
  const dto = plainToInstance(cls, input);
  const errors = validateSync(dto, { whitelist: true, forbidNonWhitelisted: true });
  return { dto, invalidFields: errors.map((e) => e.property) };
}

describe('CommentBodyDto', () => {
  it('trims the ends and keeps line breaks inside', () => {
    const { dto, invalidFields } = check(CommentBodyDto, { body: '  ilk\nikinci  ' });
    expect(invalidFields).toEqual([]);
    expect(dto.body).toBe('ilk\nikinci');
  });

  it.each([[''], ['   \n\t '], [42], [null]])('rejects %j', (body) => {
    expect(check(CommentBodyDto, { body }).invalidFields).toEqual(['body']);
  });

  it('rejects a missing body', () => {
    expect(check(CommentBodyDto, {}).invalidFields).toEqual(['body']);
  });

  it('accepts exactly the maximum length and rejects one more', () => {
    expect(check(CommentBodyDto, { body: 'a'.repeat(COMMENT_LIMITS.BODY_MAX) }).invalidFields).toEqual([]);
    expect(check(CommentBodyDto, { body: 'a'.repeat(COMMENT_LIMITS.BODY_MAX + 1) }).invalidFields).toEqual([
      'body',
    ]);
  });

  it('rejects extra fields', () => {
    expect(check(CommentBodyDto, { body: 'x', authorId: 'u1' }).invalidFields).toEqual(['authorId']);
  });
});

describe('FeedQueryDto', () => {
  it('allows every field to be left out', () => {
    expect(check(FeedQueryDto, {}).invalidFields).toEqual([]);
  });

  it.each([
    ['true', true],
    ['false', false],
  ])('parses ?details=%s', (value, expected) => {
    const { dto, invalidFields } = check(FeedQueryDto, { details: value });
    expect(invalidFields).toEqual([]);
    expect(dto.details).toBe(expected);
  });

  it('rejects other values for details', () => {
    expect(check(FeedQueryDto, { details: 'yes' }).invalidFields).toEqual(['details']);
  });

  it('parses limit as a number within 1..50', () => {
    expect(check(FeedQueryDto, { limit: '10' }).dto.limit).toBe(10);
    expect(check(FeedQueryDto, { limit: '50' }).invalidFields).toEqual([]);
    expect(check(FeedQueryDto, { limit: '0' }).invalidFields).toEqual(['limit']);
    expect(check(FeedQueryDto, { limit: '51' }).invalidFields).toEqual(['limit']);
    expect(check(FeedQueryDto, { limit: '1.5' }).invalidFields).toEqual(['limit']);
    expect(check(FeedQueryDto, { limit: 'abc' }).invalidFields).toEqual(['limit']);
  });

  it('rejects a cursor that is too long', () => {
    expect(check(FeedQueryDto, { cursor: 'a'.repeat(200) }).invalidFields).toEqual([]);
    expect(check(FeedQueryDto, { cursor: 'a'.repeat(201) }).invalidFields).toEqual(['cursor']);
  });

  it('rejects unknown query fields', () => {
    expect(check(FeedQueryDto, { offset: '5' }).invalidFields).toEqual(['offset']);
  });
});
