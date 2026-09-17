import { atom } from 'recoil';
import { getLanguagePreference } from '~/locales/i18n';

const lang = atom<string>({
  key: 'lang',
  default: getLanguagePreference(),
  effects_UNSTABLE: [
    ({ setSelf, onSet }) => {
      setSelf(getLanguagePreference());
      onSet((value) => localStorage.setItem('lang', JSON.stringify(value)));
    },
  ],
});
const languageLoading = atom<boolean>({
  key: 'languageLoading',
  default: false,
});

export default { lang, languageLoading };
