import { zodResolver } from '@hookform/resolvers/zod';
import { ErrorCode } from '@trello/contracts';
import { useForm } from 'react-hook-form';
import { ApiError } from '../../../shared/lib/http';
import { useRegister } from '../api/use-auth-mutations';
import { authErrorMessage } from '../lib/auth-error-message';
import { registerSchema } from '../schemas/auth-schemas';

function isEmailTaken(error: unknown): boolean {
  return error instanceof ApiError && error.code === ErrorCode.EMAIL_TAKEN;
}

/** Register form state and submit. A taken email is shown on the email field itself. */
export function useRegisterForm() {
  const form = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '' },
  });
  const registerUser = useRegister();

  const onSubmit = form.handleSubmit((values) =>
    registerUser.mutate(values, {
      onError: (error) => {
        if (isEmailTaken(error)) {
          form.setError('email', { message: authErrorMessage(error) }, { shouldFocus: true });
        }
      },
    }),
  );

  const { error } = registerUser;
  return {
    form,
    onSubmit,
    isPending: registerUser.isPending,
    serverError: error && !isEmailTaken(error) ? authErrorMessage(error) : null,
  };
}
