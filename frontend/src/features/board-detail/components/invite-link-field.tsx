import { INVITATION_LIMITS } from '@trello/contracts';
import { useRef } from 'react';
import { useCopyToClipboard } from '../../../shared/hooks/use-copy-to-clipboard';
import { Button } from '../../../shared/ui/button';
import { TextField } from '../../../shared/ui/text-field';
import type { Announce } from '../hooks/use-dialog-status';
import { INVITE_COPY_BUTTON_ID, type InviteLink } from '../hooks/use-invite-form';

interface InviteLinkFieldProps {
  link: InviteLink;
  /** Text for the dialog's status region. */
  announce: Announce;
}

/** The invitation link to hand over, selectable and copyable. Shown once; the server keeps no copy. */
export function InviteLinkField({ link, announce }: InviteLinkFieldProps) {
  const { copy } = useCopyToClipboard();
  const inputRef = useRef<HTMLInputElement>(null);

  async function copyLink() {
    if ((await copy(link.inviteUrl)) === 'copied') {
      announce('Bağlantı kopyalandı.');
    } else {
      inputRef.current?.focus();
      inputRef.current?.select();
      announce('Kopyalanamadı. Bağlantıyı seçip elle kopyala.');
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-md bg-surface-sunken p-3">
      <p className="text-sm font-medium break-words">{`${link.email} için davet bağlantısı`}</p>
      <TextField
        ref={inputRef}
        label="Davet bağlantısı"
        readOnly
        value={link.inviteUrl}
        onFocus={(event) => event.currentTarget.select()}
        hint={`Bağlantıyı yalnızca davet ettiğin kişiyle paylaş. Bağlantı ${INVITATION_LIMITS.TTL_DAYS} gün geçerli ve yalnızca ${link.email} adresiyle açılan bir hesapla kabul edilebilir. Yeniden davet edersen bu bağlantı geçersiz olur.`}
      />
      <Button id={INVITE_COPY_BUTTON_ID} variant="secondary" className="self-start" onClick={copyLink}>
        Bağlantıyı kopyala
      </Button>
    </div>
  );
}
