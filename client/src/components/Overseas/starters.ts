import { BriefcaseBusiness, FileSearch, FileText, Home } from 'lucide-react';
import type { ConversationStarter } from '~/components/Chat/Input/StarterList';
import useLocalize from '~/hooks/useLocalize';

export default function useOverseasStarters(): ConversationStarter[] {
  const localize = useLocalize();
  return [
    {
      label: localize('com_ui_overseas_jobs'),
      text: localize('com_ui_overseas_jobs_prompt'),
      icon: BriefcaseBusiness,
    },
    {
      label: localize('com_ui_overseas_posting'),
      text: localize('com_ui_overseas_posting_prompt'),
      icon: FileSearch,
    },
    {
      label: localize('com_ui_overseas_materials'),
      text: localize('com_ui_overseas_materials_prompt'),
      icon: FileText,
    },
    {
      label: localize('com_ui_overseas_housing'),
      text: localize('com_ui_overseas_housing_prompt'),
      icon: Home,
    },
  ];
}
