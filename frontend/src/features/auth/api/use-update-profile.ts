import { useMutation } from '@tanstack/react-query';
import { useAuthStore } from '../store/auth-store';
import { usersApi } from './users-api';

/** Saves the profile and puts the returned user into the auth store (the only place it lives). */
export function useUpdateProfile() {
  const setUser = useAuthStore((state) => state.setUser);
  return useMutation({ mutationFn: usersApi.updateMe, onSuccess: setUser });
}
