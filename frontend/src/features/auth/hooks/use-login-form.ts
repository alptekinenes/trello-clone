import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useLocation } from 'react-router';
import { useLogin } from '../api/use-auth-mutations';
import { authErrorMessage } from '../lib/auth-error-message';
import { prefillEmail } from '../lib/redirect-target';
import { loginSchema } from '../schemas/auth-schemas';

/**
 * Login form state and submit. On success the session is stored and
 * GuestRoute sends the user on to the page they came from.
 */
export function useLoginForm() {
  const { state } = useLocation();
  const form = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: prefillEmail(state), password: '' },
  });
  const login = useLogin();

  const onSubmit = form.handleSubmit((values) => login.mutate(values));

  return {
    form,
    onSubmit,
    isPending: login.isPending,
    serverError: login.error ? authErrorMessage(login.error) : null,
  };
}
