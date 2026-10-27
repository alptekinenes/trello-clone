import { AUTH_LIMITS } from '@trello/contracts';
import { Link } from 'react-router';
import { Button } from '../../../shared/ui/button';
import { FormAlert } from '../../../shared/ui/form-alert';
import { TextField } from '../../../shared/ui/text-field';
import { useRegisterForm } from '../hooks/use-register-form';
import { AuthCard } from './auth-card';

export function RegisterPage() {
  const { form, onSubmit, isPending, serverError } = useRegisterForm();
  const {
    register,
    formState: { errors },
  } = form;

  return (
    <AuthCard
      title="Hesap oluştur"
      footer={
        <>
          Zaten hesabın var mı?{' '}
          <Link to="/login" className="font-medium text-primary hover:text-primary-hover">
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
    </AuthCard>
  );
}
