// Review this inventory when the EasyWork release adds or removes a package.
// Only product packages are selected or exposed by the default personal Profile.
export const PRODUCT_PACKAGES = Object.freeze([
  'easywork-plugin-connectors',
  'easywork-plugin-experts',
  'easywork-plugin-library',
  'easywork-plugin-models',
  'easywork-plugin-projects',
  'easywork-plugin-skills',
])

// Former enterprise packages are unsupported by the personal carrier and forbidden in its composition.
export const UNSUPPORTED_ENTERPRISE_PACKAGES = Object.freeze([
  'easywork-provider-identity-enterprise',
  'easywork-plugin-enterprise-collaboration',
  'easywork-enterprise-connection',
])

// Keep the already shipped community catalog integrations on the same Profile.
export const CATALOG_PACKAGES = Object.freeze({
  '@cocofhu/skillhub': '0.2.16',
  dshmarket: '1.66.8',
})

export const RELEASE_PACKAGES = Object.freeze([
  'easywork-plugin-models',
  'easywork-contracts',
  'easywork-ui',
  'easywork-provider-identity-local',
  'easywork-provider-browser-session',
  'easywork-plugin-audit',
  'easywork-plugin-access',
  'easywork-plugin-skills',
  'easywork-plugin-experts',
  'easywork-plugin-connectors',
  'easywork-plugin-library',
  'easywork-bundle',
  'easywork-plugin-projects',
])

export const PACKAGE_DIRECTORIES = Object.freeze({
  'easywork-plugin-models': '../../packages/plugins/models',
  'easywork-contracts': '../../packages/contracts',
  'easywork-ui': '../../packages/ui',
  'easywork-provider-identity-local': '../../packages/providers/identity-local',
  'easywork-provider-browser-session': '../../packages/providers/browser-session',
  'easywork-plugin-audit': '../../packages/plugins/audit',
  'easywork-plugin-access': '../../packages/plugins/access',
  'easywork-plugin-skills': '../../packages/plugins/skills',
  'easywork-plugin-experts': '../../packages/plugins/experts',
  'easywork-plugin-connectors': '../../packages/plugins/connectors',
  'easywork-plugin-library': '../../packages/plugins/library',
  'easywork-bundle': '../../packages/bundle',
  'easywork-plugin-projects': '../../packages/plugins/projects',
})
