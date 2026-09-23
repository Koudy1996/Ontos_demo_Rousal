import { useModernI18n } from '@modern-js/plugin-i18n/runtime';
import { Button } from '@techsio/ui-kit/atoms/button';
import { UltramodernRouteHead } from '../../ultramodern-route-head';

import { useInquiriesController } from './use-inquiries-controller.ts';
import { InquiryEditor } from './inquiry-editor.tsx';
import { InquiryList } from './inquiry-list.tsx';
import { InquiryDetail } from './inquiry-detail.tsx';

const InquiriesPage = () => {
  const { t } = useModernI18n();
  const label = (key: string) => t(`sales-inquiries.demo.${key}`);
  const controller = useInquiriesController();
  const { dispatch, locked, recover, runCommand, state } = controller;
  const { command, creating, editing, failure, pending, selected } = state;
  return (
    <>
      <UltramodernRouteHead />
      <section
        aria-labelledby="inquiries-heading"
        className="salesinquiries:mx-auto salesinquiries:w-full salesinquiries:max-w-5xl salesinquiries:px-4 salesinquiries:py-6"
      >
        <header className="salesinquiries:mb-6 salesinquiries:flex salesinquiries:flex-wrap salesinquiries:items-center salesinquiries:justify-between salesinquiries:gap-4">
          <h1 className="salesinquiries:text-3xl salesinquiries:font-bold" id="inquiries-heading">
            {label('title')}
          </h1>
          <Button
            disabled={locked}
            onClick={() => {
              dispatch({ selected: null });
              dispatch({ creating: true });
              dispatch({ editing: false });
              dispatch({ party: null });
              dispatch({ parties: [] });
              dispatch({ failure: null });
            }}
            size="lg"
          >
            {label('new')}
          </Button>
        </header>
        {failure !== null && (
          <div className="salesinquiries:mb-4" role="alert">
            <p>{label(`error.${failure.kind}`)}</p>
            {command === null && (
              <Button
                disabled={pending}
                onClick={() => {
                  dispatch({ failure: null });
                  controller.refresh();
                }}
                size="lg"
              >
                {label('refresh')}
              </Button>
            )}
            {command !== null && command.invocationId === undefined && (
              <Button disabled={pending} onClick={() => runCommand(command)} size="lg">
                {label('retry')}
              </Button>
            )}
            {command?.invocationId !== undefined && (
              <Button disabled={pending} onClick={recover} size="lg">
                {label('resolve')}
              </Button>
            )}
          </div>
        )}
        {pending && <output>{label('saving')}</output>}
        {(creating || editing) && <InquiryEditor controller={controller} label={label} />}
        {!creating && !editing && selected === null && <InquiryList controller={controller} label={label} />}
        {!creating && !editing && selected !== null && <InquiryDetail controller={controller} label={label} />}
      </section>
    </>
  );
};
export default InquiriesPage;
