import React from 'react';
import { useForm } from 'react-hook-form';
import userEvent from '@testing-library/user-event';
import { fireEvent, render, screen, within } from 'test/layout-test-utils';
import type { ChatFormValues } from '~/common';
import { ChatFormProvider } from '~/Providers/ChatFormContext';
import StarterList from '../StarterList';

jest.mock('~/hooks/AuthContext', () => ({
  AuthContextProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const starters = [{ label: 'Review a job', text: 'Review this job description.' }];
const onSubmit = jest.fn();

function Harness({ draft = '', disabled = false }: { draft?: string; disabled?: boolean }) {
  const methods = useForm<ChatFormValues>({ defaultValues: { text: draft } });
  return (
    <ChatFormProvider {...methods}>
      <form onSubmit={methods.handleSubmit(onSubmit)}>
        <StarterList starters={starters} disabled={disabled} />
        <textarea aria-label="Message" id="prompt-textarea" {...methods.register('text')} />
      </form>
    </ChatFormProvider>
  );
}

describe('Conversation starter drafts', () => {
  test('fills and focuses the composer without submitting, and notifies the draft saver', async () => {
    render(<Harness />);
    const input = screen.getByRole('textbox');
    const onInput = jest.fn();
    input.addEventListener('input', onInput);

    await userEvent.click(screen.getByRole('button', { name: 'Review a job' }));

    expect(input).toHaveValue(starters[0].text);
    expect(input).toHaveFocus();
    expect(onInput).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('keyboard activation only fills the draft', async () => {
    render(<Harness />);
    screen.getByRole('button', { name: 'Review a job' }).focus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('textbox')).toHaveValue(starters[0].text);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('cancelling preserves an existing draft verbatim', async () => {
    const draft = '  My experience\nUnfinished thought  ';
    render(<Harness draft={draft} />);
    await userEvent.click(screen.getByRole('button', { name: 'Review a job' }));
    expect(screen.getByRole('textbox', { hidden: true })).toHaveValue(draft);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('textbox')).toHaveValue(draft);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('appends only after confirmation and keeps the original text', async () => {
    render(<Harness draft="My original text" />);
    await userEvent.click(screen.getByRole('button', { name: 'Review a job' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add to draft' }));
    expect(screen.getByRole('textbox')).toHaveValue(`My original text\n\n${starters[0].text}`);
    expect(screen.getByRole('textbox')).toHaveFocus();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('replaces only after confirmation', async () => {
    render(<Harness draft="My original text" />);
    await userEvent.click(screen.getByRole('button', { name: 'Review a job' }));
    await userEvent.click(screen.getByRole('button', { name: 'Replace draft' }));
    expect(screen.getByRole('textbox')).toHaveValue(starters[0].text);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('pressing Escape dismisses the decision without discarding the draft', async () => {
    render(<Harness draft="Keep me" />);
    await userEvent.click(screen.getByRole('button', { name: 'Review a job' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('Keep me');
  });

  test('repeated selection of the same question does not duplicate or submit it', async () => {
    render(<Harness draft={starters[0].text} />);
    await userEvent.dblClick(screen.getByRole('button', { name: 'Review a job' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue(starters[0].text);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('disabling during a pending decision prevents stale edits', async () => {
    const { rerender } = render(<Harness draft="Keep me" />);
    await userEvent.click(screen.getByRole('button', { name: 'Review a job' }));
    rerender(<Harness draft="Keep me" disabled />);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    const button = within(screen.getByRole('group')).getByRole('button');
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(screen.getByRole('textbox')).toHaveValue('Keep me');
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
