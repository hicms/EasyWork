import { appendFileSync } from 'node:fs'
import { verifyReleaseSource } from './desktop-release-policy.mjs'

const env = process.env
if (env.GITHUB_REF !== `refs/heads/${env.DEFAULT_BRANCH}`) throw new Error('Dispatch releases from the GitHub default branch')
const release = verifyReleaseSource({ commit: env.RELEASE_COMMIT, version: env.RELEASE_VERSION, channel: env.RELEASE_CHANNEL, defaultBranch: env.DEFAULT_BRANCH, root: process.cwd() })
for (const [name, value] of Object.entries(release)) appendFileSync(env.GITHUB_OUTPUT, `${name}=${value}\n`)
