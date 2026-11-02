import { AUTH_LIMITS } from '@trello/contracts';
import { Link, useLocation } from 'react-router';
import { Button } from '../../../shared/ui/button';
import { CenteredCard } from '../../../shared/ui/centered-card';
import { FormAlert } from '../../../shared/ui/form-alert';
import { TextField } from '../../../shared/ui/text-field';
import { useRegisterForm } from '../hooks/use-register-form';

export function RegisterPage() {
  const { form, onSubmit, isPending, serverError } = useRegisterForm();
  // The other page keeps where to return to and the email to fill in.
  const { search, state } = useLocation();
  const {
    register,
    formState: { errors },
  } = form;

  return (
    <CenteredCard
      title="Hesap oluştur"
      footer={
        <>
          Zaten hesabın var mı?{' '}
          <Link to={{ pathname: '/login', search }} state={state} className="font-medium text-primary hover:text-primary-hover">
            Giriş yap
          </Link>
        </>
      }
    >
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        {serverError && <FormAlert>{serverError}</FormAlert>}
        <TextField label="Ad soyad" autoComplete="name" error={errors.name?.message} {...register('name')} />
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
          autoComplete="new-password"
          hint={`En az ${AUTH_LIMITS.PASSWORD_MIN} karakter.`}
          error={errors.password?.message}
          {...register('password')}
        />
        <Button type="submit" loading={isPending}>
          {isPending ? 'Hesap oluşturuluyor…' : 'Kayıt ol'}
        </Button>
      </form>
    </CenteredCard>
  );
}
