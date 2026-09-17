import { FileText, Trash2, Check, X } from 'lucide-react';
import {
  Button,
  IconButton,
  Textarea,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@librechat/client';
import type { LocalDocument } from './documents';
import useLocalize from '~/hooks/useLocalize';
import { documentLimits } from './documents';

interface Props {
  documents: LocalDocument[];
  selected: string | null;
  disabled: boolean;
  onSelect: (id: string | null) => void;
  onChange: (documents: LocalDocument[]) => void;
}

export default function Attachments({ documents, selected, disabled, onSelect, onChange }: Props) {
  const localize = useLocalize();
  const current = documents.find((item) => item.id === selected);
  const update = (changes: Partial<Pick<LocalDocument, 'text' | 'confirmed'>>) =>
    onChange(documents.map((item) => (item.id === selected ? { ...item, ...changes } : item)));

  return (
    <>
      {documents.length > 0 && (
        <ul className="flex flex-col gap-1" aria-label={localize('com_ui_guest_documents')}>
          {documents.map((file) => (
            <li key={file.id} className="flex min-w-0 items-center gap-2">
              <Button
                variant="ghost"
                className="h-auto min-w-0 flex-1 justify-start whitespace-normal break-all text-left"
                disabled={disabled}
                onClick={() => onSelect(file.id)}
              >
                <FileText className="mr-2 size-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0">{file.name}</span>
                {file.confirmed && (
                  <Check
                    className="ml-2 size-4 shrink-0"
                    aria-label={localize('com_ui_guest_confirmed')}
                  />
                )}
              </Button>
              <IconButton
                label={localize('com_ui_delete')}
                title={localize('com_ui_delete')}
                disabled={disabled}
                onClick={() => onChange(documents.filter((item) => item.id !== file.id))}
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={Boolean(current)}
        onOpenChange={(open) => {
          if (!open) onSelect(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto" showCloseButton={false}>
          <DialogHeader>
            <div className="flex items-start justify-between gap-2">
              <DialogTitle>{localize('com_ui_guest_review')}</DialogTitle>
              <IconButton label={localize('com_ui_close')} onClick={() => onSelect(null)}>
                <X className="size-4" aria-hidden="true" />
              </IconButton>
            </div>
            <DialogDescription>{localize('com_ui_guest_document_notice')}</DialogDescription>
          </DialogHeader>
          {current && (
            <div className="flex min-w-0 flex-col gap-3 px-6">
              <label className="break-all text-sm" htmlFor="document-text">
                {current.name}
              </label>
              <Textarea
                id="document-text"
                rows={10}
                value={current.text}
                maxLength={documentLimits.characters}
                onChange={(event) => update({ text: event.target.value, confirmed: false })}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => onSelect(null)}>
              {localize('com_ui_cancel')}
            </Button>
            <Button
              disabled={!current?.text.trim() || current.text.includes('\0')}
              onClick={() => {
                update({ text: current?.text.trim() ?? '', confirmed: true });
                onSelect(null);
              }}
            >
              <Check className="mr-2 size-4" aria-hidden="true" />
              {localize('com_ui_guest_confirm_document')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
