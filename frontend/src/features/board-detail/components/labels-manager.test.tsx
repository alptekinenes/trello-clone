import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CreateLabelRequest, LabelDto, UpdateLabelRequest } from '@trello/contracts';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { BOARD_ID, boardDetail, testUser } from '../../../test/fixtures';
import { server } from '../../../test/msw-server';
import { renderApp } from '../../../test/render';
import { useAuthStore } from '../../auth/store/auth-store';

const RED: LabelDto = { id: 'label-red', boardId: BOARD_ID, name: 'Acil', color: 'RED' };

/** Labels as the server has them; the board GET reads them, handlers in tests change them. */
let serverLabels: LabelDto[] = [];

async function openManager(labels: LabelDto[] = [RED]) {
  serverLabels = labels;
  useAuthStore.getState().setSession({ accessToken: 'token', user: testUser });
  server.use(
    http.get(`*/api/v1/boards/${BOARD_ID}`, () =>
      HttpResponse.json(boardDetail('MEMBER', 'Pano', [], [], serverLabels)),
    ),
  );
  renderApp(`/boards/${BOARD_ID}`);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Etiketler' }));
  const dialog = await screen.findByRole('dialog', { name: 'Etiketler' });
  return { user, dialog };
}

describe('LabelsManager', () => {
  it('lists the labels of the board', async () => {
    const { dialog } = await openManager();

    const list = within(dialog).getByRole('list', { name: 'Pano etiketleri' });
    expect(within(list).getByText('Acil')).toBeInTheDocument();
  });

  it('creates a label with a name and a color', async () => {
    const { user, dialog } = await openManager([]);
    let sent: CreateLabelRequest | null = null;
    server.use(
      http.post(`*/api/v1/boards/${BOARD_ID}/labels`, async ({ request }) => {
        sent = (await request.json()) as CreateLabelRequest;
        const label: LabelDto = { id: 'label-new', boardId: BOARD_ID, name: 'Plan', color: 'BLUE' };
        serverLabels = [...serverLabels, label];
        return HttpResponse.json(label, { status: 201 });
      }),
    );

    await user.click(within(dialog).getByRole('button', { name: 'Yeni etiket' }));
    await user.type(within(dialog).getByRole('textbox', { name: 'Etiket adı' }), 'Plan');
    await user.click(within(dialog).getByRole('radio', { name: 'Mavi' }));
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }));

    expect(await within(dialog).findByText('Plan')).toBeInTheDocument();
    expect(sent).toEqual({ name: 'Plan', color: 'BLUE' });
    expect(within(dialog).queryByRole('textbox', { name: 'Etiket adı' })).not.toBeInTheDocument();
  });

  it('renames a label', async () => {
    const { user, dialog } = await openManager();
    let sent: UpdateLabelRequest | null = null;
    server.use(
      http.patch(`*/api/v1/labels/${RED.id}`, async ({ request }) => {
        sent = (await request.json()) as UpdateLabelRequest;
        serverLabels = [{ ...RED, name: 'Çok acil' }];
        return HttpResponse.json(serverLabels[0]);
      }),
    );

    await user.click(within(dialog).getByRole('button', { name: '“Acil” etiketini düzenle' }));
    const input = within(dialog).getByRole('textbox', { name: 'Etiket adı' });
    expect(input).toHaveValue('Acil');
    await user.clear(input);
    await user.type(input, 'Çok acil');
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }));

    expect(await within(dialog).findByText('Çok acil')).toBeInTheDocument();
    expect(sent).toEqual({ name: 'Çok acil', color: 'RED' });
  });

  it('deletes a label only after confirmation', async () => {
    const { user, dialog } = await openManager();
    server.use(
      http.delete(`*/api/v1/labels/${RED.id}`, () => {
        serverLabels = [];
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await user.click(within(dialog).getByRole('button', { name: '“Acil” etiketini düzenle' }));
    await user.click(within(dialog).getByRole('button', { name: 'Sil' }));
    const confirm = await screen.findByRole('dialog', { name: 'Etiket silinsin mi?' });
    expect(within(confirm).getByText(/tüm kartlardan kaldırılacak/)).toBeInTheDocument();
    await user.click(within(confirm).getByRole('button', { name: 'Etiketi sil' }));

    await within(dialog).findByText('Bu panoda henüz etiket yok.');
    expect(within(dialog).queryByText('Acil')).not.toBeInTheDocument();
  });

  it('refuses a name longer than 50 characters with a message tied to the field', async () => {
    const { user, dialog } = await openManager([]);

    await user.click(within(dialog).getByRole('button', { name: 'Yeni etiket' }));
    const input = within(dialog).getByRole('textbox', { name: 'Etiket adı' });
    input.removeAttribute('maxlength');
    await user.click(input);
    await user.paste('a'.repeat(51));
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }));

    expect(input).toHaveAccessibleDescription('Etiket adı en fazla 50 karakter olabilir.');
    expect(input).toBeInvalid();
  });
});
