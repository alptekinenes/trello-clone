import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { Avatar } from './avatar';

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
