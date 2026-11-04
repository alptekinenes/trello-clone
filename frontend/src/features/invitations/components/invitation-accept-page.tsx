import type { InvitationPreviewDto } from '@trello/contracts';
import { Link, useParams } from 'react-router';
import { roleInSentence } from '../../../shared/lib/board-role';
import { formatDueLong } from '../../../shared/lib/date';
import { Button } from '../../../shared/ui/button';
import { buttonClassName } from '../../../shared/ui/button-styles';
import { CenteredCard } from '../../../shared/ui/centered-card';
import { FormAlert } from '../../../shared/ui/form-alert';
import { PageLoader } from '../../../shared/ui/page-loader';
import { authPageLink } from '../../auth';
import { useInvitationPage } from '../hooks/use-invitation-page';

type Page = ReturnType<typeof useInvitationPage>;

/** The only way on from a page; a button-sized target instead of a line of text. */
const LINK_BUTTON = buttonClassName('secondary');

/** Who invited whom to what, and until when. */
function PreviewSummary({ preview }: { preview: InvitationPreviewDto }) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p>
        <strong>{preview.inviterName}</strong> seni <strong>{preview.boardTitle}</strong> panosuna{' '}
        <strong>{roleInSentence(preview.role)}</strong> olarak davet etti.
      </p>
      <p className="text-fg-muted">
        Davet <strong className="text-fg">{preview.email}</strong> adresine gönderildi. Son
        geçerlilik: {formatDueLong(preview.expiresAt)}.
      </p>
    </div>
  );
}

function SignInChoices({ token, preview, page }: { token: string; preview: InvitationPreviewDto; page: Page }) {
  const returnUrl = `/invitations/${token}`;
  // Replacing keeps the page out of the history: once the user has joined, going back must not
  // show an invitation that is used up. The address is handed over so the form starts with it.
  const state = { email: preview.email };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">Daveti kabul etmek için hesap oluştur ya da giriş yap.</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Link
          to={authPageLink('register', returnUrl)}
          state={state}
          replace
          onClick={page.rememberIntent}
          className={buttonClassName('primary', 'flex-1')}
        >
          Kayıt ol
        </Link>
        <Link
          to={authPageLink('login', returnUrl)}
          state={state}
          replace
          onClick={page.rememberIntent}
          className={buttonClassName('secondary', 'flex-1')}
        >
          Giriş yap
        </Link>
      </div>
    </div>
  );
}

function WrongAccount({ preview, page }: { preview: InvitationPreviewDto; page: Page }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="rounded-md bg-warning-subtle px-3 py-2 text-sm text-warning">
        Bu davet <strong>{preview.email}</strong> adresine gönderildi. Şu an{' '}
        <strong>{page.user?.email}</strong> olarak giriş yaptın. Daveti kabul etmek için davet
        edilen adresle giriş yap.
      </p>
      {/* The header has a "Çıkış yap" button too; this one says what happens next. */}
      <Button
        variant="secondary"
        aria-label="Çıkış yap ve başka hesapla devam et"
        onClick={page.logout}
        loading={page.isLoggingOut}
      >
        Çıkış yap
      </Button>
    </div>
  );
}

function AcceptAction({ page }: { page: Page }) {
  return (
    <div className="flex flex-col gap-3">
      {page.acceptError && <FormAlert>{page.acceptError}</FormAlert>}
      {page.acceptRefused ? (
        <Link to="/boards" className={LINK_BUTTON}>
          Panolarına git
        </Link>
      ) : (
        <Button onClick={page.accept} loading={page.isAccepting}>
          {page.acceptError ? 'Tekrar dene' : 'Daveti kabul et'}
        </Button>
      )}
    </div>
  );
}

/**
 * What the page is busy with, in a live region that is always there: its text changes, the
 * element does not, or screen readers miss a message that arrives together with its region.
 */
function PageStatus({ page }: { page: Page }) {
  const { view } = page;
  const text =
    view.kind === 'ready' && view.viewer === 'checking'
      ? 'Oturum kontrol ediliyor…'
      : page.isAccepting
        ? 'Davet kabul ediliyor…'
        : '';
  return <output className="text-sm text-fg-muted empty:sr-only">{text}</output>;
}

function ReadyActions({ token, preview, page }: { token: string; preview: InvitationPreviewDto; page: Page }) {
  const { view } = page;
  if (view.kind !== 'ready') return null;

  switch (view.viewer) {
    case 'checking':
      return null;
    case 'anonymous':
      return <SignInChoices token={token} preview={preview} page={page} />;
    case 'mismatch':
      return <WrongAccount preview={preview} page={page} />;
    case 'match':
      return <AcceptAction page={page} />;
  }
}

/** Opened from the link of an invitation: what it is for, and the way to accept it. */
export function InvitationAcceptPage() {
  const { token = '' } = useParams();
  const page = useInvitationPage(token);
  const { view } = page;

  switch (view.kind) {
    case 'loading':
      return <PageLoader label="Davet yükleniyor…" />;
    case 'joining':
      return <PageLoader label="Panoya yönlendiriliyorsun…" />;
    case 'unavailable':
      return (
        <CenteredCard title="Davet kullanılamıyor">
          <div className="flex flex-col gap-4 text-sm">
            <p>{view.message}</p>
            {page.isLoggedIn ? (
              <Link to="/boards" className={LINK_BUTTON}>
                Panolarına git
              </Link>
            ) : (
              <Link to="/login" className={LINK_BUTTON}>
                Giriş yap
              </Link>
            )}
          </div>
        </CenteredCard>
      );
    case 'failed':
      return (
        <CenteredCard title="Panoya davet">
          <div className="flex flex-col items-start gap-3">
            <FormAlert>{view.message}</FormAlert>
            <Button variant="secondary" onClick={page.retryPreview} loading={page.isRetrying}>
              Tekrar dene
            </Button>
          </div>
        </CenteredCard>
      );
    case 'ready':
      return (
        <CenteredCard title="Panoya davet">
          <div className="flex flex-col gap-5">
            <PreviewSummary preview={view.preview} />
            <ReadyActions token={token} preview={view.preview} page={page} />
            <PageStatus page={page} />
          </div>
        </CenteredCard>
      );
  }
}
