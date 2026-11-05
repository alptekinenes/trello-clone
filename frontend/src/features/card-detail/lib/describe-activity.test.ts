import type { ActivityDto } from '@trello/contracts';
import { describe, expect, it } from 'vitest';
import { testActivity, testUser } from '../../../test/fixtures';
import { describeActivity } from './describe-activity';

const list = (title: string) => ({ id: title, title });
const person = (id: string, name: string) => ({ id, name });
const title = { cardTitle: 'Rapor' };

const CASES: [string, ActivityDto, string][] = [
  [
    'created',
    testActivity({ id: '1', type: 'CARD_CREATED', data: { ...title, list: list('Yapılacaklar') } }),
    'bu kartı Yapılacaklar listesine ekledi',
  ],
  [
    'moved',
    testActivity({
      id: '1',
      type: 'CARD_MOVED',
      data: { ...title, fromList: list('Yapılacaklar'), toList: list('Bitti') },
    }),
    'bu kartı Yapılacaklar listesinden Bitti listesine taşıdı',
  ],
  ['archived', testActivity({ id: '1', type: 'CARD_ARCHIVED', data: title }), 'bu kartı arşivledi'],
  [
    'restored',
    testActivity({ id: '1', type: 'CARD_RESTORED', data: title }),
    'bu kartı arşivden geri aldı',
  ],
  [
    'completed',
    testActivity({ id: '1', type: 'CARD_COMPLETED', data: title }),
    'bu kartı tamamlandı olarak işaretledi',
  ],
  [
    'uncompleted',
    testActivity({ id: '1', type: 'CARD_UNCOMPLETED', data: title }),
    'bu kartı tamamlanmadı olarak işaretledi',
  ],
  [
    'someone else added',
    testActivity({
      id: '1',
      type: 'CARD_MEMBER_ADDED',
      data: { ...title, member: person('u2', 'Can Demir') },
    }),
    'Can Demir kişisini bu karta ekledi',
  ],
  [
    'joined',
    testActivity({
      id: '1',
      type: 'CARD_MEMBER_ADDED',
      data: { ...title, member: person(testUser.id, testUser.name) },
    }),
    'bu karta katıldı',
  ],
  [
    'someone else removed',
    testActivity({
      id: '1',
      type: 'CARD_MEMBER_REMOVED',
      data: { ...title, member: person('u2', 'Can Demir') },
    }),
    'Can Demir kişisini bu karttan çıkardı',
  ],
  [
    'left',
    testActivity({
      id: '1',
      type: 'CARD_MEMBER_REMOVED',
      data: { ...title, member: person(testUser.id, testUser.name) },
    }),
    'bu karttan ayrıldı',
  ],
];

describe('describeActivity', () => {
  it.each(CASES)('describes %s', (_, activity, sentence) => {
    expect(describeActivity(activity)).toBe(sentence);
  });
});
