import { useEffect, useRef, useState } from 'react';
import {
  Button,
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@librechat/client';
import type { LucideIcon } from 'lucide-react';
import { useChatFormContext } from '~/Providers/ChatFormContext';
import useLocalize from '~/hooks/useLocalize';
import { mainTextareaId } from '~/common';

export type ConversationStarter = {
  text: string;
  label?: string;
  icon?: LucideIcon;
};

export default function StarterList({
  starters,
  disabled = false,
  textareaId = mainTextareaId,
  compact = false,
}: {
  starters: ConversationStarter[];
  disabled?: boolean;
  textareaId?: string;
  compact?: boolean;
}) {
  const localize = useLocalize();
  const { getValues, setValue } = useChatFormContext();
  const [pending, setPending] = useState<ConversationStarter | null>(null);
  const focusOnClose = useRef(false);

  useEffect(() => {
    if (disabled) {
      setPending(null);
    }
  }, [disabled]);

  const focusComposer = () => document.getElementById(textareaId)?.focus();

  const fill = (text: string) => {
    if (disabled) {
      return;
    }
    setValue('text', text, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
    // The existing draft saver listens for input events, including programmatic fills.
    document.getElementById(textareaId)?.dispatchEvent(new Event('input', { bubbles: true }));
    if (pending) {
      focusOnClose.current = true;
      setPending(null);
      return;
    }
    focusComposer();
  };

  const select = (starter: ConversationStarter) => {
    const current = getValues('text');
    if (current?.trim() && current !== starter.text) {
      setPending(starter);
      return;
    }
    fill(starter.text);
  };

  if (!starters.length) {
    return null;
  }

  return (
    <>
      <div
        role="group"
        aria-label={localize('com_ui_starters')}
        className={
          compact
            ? 'flex flex-wrap justify-center gap-2'
            : 'grid w-full grid-cols-1 gap-2 min-[360px]:grid-cols-2 sm:grid-cols-4'
        }
      >
        {starters.map(({ icon: Icon, ...starter }, index) => (
          <Button
            key={`${index}-${starter.text}`}
            variant="outline"
            shape="default"
            disabled={disabled}
            title={starter.text}
            className={
              compact
                ? 'h-auto min-h-10 min-w-0 whitespace-normal px-3 py-2 text-left text-sm'
                : 'h-auto min-h-16 min-w-0 justify-start whitespace-normal px-3 py-3 text-left'
            }
            onClick={() => select(starter)}
          >
            {Icon && <Icon className="size-4 shrink-0" aria-hidden="true" />}
            <span className="line-clamp-2 min-w-0 break-words [overflow-wrap:anywhere]">
              {starter.label ?? starter.text}
            </span>
          </Button>
        ))}
      </div>
      <AlertDialog open={pending != null && !disabled} onOpenChange={() => setPending(null)}>
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            if (focusOnClose.current) {
              event.preventDefault();
              focusOnClose.current = false;
              focusComposer();
            }
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{localize('com_ui_starter_draft_title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {localize('com_ui_starter_draft_description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words text-sm text-text-secondary [overflow-wrap:anywhere]">
            {pending?.text}
          </p>
          <AlertDialogFooter className="gap-2 sm:space-x-0">
            <AlertDialogCancel>{localize('com_ui_cancel')}</AlertDialogCancel>
            <Button
              variant="outline"
              disabled={disabled}
              onClick={() => pending && fill(`${getValues('text')}\n\n${pending.text}`)}
            >
              {localize('com_ui_starter_append')}
            </Button>
            <Button disabled={disabled} onClick={() => pending && fill(pending.text)}>
              {localize('com_ui_starter_replace')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
