import { AUTH_LIMITS, type UserDto } from '@trello/contracts';
import { Button } from '../../../shared/ui/button';
import { Dialog, useDialogClose } from '../../../shared/ui/dialog';
import { FormAlert } from '../../../shared/ui/form-alert';
import { TextField } from '../../../shared/ui/text-field';
import { useProfileForm } from '../hooks/use-profile-form';

function ProfileForm({ user }: { user: UserDto }) {
  const close = useDialogClose();
  const { form, onSubmit, isPending, serverError } = useProfileForm(user, close);
  const {
    register,
    formState: { errors },
  } = form;

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
      {serverError && <FormAlert>{serverError}</FormAlert>}

      <TextField
        label="Ad soyad"
        autoComplete="name"
        maxLength={AUTH_LIMITS.NAME_MAX}
        error={errors.name?.message}
        {...register('name')}
      />
      <TextField
        label="E-posta"
        value={user.email}
        readOnly
        hint="E-posta adresi değiştirilemez."
      />
      <TextField
        label="Avatar adresi"
        type="url"
        inputMode="url"
        autoComplete="off"
        hint="https:// ile başlayan bir görsel adresi. Boş bırakırsan baş harfler gösterilir."
        error={errors.avatarUrl?.message}
        {...register('avatarUrl')}
      />

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={close}>
          Vazgeç
        </Button>
        <Button type="submit" loading={isPending}>
          {isPending ? 'Kaydediliyor…' : 'Kaydet'}
        </Button>
      </div>
    </form>
  );
}

export function ProfileDialog({ user, onClose }: { user: UserDto; onClose: () => void }) {
  return (
    <Dialog title="Profil" onClose={onClose}>
      <ProfileForm user={user} />
    </Dialog>
  );
}
