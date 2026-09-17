import useLocalize from '~/hooks/useLocalize';

export default function Brand() {
  const localize = useLocalize();
  return (
    <span className="inline-flex shrink-0 items-center gap-2 text-lg font-semibold text-text-primary">
      <img src="assets/vaffyn.svg" className="size-7" alt="" />
      {localize('com_ui_brand_name')}
    </span>
  );
}
