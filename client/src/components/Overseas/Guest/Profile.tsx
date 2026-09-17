import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Plus, Trash2, X } from 'lucide-react';
import {
  Button,
  Input,
  IconButton,
  Dropdown,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@librechat/client';
import { dataService, guestFieldSchema } from 'librechat-data-provider';
import type { OverseasProfile, GuestReply } from 'librechat-data-provider';
import useLocalize from '~/hooks/useLocalize';

export default function Profile({
  open,
  onClose,
  profile,
  proposals,
  signedIn,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  profile: OverseasProfile;
  proposals: GuestReply['facts'];
  signedIn: boolean;
  onSaved: () => void;
}) {
  const localize = useLocalize();
  const [entries, setEntries] = useState(profile.entries);
  const initialized = useRef(false);
  const [revision, setRevision] = useState(profile.revision);
  const [field, setField] = useState<(typeof guestFieldSchema.options)[number]>('occupation');
  const [error, setError] = useState(false);
  const mutation = useMutation({ mutationFn: dataService.updateGuestProfile, retry: false });
  useEffect(() => {
    if (!open) {
      initialized.current = false;
      return;
    }
    if (initialized.current) return;
    initialized.current = true;
    setRevision(profile.revision);
    const merged = new Map(profile.entries.map((entry) => [entry.field, entry]));
    for (const proposal of proposals)
      merged.set(proposal.field, {
        field: proposal.field,
        value: proposal.value,
        status: 'confirmed',
      });
    setEntries([...merged.values()]);
    setError(false);
  }, [open, profile, proposals]);
  const fieldName = (value: typeof field) => localize(`com_ui_flow_field_${value}`);
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value && !mutation.isLoading) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] max-w-xl overflow-y-auto" showCloseButton={false}>
        <DialogHeader>
          <div className="flex items-center justify-between gap-2">
            <DialogTitle>{localize('com_ui_flow_profile')}</DialogTitle>
            <IconButton
              label={localize('com_ui_close')}
              onClick={onClose}
              disabled={mutation.isLoading}
            >
              <X className="size-4" />
            </IconButton>
          </div>
          <DialogDescription>
            {localize(signedIn ? 'com_ui_flow_profile_account' : 'com_ui_flow_profile_guest')}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-5 px-6 pb-6"
          onSubmit={async (event) => {
            event.preventDefault();
            if (mutation.isLoading) return;
            setError(false);
            try {
              const result = await mutation.mutateAsync({
                revision,
                entries: entries.filter(
                  (entry) => entry.value.trim() || entry.status === 'declined',
                ),
              });
              if (result.status !== 'ok') {
                setError(true);
                return;
              }
              onSaved();
              onClose();
            } catch {
              setError(true);
            }
          }}
        >
          {!entries.length && (
            <p className="text-sm text-text-secondary">{localize('com_ui_flow_profile_empty')}</p>
          )}
          {entries.map((entry) => (
            <div key={entry.field} className="flex min-w-0 flex-col gap-2">
              <label
                htmlFor={`profile-${entry.field}`}
                className="flex items-center justify-between gap-2 text-sm font-medium"
              >
                {fieldName(entry.field)}
                <span className="text-xs font-normal text-text-secondary">
                  {localize(
                    profile.entries.some(
                      (saved) =>
                        saved.field === entry.field &&
                        saved.value === entry.value &&
                        saved.status === entry.status,
                    )
                      ? 'com_ui_flow_confirmed'
                      : 'com_ui_flow_unconfirmed',
                  )}
                </span>
              </label>
              <div className="flex min-w-0 items-center gap-2">
                <Input
                  id={`profile-${entry.field}`}
                  className="min-w-0 flex-1"
                  maxLength={240}
                  disabled={mutation.isLoading || entry.status === 'declined'}
                  value={entry.value}
                  onChange={(event) =>
                    setEntries(
                      entries.map((item) =>
                        item.field === entry.field ? { ...item, value: event.target.value } : item,
                      ),
                    )
                  }
                />
                <IconButton
                  label={`${localize('com_ui_delete')} ${fieldName(entry.field)}`}
                  disabled={mutation.isLoading}
                  onClick={() => setEntries(entries.filter((item) => item.field !== entry.field))}
                >
                  <Trash2 className="size-4" />
                </IconButton>
              </div>
              {proposals.find((proposal) => proposal.field === entry.field)?.evidence && (
                <blockquote className="break-words border-l-2 border-border-light pl-3 text-xs text-text-secondary">
                  {proposals.find((proposal) => proposal.field === entry.field)?.evidence}
                </blockquote>
              )}
              <label className="flex items-center gap-2 text-xs text-text-secondary">
                <input
                  type="checkbox"
                  checked={entry.status === 'declined'}
                  disabled={mutation.isLoading}
                  onChange={(event) =>
                    setEntries(
                      entries.map((item) =>
                        item.field === entry.field
                          ? {
                              ...item,
                              status: event.target.checked ? 'declined' : 'confirmed',
                              value: event.target.checked ? '' : item.value,
                            }
                          : item,
                      ),
                    )
                  }
                />
                {localize('com_ui_flow_decline')}
              </label>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <Dropdown
              portal={false}
              ariaLabel={localize('com_ui_flow_add_field')}
              value={field}
              options={guestFieldSchema.options.map((value) => ({
                value,
                label: fieldName(value),
              }))}
              onChange={(value) => setField(guestFieldSchema.parse(value))}
            />
            <IconButton
              label={localize('com_ui_flow_add_field')}
              disabled={entries.some((entry) => entry.field === field) || mutation.isLoading}
              onClick={() => setEntries([...entries, { field, value: '', status: 'confirmed' }])}
            >
              <Plus className="size-4" />
            </IconButton>
          </div>
          <p className="text-xs text-text-secondary">
            {localize('com_ui_flow_profile_delete_notice')}
          </p>
          {error && (
            <p role="alert" className="text-sm">
              {localize('com_ui_flow_profile_error')}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={mutation.isLoading}>
              {localize('com_ui_cancel')}
            </Button>
            <Button type="submit" disabled={mutation.isLoading}>
              {localize('com_ui_flow_confirm_save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
