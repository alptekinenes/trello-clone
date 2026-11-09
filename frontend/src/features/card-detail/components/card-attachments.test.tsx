import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorCode, type AttachmentDto, type CardDetailDto } from '@trello/contracts';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CARD_PATH, CARD_URL, FILE_TOKEN, cardDialog, openCard, recordPatches } from '../../../test/card-dialog';
import { FakeXhr, installFakeXhr, restoreXhr } from '../../../test/fake-xhr';
import { apiError, testUser } from '../../../test/fixtures';
import { gate } from '../../../test/gate';
import { server } from '../../../test/msw-server';

const ATTACHMENT_URL = '*/api/v1/attachments/:attachmentId';
const OTHER = { id: 'user-can', name: 'Can Demir', avatarUrl: null };
const ME = { id: testUser.id, name: testUser.name, avatarUrl: null };

function attachment(overrides: Partial<AttachmentDto> & Pick<AttachmentDto, 'id' | 'fileName'>): AttachmentDto {
  return {
    cardId: 'card-1',
    mimeType: 'application/pdf',
    size: 1229,
    uploader: ME,
    createdAt: '2026-11-05T11:30:00.000Z',
    ...overrides,
  };
}

const REPORT = attachment({ id: 'att-report', fileName: 'rapor.pdf' });
const PHOTO = attachment({
  id: 'att-photo',
  fileName: 'foto.png',
  mimeType: 'image/png',
  createdAt: '2026-11-05T10:30:00.000Z',
});
const THEIRS = attachment({ id: 'att-theirs', fileName: 'can.pdf', uploader: OTHER });

function withAttachments(...attachments: AttachmentDto[]): Partial<CardDetailDto> {
  return { attachments, attachmentCount: attachments.length };
}

