import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useLogin } from '../api/use-auth-mutations';
import { authErrorMessage } from '../lib/auth-error-message';
import { loginSchema } from '../schemas/auth-schemas';

/**
 * Login form state and submit. On success the session is stored and
 * GuestRoute sends the user on to the page they came from.
 */
export function useLoginForm() {
  const form = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
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
