import { Link as LocalizedLink, useModernI18n } from '@modern-js/plugin-i18n/runtime';
import { Badge } from '@techsio/ui-kit/atoms/badge';
import { Button } from '@techsio/ui-kit/atoms/button';
import { Link } from '@techsio/ui-kit/atoms/link';
import { StatusText } from '@techsio/ui-kit/atoms/status-text';
import { Popover } from '@techsio/ui-kit/molecules/popover';
import { SearchForm } from '@techsio/ui-kit/molecules/search-form';
import { Select } from '@techsio/ui-kit/molecules/select';
import type { SelectItem } from '@techsio/ui-kit/molecules/select';
import { Header } from '@techsio/ui-kit/organisms/header';
import { useState } from 'react';
import type { ReactNode } from 'react';

import type { ShellUnavailableDeployment } from '../../shared/api.ts';

interface DashboardAccount {
  readonly displayName: string;
}

interface DashboardNavigationItem {
  readonly enabled: boolean;
  readonly href?: string;
  readonly label: string;
  readonly moduleId: string;
  readonly state: 'active' | 'deprecated' | 'read_only';
  readonly unavailable: boolean;
}

interface DashboardTenantItem {
  readonly name: string;
  readonly tenantId: string;
}

interface DashboardLegalEntityItem {
  readonly legalEntityId: string;
  readonly legalName: string;
}

export interface AuthenticatedDashboardLayoutProps {
  readonly children: ReactNode;
  readonly currentLegalEntityId?: string;
  readonly currentModuleId?: string;
  readonly currentTenantId: string;
  readonly homeCurrent?: boolean;
  readonly identity: DashboardAccount;
  readonly legalEntityChoices: readonly DashboardLegalEntityItem[];
  readonly legalEntityState: 'available' | 'unavailable';
  readonly legalEntitySwitchFailed: boolean;
  readonly legalEntitySwitchPending: boolean;
  readonly logoutPending: boolean;
  readonly navigation: readonly DashboardNavigationItem[];
  readonly onLegalEntityChange: (legalEntityId: string) => void;
  readonly onLogout: () => void;
  readonly onSearch: (query: string) => void;
  readonly onTenantChange: (tenantId: string) => void;
  readonly tenantChoices: readonly DashboardTenantItem[];
  readonly tenantState: 'available' | 'unavailable';
  readonly tenantSwitchFailed: boolean;
  readonly tenantSwitchPending: boolean;
  readonly title?: string;
  readonly unavailableDeployments: readonly ShellUnavailableDeployment[];
}

interface DashboardTenantSelectorProps {
  readonly currentTenantId: string;
  readonly onTenantChange: (tenantId: string) => void;
  readonly tenantChoices: readonly DashboardTenantItem[];
  readonly tenantState: AuthenticatedDashboardLayoutProps['tenantState'];
  readonly tenantSwitchFailed: boolean;
  readonly tenantSwitchPending: boolean;
}

interface DashboardLegalEntitySelectorProps {
  readonly currentLegalEntityId: string | undefined;
  readonly legalEntityChoices: readonly DashboardLegalEntityItem[];
  readonly legalEntityState: AuthenticatedDashboardLayoutProps['legalEntityState'];
  readonly legalEntitySwitchFailed: boolean;
  readonly legalEntitySwitchPending: boolean;
  readonly onLegalEntityChange: (legalEntityId: string) => void;
}

interface DashboardSelectorProps {
  readonly ariaLabel?: string;
  readonly currentValue: string | undefined;
  readonly disabled: boolean;
  readonly items: SelectItem[];
  readonly label: string;
  readonly name: string;
  readonly onChange: (value: string) => void;
  readonly placeholder: string;
  readonly status: 'default' | 'error' | 'warning';
  readonly statusId: string;
  readonly statusText: string | null;
}

interface DashboardSearchProps {
  readonly onSearch: (query: string) => void;
  readonly onValueChange: (value: string) => void;
  readonly value: string;
}

interface DashboardModuleNavigationItemProps {
  readonly currentModuleId: string | undefined;
  readonly module: DashboardNavigationItem;
}

