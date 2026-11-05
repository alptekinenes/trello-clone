import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { Avatar, AvatarStack } from './avatar';

it('loads the picture without sending a referrer', () => {
  render(<Avatar person={{ name: 'Ayşe Demir', avatarUrl: 'https://example.com/a.png' }} />);

  expect(screen.getByRole('img', { name: 'Ayşe Demir' })).toHaveAttribute('referrerpolicy', 'no-referrer');
});

it('falls back to the initials when the picture fails to load', () => {
  render(<Avatar person={{ name: 'Ayşe Demir', avatarUrl: 'https://example.com/broken.png' }} />);

  fireEvent.error(screen.getByRole('img', { name: 'Ayşe Demir' }));

  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(screen.getByText('AD')).toBeInTheDocument();
});

it('is smaller with size="sm", also inside a stack', () => {
  render(
    <>
      <Avatar size="sm" person={{ name: 'Ayşe Demir', avatarUrl: null }} />
      <AvatarStack
        size="sm"
        label="Kart üyeleri"
        people={[{ id: 'u1', name: 'Can Yılmaz', avatarUrl: null }]}
      />
    </>,
  );

  expect(screen.getByTitle('Ayşe Demir')).toHaveClass('size-6');
  expect(screen.getByTitle('Can Yılmaz')).toHaveClass('size-6');
});

it('is medium by default', () => {
  render(<Avatar person={{ name: 'Ayşe Demir', avatarUrl: null }} />);

  expect(screen.getByTitle('Ayşe Demir')).toHaveClass('size-8');
});
