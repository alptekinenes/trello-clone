import { zodResolver } from '@hookform/resolvers/zod';
import type { UserDto } from '@trello/contracts';
import { useForm } from 'react-hook-form';
import { apiErrorMessage } from '../../../shared/lib/api-error-message';
import { useUpdateProfile } from '../api/use-update-profile';
import { profileSchema, toUpdateMeRequest } from '../schemas/profile-schema';

/** Profile form state and submit; `onSaved` runs after the server accepted the change. */
export function useProfileForm(user: UserDto, onSaved: () => void) {
  const form = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: user.name, avatarUrl: user.avatarUrl ?? '' },
  });
  const updateProfile = useUpdateProfile();

  const onSubmit = form.handleSubmit((values) =>
    updateProfile.mutate(toUpdateMeRequest(values), { onSuccess: onSaved }),
  );

  return {
    form,
    onSubmit,
    isPending: updateProfile.isPending,
    serverError: updateProfile.error ? apiErrorMessage(updateProfile.error) : null,
  };
}