interface DashboardDeploymentNavigationItemProps {
  readonly deployment: ShellUnavailableDeployment;
}

interface DashboardNavigationProps {
  readonly currentModuleId: string | undefined;
  readonly homeCurrent: boolean | undefined;
  readonly navigation: readonly DashboardNavigationItem[];
  readonly unavailableDeployments: readonly ShellUnavailableDeployment[];
}

interface DashboardHeaderProps extends DashboardSearchProps {
  readonly children: ReactNode;
  readonly identity: DashboardAccount;
  readonly logoutPending: boolean;
  readonly navigationOpen: boolean;
  readonly onLogout: () => void;
  readonly onNavigationToggle: () => void;
}

export const moduleNavigationLabel = (
  moduleId: string,
  fallback: string,
  translate: (key: string) => string,
): string => {
  const key = `shell.dashboard.moduleNames.${moduleId}`;
  const translated = translate(key);
  return translated === key ? fallback : translated;
};

const selectorStatus = (failed: boolean, unavailable: boolean): 'default' | 'error' | 'warning' => {
  if (failed) {
    return 'error';
  }
  return unavailable ? 'warning' : 'default';
};

const selectorStatusText = (
  pending: boolean,
  failed: boolean,
  unavailable: boolean,
  messages: {
    readonly failed: string;
    readonly pending: string;
    readonly unavailable: string;
  },
): string | null => {
  if (pending) {
    return messages.pending;
  }
  if (failed) {
    return messages.failed;
  }
  return unavailable ? messages.unavailable : null;
};

const DashboardSelector = ({
  ariaLabel,
  currentValue,
  disabled,
  items,
  label,
  name,
  onChange,
  placeholder,
  status,
  statusId,
  statusText,
}: DashboardSelectorProps) => (
  <Select
    disabled={disabled}
    items={items}
    name={name}
    onValueChange={({ value }) => {
      const [selected] = value;
      if (value.length === 1 && selected !== undefined && selected !== currentValue) {
        onChange(selected);
      }
    }}
    validateStatus={status}
    value={currentValue === undefined ? [] : [currentValue]}
  >
    <Select.Label>{label}</Select.Label>
    <Select.Control>
      <Select.Trigger aria-describedby={statusText === null ? undefined : statusId} aria-label={ariaLabel}>
        <Select.ValueText placeholder={placeholder} />
      </Select.Trigger>
    </Select.Control>
    <Select.Positioner>
      <Select.Content>
        {items.map((item) => (
          <Select.Item item={item} key={item.value}>
            <Select.ItemText />
            <Select.ItemIndicator />
          </Select.Item>
        ))}
      </Select.Content>
    </Select.Positioner>
    {statusText === null ? null : (
      <Select.StatusText aria-live="polite" id={statusId} showIcon status={status}>
        {statusText}
      </Select.StatusText>
    )}
  </Select>
);

const DashboardTenantSelector = ({
  currentTenantId,
  onTenantChange,
  tenantChoices,
  tenantState,
  tenantSwitchFailed,
  tenantSwitchPending,
}: DashboardTenantSelectorProps) => {
  const { t } = useModernI18n();
  const tenantItems = tenantChoices.map(({ name, tenantId }) => ({
    displayValue: name,
    label: name,
    value: tenantId,
  }));
  const tenantUnavailable = tenantState === 'unavailable';
  const accessibleLabel = t('shell.dashboard.tenant.accessibleLabel');
  const unavailableText = t('shell.dashboard.tenant.unavailable');

  return (
    <DashboardSelector
      ariaLabel={accessibleLabel}
      currentValue={currentTenantId}
      disabled={tenantUnavailable || tenantSwitchPending || !tenantItems.some((item) => item.value !== currentTenantId)}
      items={tenantItems}
      label={accessibleLabel}
      name="tenant"
      onChange={onTenantChange}
      placeholder={unavailableText}
      status={selectorStatus(tenantSwitchFailed, tenantUnavailable)}
      statusId="tenant-switch-status"
      statusText={selectorStatusText(tenantSwitchPending, tenantSwitchFailed, tenantUnavailable, {
        failed: t('shell.dashboard.tenant.failed'),
        pending: t('shell.dashboard.tenant.pending'),
        unavailable: unavailableText,
      })}
    />
  );
};