/** DELETE /attachments/:id like the server; returns the ids asked for. */
function deleteEndpoint(state: { card: CardDetailDto }) {
  const deleted: string[] = [];
  server.use(
    http.delete(ATTACHMENT_URL, ({ params }) => {
      const id = String(params.attachmentId);
      deleted.push(id);
      const attachments = state.card.attachments.filter((item) => item.id !== id);
      const coverAttachmentId = state.card.coverAttachmentId === id ? null : state.card.coverAttachmentId;
      state.card = { ...state.card, attachments, attachmentCount: attachments.length, coverAttachmentId };
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return deleted;
}

const pdf = (name = 'plan.pdf') => new File(['%PDF'], name, { type: 'application/pdf' });
const chooser = () => screen.getByLabelText('Dosya seç');
const list = (dialog: HTMLElement) => within(dialog).getByRole('list', { name: 'Ekler' });
const uploadRows = (dialog: HTMLElement) => within(dialog).getByRole('list', { name: 'Yüklemeler' });

beforeEach(() => installFakeXhr());
afterEach(() => restoreXhr());

describe('attachments: upload', () => {
  it('opens the file chooser from the "Ek" button', async () => {
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    const { user } = openCard(CARD_PATH);
    const dialog = await cardDialog();

    await user.click(within(dialog).getByRole('button', { name: 'Ek' }));

    expect(click).toHaveBeenCalledTimes(1);
    expect(chooser()).toHaveAttribute('multiple');
    expect(chooser()).toHaveAttribute('accept', expect.stringContaining('.pdf'));
    click.mockRestore();
  });

  it('shows a progress row while a chosen file uploads, then lists the file', async () => {
    const { user, serverCard } = openCard(CARD_PATH);
    const dialog = await cardDialog();

    await user.upload(chooser(), pdf('plan.pdf'));

    const progress = await within(dialog).findByRole('progressbar', { name: '“plan.pdf” yükleniyor' });
    expect(within(dialog).getByRole('heading', { name: 'Ekler' })).toBeInTheDocument();
    FakeXhr.last.progress(50, 100);
    await waitFor(() => expect(progress).toHaveAttribute('value', '2'));
    expect(within(dialog).getByText('%50')).toBeInTheDocument();
    expect(FakeXhr.last.url).toMatch(/\/cards\/card-1\/attachments$/);

    const added = attachment({ id: 'att-new', fileName: 'plan.pdf', size: 4 });
    serverCard.card = { ...serverCard.card, ...withAttachments(added) };
    FakeXhr.last.respond(201, { attachment: added, attachmentCount: 1 });

    expect(await within(dialog).findByRole('link', { name: 'plan.pdf' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('progressbar')).not.toBeInTheDocument();
    expect(within(dialog).getByRole('status')).toHaveTextContent('“plan.pdf” eklendi.');
  });

  it('takes several files at once and uploads them one by one', async () => {
    const { user } = openCard(CARD_PATH);
    const dialog = await cardDialog();

    await user.upload(chooser(), [pdf('bir.pdf'), pdf('iki.pdf')]);

    await within(dialog).findByRole('progressbar', { name: '“bir.pdf” yükleniyor' });
    expect(within(dialog).getByText('Sırada bekliyor')).toBeInTheDocument();
    expect(FakeXhr.instances).toHaveLength(1);
  });

  it('cancels an upload from its row', async () => {
    const { user } = openCard(CARD_PATH);
    const dialog = await cardDialog();
    await user.upload(chooser(), pdf('plan.pdf'));

    await user.click(await within(dialog).findByRole('button', { name: '“plan.pdf” yüklemesini iptal et' }));

    expect(FakeXhr.last.aborted).toBe(true);
    await waitFor(() => expect(within(dialog).queryByRole('progressbar')).not.toBeInTheDocument());
    expect(within(dialog).getByRole('status')).toHaveTextContent('Yükleme iptal edildi.');
  });

  it.each([
    [413, ErrorCode.PAYLOAD_TOO_LARGE, '“plan.pdf” 10 MB\'tan büyük, yüklenemedi.'],
    [415, ErrorCode.UNSUPPORTED_FILE_TYPE, '“plan.pdf” türü desteklenmiyor.'],
    [409, ErrorCode.ATTACHMENT_LIMIT_REACHED, 'Bir karta en fazla 20 dosya eklenebilir.'],
  ])('shows the reason of a %d answer and lets the user dismiss the row', async (status, code, message) => {
    const { user } = openCard(CARD_PATH);
    const dialog = await cardDialog();
    await user.upload(chooser(), pdf('plan.pdf'));
    await within(dialog).findByRole('progressbar');

    FakeXhr.last.respond(status, { statusCode: status, code, message: 'x' });

    expect(await within(uploadRows(dialog)).findByText(message)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: '“plan.pdf” hatasını kapat' }));
    expect(within(dialog).queryByRole('list', { name: 'Yüklemeler' })).not.toBeInTheDocument();
  });

  it('refuses a file of an unknown type without a request', async () => {
    openCard(CARD_PATH);
    const dialog = await cardDialog();

    fireEvent.change(chooser(), { target: { files: [new File(['MZ'], 'virus.exe')] } });

    expect(
      await within(uploadRows(dialog)).findByText('“virus.exe” türü desteklenmiyor.'),
    ).toBeInTheDocument();
    expect(FakeXhr.instances).toHaveLength(0);
  });

  it('keeps uploading after the dialog is closed', async () => {
    server.use(http.get('*/api/v1/boards', () => HttpResponse.json([])));
    const { user } = openCard(CARD_PATH);
    const dialog = await cardDialog();
    await user.upload(chooser(), pdf('plan.pdf'));
    await within(dialog).findByRole('progressbar');

    await user.click(within(dialog).getByRole('button', { name: 'Kapat' }));

    expect(FakeXhr.last.aborted).toBe(false);
  });

  it('takes files dropped on the dialog', async () => {
    openCard(CARD_PATH);
    const dialog = await cardDialog();
    const target = within(dialog).getByRole('button', { name: 'Rapor' });
    const dataTransfer = { types: ['Files'], files: [pdf('bırakılan.pdf')], dropEffect: 'none' };

    fireEvent.dragEnter(target, { dataTransfer });
    expect(within(dialog).getByText('Dosyaları karta eklemek için bırak')).toBeInTheDocument();
    fireEvent.drop(target, { dataTransfer });

    expect(
      await within(dialog).findByRole('progressbar', { name: '“bırakılan.pdf” yükleniyor' }),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText('Dosyaları karta eklemek için bırak')).not.toBeInTheDocument();
  });

  it('ignores a drag that carries no files', async () => {
    openCard(CARD_PATH);
    const dialog = await cardDialog();

    fireEvent.dragEnter(within(dialog).getByRole('button', { name: 'Rapor' }), {
      dataTransfer: { types: ['text/plain'], files: [] },
    });

    expect(within(dialog).queryByText('Dosyaları karta eklemek için bırak')).not.toBeInTheDocument();
  });

  it('does not let the browser open a file dropped outside the dialog', async () => {
    openCard(CARD_PATH);
    await cardDialog();

    const notCancelled = fireEvent.drop(document.body, { dataTransfer: { types: ['Files'], files: [] } });

    expect(notCancelled).toBe(false);
  });

  it('takes no files on an archived card', async () => {
    openCard(CARD_PATH, { archivedAt: '2026-11-01T10:00:00.000Z' });
    const dialog = await screen.findByRole('dialog', { name: 'Rapor' });
    const target = await within(dialog).findByRole('button', { name: 'Rapor' });

    fireEvent.dragEnter(target, { dataTransfer: { types: ['Files'], files: [pdf()] } });

    expect(within(dialog).queryByText('Dosyaları karta eklemek için bırak')).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Ek' })).not.toBeInTheDocument();
  });
});

describe('attachments: list', () => {
  it('has no section while the card has no files', async () => {
    openCard(CARD_PATH);
    const dialog = await cardDialog();

    expect(within(dialog).queryByRole('heading', { name: 'Ekler' })).not.toBeInTheDocument();
  });

  it('lists name, size, time and uploader, newest first', async () => {
    openCard(CARD_PATH, withAttachments(REPORT, PHOTO));
    const dialog = await cardDialog();

    await within(list(dialog)).findAllByRole('link', { name: 'rapor.pdf' });
    const items = within(list(dialog)).getAllByRole('listitem');
    expect(items.map((item) => within(item).getByRole('link', { name: /\.(pdf|png)$/ }).textContent)).toEqual([
      'rapor.pdf',
      'foto.png',
    ]);
    expect(items[0]).toHaveTextContent(/1,2 KB · 5 Kas \d\d:\d\d · Ayşe Yılmaz/);
  });

  it('downloads a document and opens an image in a new tab, with the file key in the URL', async () => {
    openCard(CARD_PATH, withAttachments(REPORT, PHOTO));
    const dialog = await cardDialog();

    const report = await within(list(dialog)).findByRole('link', { name: 'rapor.pdf' });
    expect(report).toHaveAttribute('href', `/api/v1/files/att-report?token=${FILE_TOKEN}&download=true`);
    expect(report).not.toHaveAttribute('target');
    const photo = within(list(dialog)).getByRole('link', { name: 'foto.png' });
    expect(photo).toHaveAttribute('href', `/api/v1/files/att-photo?token=${FILE_TOKEN}`);
    expect(photo).toHaveAttribute('target', '_blank');
    expect(photo).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('offers a download link for each file whose name contains its visible text', async () => {
    openCard(CARD_PATH, withAttachments(REPORT, PHOTO));
    const dialog = await cardDialog();

    const download = await within(dialog).findByRole('link', { name: 'İndir: “foto.png”' });

    expect(download).toHaveTextContent('İndir');
    expect(download).toHaveAttribute('href', `/api/v1/files/att-photo?token=${FILE_TOKEN}&download=true`);
  });

  it('shows a small picture for an image and none for a document', async () => {
    openCard(CARD_PATH, withAttachments(REPORT, PHOTO));
    const dialog = await cardDialog();

    await waitFor(() => expect(list(dialog).querySelectorAll('img')).toHaveLength(1));
    expect(list(dialog).querySelector('img')).toHaveAttribute(
      'src',
      `/api/v1/files/att-photo?token=${FILE_TOKEN}`,
    );
  });
});

describe('attachments: delete', () => {
  it('asks first, and "Vazgeç" keeps the file', async () => {
    const { user } = openCard(CARD_PATH, withAttachments(REPORT));
    const dialog = await cardDialog();

    await user.click(within(dialog).getByRole('button', { name: '“rapor.pdf” ekini sil' }));
    const confirm = await screen.findByRole('dialog', { name: 'Ek silinsin mi?' });
    expect(within(confirm).getByText('“rapor.pdf” kalıcı olarak silinecek.')).toBeInTheDocument();
    await user.click(within(confirm).getByRole('button', { name: 'Vazgeç' }));

    expect(within(list(dialog)).getByRole('link', { name: 'rapor.pdf' })).toBeInTheDocument();
  });

  it('removes the file at once, sends the DELETE and moves the focus to the next file', async () => {
    const { user, serverCard } = openCard(CARD_PATH, withAttachments(REPORT, PHOTO));
    const deleted = deleteEndpoint(serverCard);
    const dialog = await cardDialog();

    await user.click(within(dialog).getByRole('button', { name: '“rapor.pdf” ekini sil' }));
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Ek silinsin mi?' })).getByRole('button', { name: 'Sil' }),
    );

    await waitFor(() => expect(within(list(dialog)).queryByRole('link', { name: 'rapor.pdf' })).toBeNull());
    expect(deleted).toEqual(['att-report']);
    expect(within(list(dialog)).getByRole('link', { name: 'foto.png' })).toHaveFocus();
  });

  it('moves the focus to the heading when the last of several files goes', async () => {
    const { user, serverCard } = openCard(CARD_PATH, withAttachments(REPORT, PHOTO));
    deleteEndpoint(serverCard);
    const dialog = await cardDialog();

    await user.click(within(dialog).getByRole('button', { name: '“foto.png” ekini sil' }));
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Ek silinsin mi?' })).getByRole('button', { name: 'Sil' }),
    );

    await waitFor(() => expect(within(list(dialog)).queryByRole('link', { name: 'foto.png' })).toBeNull());
    expect(within(dialog).getByRole('heading', { name: 'Ekler' })).toHaveFocus();
  });

  it('moves the focus to the "Ek" button when the only file goes', async () => {
    const { user, serverCard } = openCard(CARD_PATH, withAttachments(REPORT));
    deleteEndpoint(serverCard);
    const dialog = await cardDialog();

    await user.click(within(dialog).getByRole('button', { name: '“rapor.pdf” ekini sil' }));
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Ek silinsin mi?' })).getByRole('button', { name: 'Sil' }),
    );

    await waitFor(() => expect(within(dialog).queryByRole('heading', { name: 'Ekler' })).toBeNull());
    expect(within(dialog).getByRole('button', { name: 'Ek' })).toHaveFocus();
  });

  it('puts the file back and says so when the server fails', async () => {
    const { user } = openCard(CARD_PATH, withAttachments(REPORT));
    const answer = gate();
    server.use(
      http.delete(ATTACHMENT_URL, async () => {
        await answer.opened;
        return apiError(500, ErrorCode.INTERNAL_ERROR);
      }),
    );
    const dialog = await cardDialog();

    await user.click(within(dialog).getByRole('button', { name: '“rapor.pdf” ekini sil' }));
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Ek silinsin mi?' })).getByRole('button', { name: 'Sil' }),
    );
    await waitFor(() => expect(within(dialog).queryByRole('link', { name: 'rapor.pdf' })).toBeNull());
    answer.release();

    expect(await within(dialog).findByRole('link', { name: 'rapor.pdf' })).toBeInTheDocument();
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Ek silinemedi. Tekrar dene.');
  });

  it('keeps the file out and tells so when it was already deleted (404)', async () => {
    const { user, serverCard } = openCard(CARD_PATH, withAttachments(REPORT));
    server.use(
      http.delete(ATTACHMENT_URL, () => {
        serverCard.card = { ...serverCard.card, ...withAttachments() };
        return apiError(404, ErrorCode.NOT_FOUND);
      }),
    );
    const dialog = await cardDialog();

    await user.click(within(dialog).getByRole('button', { name: '“rapor.pdf” ekini sil' }));
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Ek silinsin mi?' })).getByRole('button', { name: 'Sil' }),
    );

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Ek bulunamadı. Silinmiş olabilir.');
    expect(within(dialog).queryByRole('link', { name: 'rapor.pdf' })).not.toBeInTheDocument();
  });

  it('shows a MEMBER "Sil" only on their own files', async () => {
    openCard(CARD_PATH, withAttachments(REPORT, THEIRS), [], [], [], 'MEMBER');
    const dialog = await cardDialog();

    expect(within(dialog).getByRole('button', { name: '“rapor.pdf” ekini sil' })).toBeVisible();
    expect(within(dialog).queryByRole('button', { name: '“can.pdf” ekini sil' })).not.toBeInTheDocument();
  });

  it('lets an ADMIN delete a file someone else uploaded', async () => {
    openCard(CARD_PATH, withAttachments(THEIRS), [], [], [], 'ADMIN');
    const dialog = await cardDialog();

    expect(within(dialog).getByRole('button', { name: '“can.pdf” ekini sil' })).toBeVisible();
  });
});

