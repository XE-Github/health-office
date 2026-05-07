import {
  createPresetWorkspaceLayoutProfile,
  type WorkspaceLayoutProfile,
} from './workspaceLayoutProfiles'

type PresetWorkspaceLayoutManifest = {
  profiles?: Array<{
    name?: unknown
    updatedAt?: unknown
    url?: unknown
  }>
  version?: unknown
}

const presetWorkspaceLayoutManifestUrl = '/preset-workspace-layouts/manifest.json'

function createPresetProfileId(index: number, name: string) {
  const normalizedName = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{Letter}\p{Number}-]+/gu, '-')
    .replace(/^-+|-+$/g, '')

  return `preset-layout-${String(index + 1).padStart(2, '0')}-${normalizedName || 'profile'}`
}

async function fetchJson(url: string) {
  const response = await fetch(url, {
    cache: 'no-cache',
  })

  if (!response.ok) {
    throw new Error(`Failed to load preset workspace layout file: ${url}`)
  }

  return response.json() as Promise<unknown>
}

export async function loadPresetWorkspaceLayoutProfiles(): Promise<WorkspaceLayoutProfile[]> {
  try {
    const manifest = (await fetchJson(
      presetWorkspaceLayoutManifestUrl,
    )) as PresetWorkspaceLayoutManifest

    if (manifest.version !== 1 || !Array.isArray(manifest.profiles)) {
      return []
    }

    const profiles = await Promise.all(
      manifest.profiles.map(async (entry, index) => {
        if (typeof entry.url !== 'string' || typeof entry.name !== 'string') {
          return null
        }

        const rawProfile = await fetchJson(entry.url)
        const profile = createPresetWorkspaceLayoutProfile(rawProfile, {
          id: createPresetProfileId(index, entry.name),
          name: entry.name,
          updatedAt:
            typeof entry.updatedAt === 'number' && Number.isFinite(entry.updatedAt)
              ? entry.updatedAt
              : undefined,
        })

        return profile
      }),
    )

    return profiles.filter((profile): profile is WorkspaceLayoutProfile => profile !== null)
  } catch (error) {
    console.warn('Failed to load preset workspace layouts.', error)
    return []
  }
}