const DashboardLegalEntitySelector = ({
  currentLegalEntityId,
  legalEntityChoices,
  legalEntityState,
  legalEntitySwitchFailed,
  legalEntitySwitchPending,
  onLegalEntityChange,
}: DashboardLegalEntitySelectorProps) => {
  const { t } = useModernI18n();
  const legalEntityItems = legalEntityChoices.map(({ legalEntityId, legalName }) => ({
    displayValue: legalName,
    label: legalName,
    value: legalEntityId,
  }));
  const legalEntityUnavailable = legalEntityState === 'unavailable';

  return (
    <DashboardSelector
      currentValue={currentLegalEntityId}
      disabled={legalEntityUnavailable || legalEntitySwitchPending}
      items={legalEntityItems}
      label={t('shell.dashboard.legalEntity.accessibleLabel')}
      name="legalEntity"
      onChange={onLegalEntityChange}
      placeholder={t('shell.dashboard.legalEntity.placeholder')}
      status={selectorStatus(legalEntitySwitchFailed, legalEntityUnavailable)}
      statusId="legal-entity-switch-status"
      statusText={selectorStatusText(legalEntitySwitchPending, legalEntitySwitchFailed, legalEntityUnavailable, {
        failed: t('shell.dashboard.legalEntity.failed'),
        pending: t('shell.dashboard.legalEntity.pending'),
        unavailable: t('shell.dashboard.legalEntity.unavailable'),
      })}
    />
  );
};

const DashboardSearch = ({ onSearch, onValueChange, value }: DashboardSearchProps) => {
  const { t } = useModernI18n();

  return (
    <SearchForm
      className="shell:min-w-0 shell:flex-1"
      onSubmit={(event) => {
        event.preventDefault();
        const query = value.trim();
        if (query.length > 0) {
          onSearch(query);
        }
      }}
      onValueChange={onValueChange}
      size="sm"
      value={value}
    >
      <SearchForm.Label className="shell:sr-only">{t('shell.search.label')}</SearchForm.Label>
      <SearchForm.Control>
        <SearchForm.Input
          aria-label={t('shell.search.label')}
          className="shell:min-h-11 shell:text-base"
          placeholder={t('shell.search.placeholder')}
        />
        <SearchForm.ClearButton aria-label={t('shell.search.clear')} />
        <SearchForm.Button
          aria-label={t('shell.search.submit')}
          className="shell:min-h-11 shell:min-w-11"
          showSearchIcon
        >
          <span className="shell:sr-only shell:sm:not-sr-only">{t('shell.search.submit')}</span>
        </SearchForm.Button>
      </SearchForm.Control>
    </SearchForm>
  );
};

const DashboardModuleNavigationItem = ({ currentModuleId, module }: DashboardModuleNavigationItemProps) => {
  const { t } = useModernI18n();

  return (
    <li className="shell:flex shell:flex-wrap shell:items-center shell:gap-2">
      {module.enabled && module.href !== undefined ? (
        <Link
          aria-current={currentModuleId === module.moduleId ? 'page' : undefined}
          as={LocalizedLink}
          className="shell:flex shell:min-h-11 shell:w-full shell:items-center shell:rounded-xl shell:px-4 shell:py-3 shell:text-sm shell:font-medium shell:text-um-muted shell:transition-colors shell:hover:bg-um-cream shell:hover:text-um-foreground shell:focus-visible:outline-2 shell:focus-visible:outline-offset-2 shell:focus-visible:outline-um-link shell:aria-[current=page]:bg-um-accent-subtle shell:aria-[current=page]:font-semibold shell:aria-[current=page]:text-um-link"
          to={module.href}
        >
          {moduleNavigationLabel(module.moduleId, module.label, t)}
        </Link>
      ) : (
        <span>{moduleNavigationLabel(module.moduleId, module.label, t)}</span>
      )}
      {module.state === 'read_only' ? (
        <Badge size="sm" variant="warning">
          {t('shell.modules.state.readOnly')}
        </Badge>
      ) : null}
      {module.state === 'deprecated' ? (
        <Badge size="sm" variant="warning">
          {t('shell.modules.state.deprecated')}
        </Badge>
      ) : null}
      {module.unavailable ? (
        <StatusText showIcon size="sm" status="warning">
          {t('shell.modules.unavailable')}
        </StatusText>
      ) : null}
    </li>
  );
};

