import { Mic, Square, Trash2, X } from 'lucide-react';
import {
  Button,
  IconButton,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@librechat/client';
import useLocalize from '~/hooks/useLocalize';
import useLocalRecording from './recording';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recording: ReturnType<typeof useLocalRecording>;
}

export default function Voice({ open, onOpenChange, recording }: Props) {
  const localize = useLocalize();
  const close = (value: boolean) => {
    if (!value && recording.state === 'requesting') recording.discard();
    if (!value) recording.stop();
    onOpenChange(value);
  };
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto" showCloseButton={false}>
        <DialogHeader>
          <div className="flex items-start justify-between gap-2">
            <DialogTitle>{localize('com_ui_guest_voice')}</DialogTitle>
            <IconButton label={localize('com_ui_close')} onClick={() => close(false)}>
              <X className="size-4" aria-hidden="true" />
            </IconButton>
          </div>
          <DialogDescription>{localize('com_ui_flow_voice_notice')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 px-6">
          <p role="status" className="text-sm text-text-secondary">
            {recording.state === 'error'
              ? localize('com_ui_guest_voice_error')
              : localize('com_ui_flow_voice_local')}
          </p>
          {recording.url && (
            // eslint-disable-next-line jsx-a11y/media-has-caption -- This is the user's untranscribed local recording, not published audio; no caption is fabricated.
            <audio
              controls
              src={recording.url}
              className="w-full"
              aria-label={localize('com_ui_guest_playback')}
            />
          )}
          <div className="flex flex-wrap items-center gap-2">
            {recording.state === 'recording' ? (
              <Button onClick={recording.stop}>
                <Square className="mr-2 size-4" aria-hidden="true" />
                {localize('com_ui_guest_stop')} ({recording.seconds}/60)
              </Button>
            ) : (
              <Button
                onClick={recording.start}
                disabled={recording.state === 'requesting' || Boolean(recording.blob)}
              >
                <Mic className="mr-2 size-4" aria-hidden="true" />
                {localize('com_ui_guest_record')}
              </Button>
            )}
            {(recording.blob || recording.state === 'requesting') && (
              <IconButton
                label={localize('com_ui_delete')}
                title={localize('com_ui_delete')}
                onClick={recording.discard}
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </IconButton>
            )}
          </div>
          <Button disabled>{localize('com_ui_guest_transcription_pending')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
