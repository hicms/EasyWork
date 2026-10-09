interface PackageReferences {
  name?: string
  dependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

interface ReleaseManifest {
  harness?: string
  runtimeOverrides?: Record<string, string>
  packages?: ReadonlyArray<{ name: string }>
}

interface DefaultProfile extends PackageReferences {
  dsh?: { profile?: { bundles?: readonly string[] } }
}

export function verifyDefaultProfile(manifest: DefaultProfile): void
export function verifyDefaultComposition(config: string): void
export function verifyProfileRelease(manifest: ReleaseManifest, expectedDshVersion: string, expectedPackages?: readonly string[]): void
export function verifyPackageDshReferences(manifest: PackageReferences, expectedDshVersion: string): void
export function verifyReleaseArchives(manifest: { packages?: ReadonlyArray<{ name: string; filename: string; sha256: string }> }, directory: string): void
export function verifyOfficialWebPackages(manifest: unknown, profile: string, config?: string): void
export function verifyInstalledDshVersions(profile: string, expectedDshVersion: string): number
