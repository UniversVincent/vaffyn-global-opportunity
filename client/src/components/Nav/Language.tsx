import { useState } from 'react';
import Cookies from 'js-cookie';
import { Languages } from 'lucide-react';
import { Dropdown } from '@librechat/client';
import { useRecoilState, useSetRecoilState } from 'recoil';
import i18n, { changeLanguageSafely, normalizeLocale } from '~/locales/i18n';
import useLocalize from '~/hooks/useLocalize';
import store from '~/store';

export default function Language({ portal = true }: { portal?: boolean }) {
  const localize = useLocalize();
  const setLanguage = useSetRecoilState(store.lang);
  const [loading, setLoading] = useRecoilState(store.languageLoading);
  const [failed, setFailed] = useState(false);

  return (
    <div className="flex max-w-48 flex-col gap-1">
      <Dropdown
        portal={portal}
        value={normalizeLocale(i18n.language)}
        ariaLabel={localize('com_nav_language')}
        icon={<Languages className="size-4 shrink-0" aria-hidden="true" />}
        disabled={loading}
        options={[
          { value: 'zh-Hans', label: localize('com_ui_language_simplified') },
          { value: 'zh-Hant', label: localize('com_nav_lang_traditional_chinese') },
          { value: 'en', label: localize('com_nav_lang_english') },
        ]}
        onChange={async (value) => {
          setLoading(true);
          setFailed(false);
          try {
            const applied = await changeLanguageSafely(value);
            setLanguage(applied);
            Cookies.set('lang', applied, { expires: 365, sameSite: 'Lax', path: '/' });
            setFailed(applied !== normalizeLocale(value));
          } catch {
            setFailed(true);
          } finally {
            setLoading(false);
          }
        }}
      />
      {failed && (
        <p role="alert" className="text-xs text-text-secondary">
          {localize('com_ui_language_unavailable')}
        </p>
      )}
    </div>
  );
}
