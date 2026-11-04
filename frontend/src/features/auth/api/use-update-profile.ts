import { useMutation, useQueryClient } from '@tanstack/react-query';
import { boardKeys } from '../../boards';
import { useAuthStore } from '../store/auth-store';
import { usersApi } from './users-api';

/**
 * Saves the profile and puts the returned user into the auth store (the only place it lives).
 * Boards carry member names and avatars, so their cache is refreshed too.
 */
export function useUpdateProfile() {
  const setUser = useAuthStore((state) => state.setUser);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: usersApi.updateMe,
    onSuccess: (user) => {
      setUser(user);
      void queryClient.invalidateQueries({ queryKey: boardKeys.all });
    },
  });
}
