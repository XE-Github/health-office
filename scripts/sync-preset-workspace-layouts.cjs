const fs = require('node:fs')
const path = require('node:path')

const sourceDir =
  process.env.PRESET_WORKSPACE_LAYOUT_DIR ||
  'C:\\Users\\xiaomijxe\\Documents\\预置屏幕布局'
const outputDir = path.join(process.cwd(), 'public', 'preset-workspace-layouts')
const manifestPath = path.join(outputDir, 'manifest.json')

function ensureCleanOutputDir() {
  fs.rmSync(outputDir, { force: true, recursive: true })
  fs.mkdirSync(outputDir, { recursive: true })
}

function writeManifest(profiles) {
  fs.writeFileSync(
    manifestPath,
    `${JSON.stringify(
      {
        generatedAt: Date.now(),
        profiles,
        sourceDir,
        version: 1,
      },
      null,
      2,
    )}\n`,
    'utf8',
  )
}

function syncPresetWorkspaceLayouts() {
  if (!fs.existsSync(sourceDir)) {
    console.warn(`Preset workspace layout source directory does not exist: ${sourceDir}`)

    if (fs.existsSync(manifestPath)) {
      console.warn('Keeping existing preset workspace layout assets.')
      return
    }

    fs.mkdirSync(outputDir, { recursive: true })
    writeManifest([])
    return
  }

  ensureCleanOutputDir()

  const files = fs
    .readdirSync(sourceDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
    .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))

  const profiles = files.map((entry, index) => {
    const sourcePath = path.join(sourceDir, entry.name)
    const filename = `preset-${String(index + 1).padStart(2, '0')}.json`
    const outputPath = path.join(outputDir, filename)
    const stat = fs.statSync(sourcePath)

    fs.copyFileSync(sourcePath, outputPath)

    return {
      name: path.basename(entry.name, path.extname(entry.name)),
      updatedAt: Math.round(stat.mtimeMs),
      url: `/preset-workspace-layouts/${filename}`,
    }
  })

  writeManifest(profiles)
  console.log(`Synced ${profiles.length} preset workspace layouts from ${sourceDir}`)
}

syncPresetWorkspaceLayouts()
