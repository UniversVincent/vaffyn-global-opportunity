import { RotateCw } from 'lucide-react';
import { Button } from '@librechat/client';
import useLocalize from '~/hooks/useLocalize';
import Brand from '~/components/Brand';

export default function RouteErrorBoundary() {
  const localize = useLocalize();

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-surface-primary px-6 py-10 text-text-primary">
      <Brand />
      <div role="alert" className="flex max-w-md flex-col gap-3 text-center">
        <h1 className="text-xl font-semibold">{localize('com_ui_service_error')}</h1>
        <p className="text-sm text-text-secondary">{localize('com_ui_service_error_detail')}</p>
      </div>
      <Button variant="outline" onClick={() => window.location.reload()}>
        <RotateCw className="mr-2 size-4" aria-hidden="true" />
        {localize('com_ui_refresh_page')}
      </Button>
    </main>
  );
}
