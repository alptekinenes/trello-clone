import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/auth-store';
import { authApi } from './auth-api';

export function useLogin() {
  const setSession = useAuthStore((state) => state.setSession);
  return useMutation({ mutationFn: authApi.login, onSuccess: setSession });
}

export function useRegister() {
  const setSession = useAuthStore((state) => state.setSession);
  return useMutation({ mutationFn: authApi.register, onSuccess: setSession });
}

/** Signs out locally even if the server call fails, and drops all cached data. */
export function useLogout() {
  const queryClient = useQueryClient();
  const clearSession = useAuthStore((state) => state.clearSession);
  return useMutation({
    mutationFn: authApi.logout,
    onSettled: () => {
      clearSession();
      queryClient.clear();
    },
  });
}
