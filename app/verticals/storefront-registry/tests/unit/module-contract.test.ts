import { describe, expect, it } from 'effect-rstest';
import { storefrontRegistryManifest } from '../../vertical.manifest.ts';
import { storefrontRegistryRegistration } from '../../vertical.registration.ts';

describe('Storefront Registry module contract', () => {
  it('is headless and exposes only the governed owner read', () => {
    expect(storefrontRegistryManifest.module.id).toBe('commerce.storefront-registry');
    expect(Object.keys(storefrontRegistryManifest.publicSurface.api)).toEqual(['current-storefront-application']);
    expect(storefrontRegistryManifest.publicSurface.actions).toEqual([]);
    expect(storefrontRegistryManifest.publicSurface.shellContributions.navigation).toEqual([]);
    expect(storefrontRegistryManifest.publicSurface.shellContributions.pages).toEqual([]);
    expect(storefrontRegistryRegistration.moduleId).toBe(storefrontRegistryManifest.module.id);
  });
});
