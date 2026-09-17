import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Copy, Download, Eraser, ArrowUp, BookOpen } from 'lucide-react';
import {
  Button,
  Textarea,
  IconButton,
  ThemeSelector,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@librechat/client';
import type { ChatFormValues } from '~/common';
import { ChatFormProvider } from '~/Providers/ChatFormContext';
import StarterList from '~/components/Chat/Input/StarterList';
import Language from '~/components/Nav/Language';
import Brand from '~/components/Brand';
import useLocalize from '~/hooks/useLocalize';
import useOverseasStarters from './starters';

const textareaId = 'overseas-draft';

export default function Preparation() {
  const localize = useLocalize();
  const starters = useOverseasStarters();
  const methods = useForm<ChatFormValues>({ defaultValues: { text: '' } });
  const text = useWatch({ control: methods.control, name: 'text' });
  const [confirmClear, setConfirmClear] = useState(false);
  const [status, setStatus] = useState<'idle' | 'copied' | 'copy-error' | 'download-error'>('idle');

  useEffect(() => setStatus('idle'), [text]);

  useEffect(() => {
    if (!text.trim()) {
      return;
    }
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [text]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(methods.getValues('text'));
      setStatus('copied');
    } catch {
      setStatus('copy-error');
    }
  };

  const download = () => {
    let url: string | undefined;
    const link = document.createElement('a');
    try {
      url = URL.createObjectURL(
        new Blob([methods.getValues('text')], { type: 'text/plain;charset=utf-8' }),
      );
      link.href = url;
      link.download = 'overseas-question.txt';
      document.body.appendChild(link);
      link.click();
    } catch {
      setStatus('download-error');
    } finally {
      link.remove();
      if (url) {
        URL.revokeObjectURL(url);
      }
    }
  };

  const statusText = {
    idle: localize('com_ui_overseas_unsent'),
    copied: localize('com_ui_copied_to_clipboard'),
    'copy-error': localize('com_ui_copy_failed'),
    'download-error': localize('com_ui_overseas_download_error'),
  }[status];

  return (
    <ChatFormProvider {...methods}>
      <div className="flex min-h-dvh flex-col bg-surface-primary text-text-primary">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border-light px-4 py-4 sm:px-6">
          <Brand />
          <div className="flex items-center gap-2">
            <Language />
            <ThemeSelector returnThemeOnly />
          </div>
        </header>
        <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center gap-6 px-4 py-8 sm:px-8">
          <h1 className="text-2xl font-semibold">{localize('com_ui_overseas_title')}</h1>
          <StarterList starters={starters} textareaId={textareaId} />
          <form onSubmit={(event) => event.preventDefault()} className="flex flex-col gap-3">
            <label htmlFor={textareaId} className="sr-only">
              {localize('com_ui_message_input')}
            </label>
            <Textarea
              {...methods.register('text')}
              id={textareaId}
              rows={9}
              className="max-h-[50dvh] min-h-40 resize-y"
              placeholder={localize('com_ui_overseas_draft_placeholder')}
              autoComplete="off"
              spellCheck={false}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p role="status" className="min-w-0 break-words text-sm text-text-secondary">
                {statusText}
              </p>
              <div className="flex shrink-0 items-center gap-1">
                <IconButton
                  label={localize('com_ui_copy')}
                  title={localize('com_ui_copy')}
                  disabled={!text.trim()}
                  onClick={copy}
                >
                  <Copy className="size-4" aria-hidden="true" />
                </IconButton>
                <IconButton
                  label={localize('com_ui_download')}
                  title={localize('com_ui_download')}
                  disabled={!text.trim()}
                  onClick={download}
                >
                  <Download className="size-4" aria-hidden="true" />
                </IconButton>
                <IconButton
                  label={localize('com_ui_clear')}
                  title={localize('com_ui_clear')}
                  disabled={!text.trim()}
                  onClick={() => setConfirmClear(true)}
                >
                  <Eraser className="size-4" aria-hidden="true" />
                </IconButton>
                <Button
                  size="icon"
                  disabled
                  aria-label={localize('com_nav_send_message')}
                  title={localize('com_ui_overseas_local_only')}
                >
                  <ArrowUp className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          </form>
          <p className="text-xs text-text-secondary">{localize('com_ui_overseas_local_only')}</p>
          <a
            href="./research"
            className="flex w-fit items-center gap-2 text-sm text-text-secondary"
          >
            <BookOpen className="size-4" aria-hidden="true" />
            {localize('com_ui_research_title')}
          </a>
        </main>
        <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{localize('com_ui_overseas_reset_title')}</AlertDialogTitle>
              <AlertDialogDescription>
                {localize('com_ui_overseas_reset_description')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{localize('com_ui_cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={() => methods.reset({ text: '' })}>
                {localize('com_ui_clear')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </ChatFormProvider>
  );
}
