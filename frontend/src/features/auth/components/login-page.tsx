import { Link, useLocation } from 'react-router';
import { Button } from '../../../shared/ui/button';
import { CenteredCard } from '../../../shared/ui/centered-card';
import { FormAlert } from '../../../shared/ui/form-alert';
import { TextField } from '../../../shared/ui/text-field';
import { useLoginForm } from '../hooks/use-login-form';

export function LoginPage() {
  const { form, onSubmit, isPending, serverError } = useLoginForm();
  // The other page keeps where to return to and the email to fill in.
  const { search, state } = useLocation();
  const {
    register,
    formState: { errors },
  } = form;

  return (
    <CenteredCard
      title="Giriş yap"
      footer={
        <>
          Hesabın yok mu?{' '}
          <Link to={{ pathname: '/register', search }} state={state} className="font-medium text-primary hover:text-primary-hover">
            Kayıt ol
          </Link>
        </>
      }
    >
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        {serverError && <FormAlert>{serverError}</FormAlert>}
        <TextField
          label="E-posta"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <TextField
          label="Parola"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />
        <Button type="submit" loading={isPending}>
          {isPending ? 'Giriş yapılıyor…' : 'Giriş yap'}
        </Button>
      </form>
    </CenteredCard>
  );
}
