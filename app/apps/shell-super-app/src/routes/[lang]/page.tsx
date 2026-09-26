import { Link as LocalizedLink, useModernI18n } from '@modern-js/plugin-i18n/runtime';
import { useLoaderData } from '@modern-js/plugin-tanstack/runtime';
import { LinkButton } from '@techsio/ui-kit/atoms/link-button';
import { StatusText } from '@techsio/ui-kit/atoms/status-text';

import { AuthenticatedDashboardLayout, moduleNavigationLabel } from '../shell-frame';
import { UltramodernRouteHead } from '../ultramodern-route-head';
import { useShellControls } from '../use-shell-controls.ts';
import type { HomePageModel } from './page.data.ts';

interface HomeViewProps {
  readonly initialModel: HomePageModel;
}

export const HomeView = ({ initialModel }: HomeViewProps) => {
  const { t } = useModernI18n();
  const model = initialModel;
  const controls = useShellControls(model.state === 'authenticated' ? model : undefined);

  if (model.state === 'anonymous') {
    return (
      <>
        <UltramodernRouteHead />
        <main className="shell:flex shell:min-h-screen shell:items-center shell:justify-center shell:bg-(--color-page-bg) shell:p-4">
          <LinkButton as={LocalizedLink} size="md" theme="solid" to="/login" variant="primary">
            {t('shell.auth.loginLink')}
          </LinkButton>
        </main>
      </>
    );
  }

  if (model.state === 'unavailable') {
    return (
      <>
        <UltramodernRouteHead />
        <main className="shell:flex shell:min-h-screen shell:items-center shell:justify-center shell:bg-(--color-page-bg) shell:p-4">
          <StatusText aria-live="polite" showIcon status="error">
            {t('shell.dashboard.unavailable')}
          </StatusText>
        </main>
      </>
    );
  }

  return (
    <>
      <UltramodernRouteHead />
      <AuthenticatedDashboardLayout
        {...(model.selectedLegalEntityId === undefined ? {} : { currentLegalEntityId: model.selectedLegalEntityId })}
        currentTenantId={model.identity.tenantId}
        identity={{ displayName: model.identity.displayName }}
        legalEntityChoices={model.legalEntities.items}
        legalEntityState={model.legalEntities.state}
        legalEntitySwitchFailed={controls.legalEntitySwitchFailed}
        legalEntitySwitchPending={controls.legalEntitySwitchPending}
        logoutPending={controls.logoutPending}
        navigation={model.navigation.items}
        onLegalEntityChange={controls.handleLegalEntityChange}
        onLogout={controls.handleLogout}
        onSearch={controls.handleSearch}
        onTenantChange={controls.handleTenantChange}
        tenantChoices={model.tenants.items}
        tenantState={model.tenants.state}
        tenantSwitchFailed={controls.tenantSwitchFailed}
        tenantSwitchPending={controls.tenantSwitchPending}
        title={t('shell.dashboard.home.title')}
        unavailableDeployments={model.navigation.unavailableDeployments}
      >
        <div className="shell:mx-auto shell:w-full shell:max-w-6xl shell:px-4 shell:py-6 shell:sm:px-6">
          <header className="shell:mb-8 shell:rounded-2xl shell:bg-um-cream shell:p-6 shell:sm:p-8">
            <h1 className="shell:text-3xl shell:font-semibold shell:tracking-tight shell:text-um-foreground">
              {t('shell.dashboard.home.welcome')}
            </h1>
            <p className="shell:mt-3 shell:max-w-2xl shell:text-um-muted">{t('shell.dashboard.home.intro')}</p>
          </header>
          <ul className="shell:mb-8 shell:grid shell:gap-4 shell:sm:grid-cols-2 shell:xl:grid-cols-3">
            {model.navigation.items.map((item) =>
              item.enabled && item.href !== undefined ? (
                <li key={item.moduleId}>
                  <LinkButton
                    as={LocalizedLink}
                    block
                    className="shell:min-h-24 shell:flex-col shell:items-start"
                    size="md"
                    theme="outlined"
                    to={item.href}
                    variant="primary"
                  >
                    {moduleNavigationLabel(item.moduleId, item.label, t)}
                    <span className="shell:text-sm shell:font-normal shell:text-um-muted">
                      {t('shell.dashboard.home.open')}
                    </span>
                  </LinkButton>
                </li>
              ) : null,
            )}
          </ul>
          <section
            aria-label={t('shell.auth.identity.title')}
            className="shell:flex shell:w-full shell:flex-col shell:gap-4 shell:rounded-2xl shell:border shell:border-um-border shell:bg-um-surface shell:p-6"
          >
            <details>
              <summary className="shell:cursor-pointer shell:font-semibold">{t('shell.auth.identity.title')}</summary>
              <dl className="shell:mt-4 shell:grid shell:gap-4 shell:break-words shell:sm:grid-cols-2">
                <div>
                  <dt className="shell:font-semibold">{t('shell.auth.identity.displayName')}</dt>
                  <dd>{model.identity.displayName}</dd>
                </div>
                <div>
                  <dt className="shell:font-semibold">{t('shell.auth.identity.email')}</dt>
                  <dd>{model.identity.email}</dd>
                </div>
                <div>
                  <dt className="shell:font-semibold">{t('shell.auth.identity.principal')}</dt>
                  <dd>{model.identity.principalId}</dd>
                </div>
                <div>
                  <dt className="shell:font-semibold">{t('shell.auth.identity.tenant')}</dt>
                  <dd>{model.identity.tenantId}</dd>
                </div>
                {model.contextState === 'authenticated' ? (
                  <div>
                    <dt className="shell:font-semibold">{t('shell.auth.identity.legalEntity')}</dt>
                    <dd>{model.selectedLegalEntityId}</dd>
                  </div>
                ) : null}
              </dl>
            </details>
            {model.contextState === 'selection_required' ? (
              <StatusText aria-live="polite" showIcon status="warning">
                {t('shell.dashboard.legalEntity.selectionRequired')}
              </StatusText>
            ) : null}
            {model.contextState === 'access_blocked' ? (
              <StatusText aria-live="polite" showIcon status="error">
                {t('shell.dashboard.legalEntity.accessBlocked')}
              </StatusText>
            ) : null}
            {model.navigation.state === 'unavailable' ? (
              <StatusText aria-live="polite" id="module-navigation-unavailable" showIcon status="error">
                {t('shell.modules.unavailable')}
              </StatusText>
            ) : null}
            {controls.logoutFailed ? (
              <StatusText aria-live="polite" showIcon status="error">
                {t('shell.auth.logout.failed')}
              </StatusText>
            ) : null}
          </section>
        </div>
      </AuthenticatedDashboardLayout>
    </>
  );
};

const ShellHome = () => {
  const initialModel = useLoaderData({ from: '/$lang' });
  return <HomeView initialModel={initialModel} />;
};

export default ShellHome;