describe('attachments: cover', () => {
  it('offers "Kapak yap" for images only', async () => {
    openCard(CARD_PATH, withAttachments(REPORT, PHOTO));
    const dialog = await cardDialog();

    expect(within(dialog).getByRole('button', { name: '“foto.png” görselini kapak yap' })).toHaveTextContent(
      'Kapak yap',
    );
    expect(within(dialog).getAllByRole('button', { name: /kapak yap/ })).toHaveLength(1);
  });

  it('makes the image the cover at once: the cover shows on top and the button flips', async () => {
    const { user, serverCard } = openCard(CARD_PATH, { ...withAttachments(PHOTO), coverColor: 'RED' });
    const sent = recordPatches(serverCard);
    const dialog = await cardDialog();
    expect(await within(dialog).findByTestId('card-cover')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: '“foto.png” görselini kapak yap' }));

    expect(await within(dialog).findByTestId('card-cover-image')).toBeInTheDocument();
    expect(within(dialog).queryByTestId('card-cover')).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Kapağı kaldır: “foto.png”' })).toHaveTextContent(
      'Kapağı kaldır',
    );
    expect(within(dialog).getByRole('status')).toHaveTextContent('Kapak olarak ayarlandı.');
    await waitFor(() => expect(sent).toEqual([{ coverAttachmentId: 'att-photo' }]));
  });

  it('removes the cover with "Kapağı kaldır"', async () => {
    const { user, serverCard } = openCard(CARD_PATH, { ...withAttachments(PHOTO), coverAttachmentId: 'att-photo' });
    const sent = recordPatches(serverCard);
    const dialog = await cardDialog();

    await user.click(await within(dialog).findByRole('button', { name: 'Kapağı kaldır: “foto.png”' }));

    await waitFor(() => expect(sent).toEqual([{ coverAttachmentId: null }]));
    expect(within(dialog).queryByTestId('card-cover-image')).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '“foto.png” görselini kapak yap' })).toBeInTheDocument();
  });

  it('undoes the cover and says why when the server refuses it', async () => {
    const { user } = openCard(CARD_PATH, withAttachments(PHOTO));
    server.use(http.patch(CARD_URL, () => apiError(400, ErrorCode.INVALID_COVER)));
    const dialog = await cardDialog();

    await user.click(within(dialog).getByRole('button', { name: '“foto.png” görselini kapak yap' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Bu dosya kapak yapılamaz.');
    expect(within(dialog).queryByTestId('card-cover-image')).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '“foto.png” görselini kapak yap' })).toBeInTheDocument();
  });

  it('drops the cover with the file when the cover image is deleted', async () => {
    const { user, serverCard } = openCard(CARD_PATH, { ...withAttachments(PHOTO), coverAttachmentId: 'att-photo' });
    deleteEndpoint(serverCard);
    const dialog = await cardDialog();
    expect(await within(dialog).findByTestId('card-cover-image')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: '“foto.png” ekini sil' }));
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Ek silinsin mi?' })).getByRole('button', { name: 'Sil' }),
    );

    await waitFor(() => expect(within(dialog).queryByTestId('card-cover-image')).not.toBeInTheDocument());
  });
});

describe('attachments: accessibility', () => {
  it('keeps the visible text inside the accessible names of the buttons', async () => {
    openCard(CARD_PATH, withAttachments(REPORT));
    const dialog = await cardDialog();

    for (const [name, visible] of [
      ['“rapor.pdf” ekini sil', 'Sil'],
      ['İndir: “rapor.pdf”', 'İndir'],
    ] as const) {
      const control = await within(dialog).findByRole(name.startsWith('İndir') ? 'link' : 'button', { name });
      expect(control.textContent).toBe(visible);
      expect(name.toLocaleLowerCase('tr-TR')).toContain(visible.toLocaleLowerCase('tr-TR'));
    }
  });

  it('is operated with the keyboard', async () => {
    const user = userEvent.setup();
    openCard(CARD_PATH, withAttachments(REPORT));
    const dialog = await cardDialog();
    const sil = within(dialog).getByRole('button', { name: '“rapor.pdf” ekini sil' });

    sil.focus();
    await user.keyboard('{Enter}');

    expect(await screen.findByRole('dialog', { name: 'Ek silinsin mi?' })).toBeInTheDocument();
  });
});
