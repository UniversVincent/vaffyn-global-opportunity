import React from 'react';
import userEvent from '@testing-library/user-event';
import { render, screen, within } from 'test/layout-test-utils';
import Preparation from '../Preparation';

jest.mock('~/hooks/AuthContext', () => ({
  AuthContextProvider: ({ children }: { children: React.ReactNode }) => children,
}));

describe('Local question preparation', () => {
  test('copies the current draft without clearing or sending it', async () => {
    const user = userEvent.setup();
    const writeText = jest.spyOn(navigator.clipboard, 'writeText');
    render(<Preparation />);
    await user.type(screen.getByRole('textbox'), 'My current job question');
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith('My current job question');
    expect(screen.getByRole('status')).toHaveTextContent('Copied to clipboard');
    expect(screen.getByRole('textbox')).toHaveValue('My current job question');
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
  });

  test('reports a download failure without losing the draft', async () => {
    const original = URL.createObjectURL;
    URL.createObjectURL = () => {
      throw new Error('Download unavailable');
    };
    try {
      render(<Preparation />);
      await userEvent.type(screen.getByRole('textbox'), 'Keep this text');
      await userEvent.click(screen.getByRole('button', { name: 'Download' }));
      expect(screen.getByRole('status')).toHaveTextContent(
        'Unable to download. Your draft is still here.',
      );
      expect(screen.getByRole('textbox')).toHaveValue('Keep this text');
    } finally {
      URL.createObjectURL = original;
    }
  });

  test('requires confirmation to clear an unsent draft', async () => {
    render(<Preparation />);
    await userEvent.type(screen.getByRole('textbox'), 'Keep until confirmed');
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('textbox')).toHaveValue('Keep until confirmed');
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Clear' }),
    );
    expect(screen.getByRole('textbox')).toHaveValue('');
  });

  test('keeps whitespace-only drafts non-actionable', async () => {
    render(<Preparation />);
    await userEvent.type(screen.getByRole('textbox'), '   ');
    for (const name of ['Copy', 'Download', 'Clear', 'Send message']) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
  });
});
