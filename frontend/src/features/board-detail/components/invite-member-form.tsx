import { ASSIGNABLE_BOARD_ROLES } from '@trello/contracts';
import { useId } from 'react';
import { ROLE_LABEL } from '../../../shared/lib/board-role';
import { Button } from '../../../shared/ui/button';
import { FormAlert } from '../../../shared/ui/form-alert';
import { SelectField } from '../../../shared/ui/select-field';
import { TextField } from '../../../shared/ui/text-field';
import type { Announce } from '../hooks/use-dialog-status';
import type { useInviteForm } from '../hooks/use-invite-form';
import { InviteLinkField } from './invite-link-field';

interface InviteMemberFormProps {
  invite: ReturnType<typeof useInviteForm>;
  announce: Announce;
}

/** Email (and, for the owner, role) of a new invitation, and the link it leads to. */
export function InviteMemberForm({ invite, announce }: InviteMemberFormProps) {
  const headingId = useId();
  const {
    register,
    formState: { errors },
  } = invite.form;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h3 id={headingId} className="text-sm font-semibold">
        Davet et
      </h3>
      <form noValidate onSubmit={invite.submit} className="flex flex-col gap-3">
        {invite.formError && <FormAlert>{invite.formError}</FormAlert>}
        <TextField
          label="E-posta"
          type="email"
          autoComplete="off"
          error={errors.email?.message}
          {...register('email')}
        />
        <div className="flex flex-wrap items-end gap-3">
          {invite.canPickRole && (
            <SelectField label="Rol" {...register('role')}>
              {ASSIGNABLE_BOARD_ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABEL[role]}
                </option>
              ))}
            </SelectField>
          )}
          <Button type="submit" loading={invite.isPending}>
            Davet et
          </Button>
        </div>
      </form>
      {invite.link && <InviteLinkField link={invite.link} announce={announce} />}
    </section>
  );
}
