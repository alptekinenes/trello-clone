import { describe, expect, it } from 'vitest';
import { boardDetail, boardWithMembers, testLists, testMember, testUser } from '../../../test/fixtures';
import { patchList, patchMember, removeList, removeMember, upsertList, upsertMember } from './board-cache';

const titles = (detail: { lists: { title: string }[] }) => detail.lists.map((l) => l.title);

describe('board cache helpers', () => {
  const detail = boardDetail('OWNER', 'Pano', testLists('A', 'B', 'C'));

  it('patchList moves a list by its new position', () => {
    expect(titles(patchList(detail, 'list-3', { position: 1500 }))).toEqual(['A', 'C', 'B']);
  });

  it('upsertList adds or replaces in order', () => {
    const added = upsertList(detail, { ...testLists('D')[0], id: 'list-9', position: 100 });
    expect(titles(added)).toEqual(['D', 'A', 'B', 'C']);
    const replaced = upsertList(detail, { ...detail.lists[0], title: 'A2' });
    expect(titles(replaced)).toEqual(['A2', 'B', 'C']);
  });

  it('removeList drops the list and leaves the input untouched', () => {
    expect(titles(removeList(detail, 'list-2'))).toEqual(['A', 'C']);
    expect(titles(detail)).toEqual(['A', 'B', 'C']);
  });
});

describe('member helpers', () => {
  const ayse = testMember({ userId: 'u-ayse', name: 'Ayşe', role: 'ADMIN', joinedAt: '2026-10-28T09:00:00.000Z' });
  const bora = testMember({ userId: 'u-bora', name: 'Bora', joinedAt: '2026-10-29T09:00:00.000Z' });
  const cem = testMember({ userId: 'u-cem', name: 'Cem', joinedAt: '2026-10-30T09:00:00.000Z' });
  const detail = boardWithMembers('OWNER', [ayse, bora]);
  const names = (d: { members: { name: string }[] }) => d.members.map((m) => m.name);

  it('upsertMember adds a member in server order: owner, admins, then members by join date', () => {
    expect(names(upsertMember(detail, cem))).toEqual([testUser.name, 'Ayşe', 'Bora', 'Cem']);
    const admin = testMember({ userId: 'u-dilek', name: 'Dilek', role: 'ADMIN', joinedAt: '2026-11-01T09:00:00.000Z' });
    expect(names(upsertMember(detail, admin))).toEqual([testUser.name, 'Ayşe', 'Dilek', 'Bora']);
  });

  it('upsertMember replaces an existing member', () => {
    const renamed = upsertMember(detail, { ...bora, name: 'Bora K.' });
    expect(names(renamed)).toEqual([testUser.name, 'Ayşe', 'Bora K.']);
  });

  it('patchMember changes a role and re-sorts', () => {
    const promoted = patchMember(detail, 'u-bora', { role: 'ADMIN' });
    expect(promoted.members.map((m) => [m.name, m.role])).toEqual([
      [testUser.name, 'OWNER'],
      ['Ayşe', 'ADMIN'],
      ['Bora', 'ADMIN'],
    ]);
    const demoted = patchMember(detail, 'u-ayse', { role: 'MEMBER' });
    expect(names(demoted)).toEqual([testUser.name, 'Ayşe', 'Bora']);
  });

  it('removeMember drops the member and leaves the input untouched', () => {
    expect(names(removeMember(detail, 'u-ayse'))).toEqual([testUser.name, 'Bora']);
    expect(names(detail)).toEqual([testUser.name, 'Ayşe', 'Bora']);
  });
});
