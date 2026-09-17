import { Check, LockKeyhole, X } from 'lucide-react';
import {
  Button,
  IconButton,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@librechat/client';
import type { Membership } from 'librechat-data-provider';
import useLocalize from '~/hooks/useLocalize';

export default function MembershipDialog({
  open,
  onClose,
  membership,
  onLogin,
}: {
  open: boolean;
  onClose: () => void;
  membership: Membership;
  onLogin: () => void;
}) {
  const localize = useLocalize();
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto" showCloseButton={false}>
        <DialogHeader>
          <div className="flex items-center justify-between gap-2">
            <DialogTitle>{localize('com_ui_flow_membership')}</DialogTitle>
            <IconButton label={localize('com_ui_close')} onClick={onClose}>
              <X className="size-4" />
            </IconButton>
          </div>
          <DialogDescription>{localize('com_ui_flow_plans_notice')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col divide-y divide-border-light px-6 pb-6">
          {(['free', 'standard', 'advanced'] as const).map((plan) => (
            <section key={plan} className="flex flex-wrap items-start justify-between gap-3 py-5">
              <div className="min-w-0 flex-1">
                <h3 className="flex items-center gap-2 font-medium">
                  {localize(`com_ui_flow_plan_${plan}`)}
                  {membership === plan && (
                    <Check className="size-4" aria-label={localize('com_ui_flow_current_plan')} />
                  )}
                </h3>
                <p className="mt-2 max-w-md text-sm leading-6 text-text-secondary">
                  {localize(`com_ui_flow_plan_${plan}_detail`)}
                </p>
              </div>
              {plan === 'free' && membership === 'guest' ? (
                <Button size="sm" onClick={onLogin}>
                  {localize('com_ui_flow_register')}
                </Button>
              ) : (
                <Button size="sm" variant="outline" disabled>
                  <LockKeyhole className="mr-2 size-4" aria-hidden="true" />
                  {localize(
                    membership === plan
                      ? 'com_ui_flow_current_plan'
                      : 'com_ui_flow_purchase_pending',
                  )}
                </Button>
              )}
            </section>
          ))}
          {membership === 'advanced' && (
            <section className="py-4">
              <h3 className="font-medium">{localize('com_ui_flow_extended')}</h3>
              <p className="mt-2 text-sm text-text-secondary">
                {localize('com_ui_flow_extended_detail')}
              </p>
              <Button className="mt-3" disabled>
                {localize('com_ui_flow_purchase_pending')}
              </Button>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