const DashboardDeploymentNavigationItem = ({ deployment }: DashboardDeploymentNavigationItemProps) => {
  const { t } = useModernI18n();

  return (
    <li className="shell:flex shell:flex-wrap shell:items-center shell:gap-2">
      <span>{deployment.appId}</span>
      <StatusText showIcon size="sm" status="warning">
        {t(`shell.modules.discovery.${deployment.status === 'unavailable' ? deployment.reason : deployment.status}`)}
      </StatusText>
    </li>
  );
};

const DashboardNavigation = ({
  currentModuleId,
  homeCurrent = true,
  navigation,
  unavailableDeployments,
}: DashboardNavigationProps) => {
  const { t } = useModernI18n();

  return (
    <nav aria-label={t('shell.dashboard.navigation.label')}>
      <ul className="shell:flex shell:flex-col shell:gap-1">
        <li>
          <Link
            aria-current={homeCurrent && currentModuleId === undefined ? 'page' : undefined}
            as={LocalizedLink}
            className="shell:flex shell:min-h-11 shell:w-full shell:items-center shell:rounded-xl shell:px-4 shell:py-3 shell:text-sm shell:font-medium shell:text-um-muted shell:transition-colors shell:hover:bg-um-cream shell:hover:text-um-foreground shell:focus-visible:outline-2 shell:focus-visible:outline-offset-2 shell:focus-visible:outline-um-link shell:aria-[current=page]:bg-um-accent-subtle shell:aria-[current=page]:font-semibold shell:aria-[current=page]:text-um-link"
            to="/"
          >
            {t('shell.dashboard.navigation.home')}
          </Link>
        </li>
        {navigation.map((module) => (
          <DashboardModuleNavigationItem currentModuleId={currentModuleId} key={module.moduleId} module={module} />
        ))}
        {unavailableDeployments.map((deployment) => (
          <DashboardDeploymentNavigationItem deployment={deployment} key={deployment.appId} />
        ))}
      </ul>
    </nav>
  );
};

const DashboardHeader = ({
  children,
  identity,
  logoutPending,
  navigationOpen,
  onLogout,
  onNavigationToggle,
  onSearch,
  onValueChange,
  value,
}: DashboardHeaderProps) => {
  const { t } = useModernI18n();

  return (
    <Header
      aria-label={t('shell.dashboard.header.label')}
      className="shell:sticky shell:top-0 shell:z-30 shell:gap-2 shell:border-b shell:border-um-border shell:bg-um-surface shell:px-3 shell:py-2 shell:md:px-5"
      size="sm"
    >
      <Header.Container
        className="shell:flex shell:min-w-0 shell:flex-1 shell:items-center shell:gap-2"
        position="start"
      >
        <Button
          aria-controls="workspace-navigation"
          aria-expanded={navigationOpen}
          aria-label={t(navigationOpen ? 'shell.dashboard.navigation.hide' : 'shell.dashboard.navigation.show')}
          className="shell:min-h-11 shell:min-w-11 shell:shrink-0 shell:md:hidden"
          icon={navigationOpen ? 'token-icon-header-close' : 'token-icon-header-menu'}
          onClick={onNavigationToggle}
          size="sm"
          theme="outlined"
          variant="secondary"
        />
        <div className="shell:min-w-0 shell:max-w-xl shell:flex-1">
          <DashboardSearch onSearch={onSearch} onValueChange={onValueChange} value={value} />
        </div>
      </Header.Container>
      <Header.Container className="shell:w-auto shell:shrink-0" position="end">
        <Popover placement="bottom-end">
          <Popover.Trigger
            aria-label={t('shell.dashboard.account.label')}
            className="shell:min-h-11"
            size="sm"
            theme="outlined"
            variant="secondary"
          >
            {t('shell.dashboard.account.action')}
          </Popover.Trigger>
          <Popover.Positioner className="shell:z-50">
            <Popover.Content className="shell:w-80 shell:max-w-[calc(100vw-1rem)]">
              <Popover.Title>{t('shell.dashboard.account.label')}</Popover.Title>
              <p className="shell:mb-4 shell:break-words shell:text-sm shell:text-um-muted">{identity.displayName}</p>
              <div className="shell:flex shell:flex-col shell:gap-4">
                {children}
                <Button disabled={logoutPending} onClick={onLogout} size="sm" theme="outlined" variant="secondary">
                  {t(logoutPending ? 'shell.auth.logout.pending' : 'shell.auth.logout.action')}
                </Button>
              </div>
            </Popover.Content>
          </Popover.Positioner>
        </Popover>
      </Header.Container>
    </Header>
  );
};

