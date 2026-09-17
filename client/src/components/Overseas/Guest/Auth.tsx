import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Eye, EyeOff, X } from 'lucide-react';
import {
  Button,
  Input,
  IconButton,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@librechat/client';
import { dataService, localAccountSchema } from 'librechat-data-provider';
import type { GuestState } from 'librechat-data-provider';
import useLocalize from '~/hooks/useLocalize';

export default function Auth({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: (state: GuestState) => void;
}) {
  const localize = useLocalize();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState(false);
  const action = useMutation({
    mutationFn: () => dataService.guestAccountAction(mode, { username, password }),
    retry: false,
  });
  const close = () => {
    if (!action.isLoading) {
      setPassword('');
      setConfirm('');
      setError(false);
      onClose();
    }
  };
  const actionLabel = mode === 'login' ? 'com_auth_login' : 'com_ui_flow_register';
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) close();
      }}
    >
      <DialogContent className="max-h-[90dvh] max-w-md overflow-y-auto" showCloseButton={false}>
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <DialogTitle>
              {localize(mode === 'login' ? 'com_auth_login' : 'com_ui_flow_register')}
            </DialogTitle>
            <IconButton
              label={localize('com_ui_close')}
              onClick={close}
              disabled={action.isLoading}
            >
              <X className="size-4" />
            </IconButton>
          </div>
          <DialogDescription>{localize('com_ui_flow_local_account')}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4 px-6 pb-6"
          onSubmit={async (event) => {
            event.preventDefault();
            if (action.isLoading) return;
            setError(false);
            if (
              !localAccountSchema.safeParse({ username, password }).success ||
              (mode === 'register' && password !== confirm)
            ) {
              setError(true);
              return;
            }
            try {
              const result = await action.mutateAsync();
              if (result.status !== 'ok') {
                setError(true);
                return;
              }
              setPassword('');
              setConfirm('');
              onSuccess(result.state);
              onClose();
            } catch {
              setError(true);
            }
          }}
        >
          <div className="flex flex-col gap-2">
            <label htmlFor="local-username" className="text-sm">
              {localize('com_ui_flow_username')}
            </label>
            <Input
              id="local-username"
              autoComplete="username"
              required
              pattern="[A-Za-z0-9_]{3,32}"
              minLength={3}
              maxLength={32}
              value={username}
              disabled={action.isLoading}
              onChange={(event) => setUsername(event.target.value)}
              aria-describedby="username-hint"
            />
            <p id="username-hint" className="text-xs text-text-secondary">
              {localize('com_ui_flow_username_hint')}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="local-password" className="text-sm">
              {localize('com_auth_password')}
            </label>
            <div className="flex items-center gap-2">
              <Input
                id="local-password"
                className="min-w-0 flex-1"
                type={visible ? 'text' : 'password'}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                minLength={15}
                maxLength={128}
                required
                disabled={action.isLoading}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-describedby="password-hint"
              />
              <IconButton
                label={localize(
                  visible ? 'com_ui_flow_hide_password' : 'com_ui_flow_show_password',
                )}
                onClick={() => setVisible(!visible)}
              >
                {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </IconButton>
            </div>
            <p id="password-hint" className="text-xs text-text-secondary">
              {localize('com_ui_flow_password_hint')}
            </p>
          </div>
          {mode === 'register' && (
            <div className="flex flex-col gap-2">
              <label htmlFor="local-confirm" className="text-sm">
                {localize('com_ui_flow_confirm_password')}
              </label>
              <Input
                id="local-confirm"
                type={visible ? 'text' : 'password'}
                autoComplete="new-password"
                required
                disabled={action.isLoading}
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
              />
            </div>
          )}
          <p className="text-xs text-text-secondary">{localize('com_ui_flow_account_storage')}</p>
          {error && (
            <p role="alert" className="text-sm text-text-primary">
              {localize('com_ui_flow_auth_error')}
            </p>
          )}
          <Button type="submit" disabled={action.isLoading}>
            {localize(action.isLoading ? 'com_ui_loading' : actionLabel)}
          </Button>
          <Button
            variant="ghost"
            disabled={action.isLoading}
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setError(false);
            }}
          >
            {localize(mode === 'login' ? 'com_ui_flow_to_register' : 'com_ui_flow_to_login')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