export const AuthenticatedDashboardLayout = (props: AuthenticatedDashboardLayoutProps) => {
  const { t } = useModernI18n();
  const [searchValue, setSearchValue] = useState('');
  const [navigationOpen, setNavigationOpen] = useState(false);

  return (
    <div className="shell:flex shell:min-h-screen shell:min-w-0 shell:flex-col shell:bg-(--color-page-bg) shell:text-(--color-page-fg)">
      <DashboardHeader
        identity={props.identity}
        logoutPending={props.logoutPending}
        navigationOpen={navigationOpen}
        onLogout={props.onLogout}
        onNavigationToggle={() => setNavigationOpen((open) => !open)}
        onSearch={props.onSearch}
        onValueChange={setSearchValue}
        value={searchValue}
      >
        <DashboardTenantSelector
          currentTenantId={props.currentTenantId}
          onTenantChange={props.onTenantChange}
          tenantChoices={props.tenantChoices}
          tenantState={props.tenantState}
          tenantSwitchFailed={props.tenantSwitchFailed}
          tenantSwitchPending={props.tenantSwitchPending}
        />
        <DashboardLegalEntitySelector
          currentLegalEntityId={props.currentLegalEntityId}
          legalEntityChoices={props.legalEntityChoices}
          legalEntityState={props.legalEntityState}
          legalEntitySwitchFailed={props.legalEntitySwitchFailed}
          legalEntitySwitchPending={props.legalEntitySwitchPending}
          onLegalEntityChange={props.onLegalEntityChange}
        />
      </DashboardHeader>
      <div className="shell:flex shell:min-w-0 shell:flex-1 shell:flex-col shell:md:flex-row">
        <aside
          aria-label={t('shell.dashboard.sidebar.label')}
          className={`${navigationOpen ? 'shell:block' : 'shell:hidden'} shell:shrink-0 shell:border-b shell:border-um-border shell:bg-um-surface shell:p-3 shell:md:block shell:md:w-64 shell:md:border-r shell:md:border-b-0`}
          id="workspace-navigation"
        >
          <DashboardNavigation
            currentModuleId={props.currentModuleId}
            homeCurrent={props.homeCurrent}
            navigation={props.navigation}
            unavailableDeployments={props.unavailableDeployments}
          />
        </aside>
        <main className="shell:flex shell:min-w-0 shell:flex-1 shell:flex-col">
          {props.title === undefined ? null : (
            <h2 className="shell:px-4 shell:pt-4 shell:text-sm shell:font-semibold shell:text-um-muted">
              {props.title}
            </h2>
          )}
          <div className="shell:min-w-0 shell:flex-1 shell:px-2 shell:py-4 shell:leading-relaxed shell:lg:px-4">
            {props.children}
          </div>
        </main>
      </div>
    </div>
  );
};
