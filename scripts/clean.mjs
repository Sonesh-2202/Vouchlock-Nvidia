import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const explicitTargets = [
  // Build outputs
  path.join(projectRoot, 'apps/api/dist'),
  path.join(projectRoot, 'apps/web/dist'),
  path.join(projectRoot, 'packages/contracts/dist'),
  path.join(projectRoot, 'packages/domain/dist'),

  // Vite & Vitest caches
  path.join(projectRoot, 'apps/api/node_modules/.vite'),
  path.join(projectRoot, 'apps/web/node_modules/.vite'),
  path.join(projectRoot, 'packages/contracts/node_modules/.vite'),
  path.join(projectRoot, 'packages/domain/node_modules/.vite'),

  // Ephemeral test verification dumps
  path.join(projectRoot, 'backups/verification'),

  // Empty untracked examples directories
  path.join(projectRoot, '.agents/skills/stitch-manage-design-system/examples'),
  path.join(projectRoot, '.claude/skills/stitch-manage-design-system/examples'),
];

let cleanedCount = 0;

for (const target of explicitTargets) {
  if (fs.existsSync(target)) {
    try {
      fs.rmSync(target, { recursive: true, force: true });
      const relativeTarget = path.relative(projectRoot, target);
      console.log(`✓ Cleaned: ${relativeTarget}`);
      cleanedCount++;
    } catch (err) {
      console.warn(`! Failed to clean: ${target}`, err);
    }
  }
}

// Function to recursively clean specific temporary files & folders
function cleanRecursive(dir) {
  if (!fs.existsSync(dir)) return;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    // Skip node_modules and .git for deep recursion
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.local_db') {
        continue;
      }

      if (
        entry.name === '__pycache__' ||
        entry.name === '.pytest_cache' ||
        entry.name === 'coverage' ||
        entry.name === '.turbo' ||
        entry.name.endsWith('.egg-info')
      ) {
        try {
          fs.rmSync(fullPath, { recursive: true, force: true });
          const relativeTarget = path.relative(projectRoot, fullPath);
          console.log(`✓ Cleaned: ${relativeTarget}`);
          cleanedCount++;
        } catch (err) {
          console.warn(`! Failed to clean: ${fullPath}`, err);
        }
      } else {
        cleanRecursive(fullPath);
      }
    } else if (entry.isFile()) {
      if (
        entry.name === '.DS_Store' ||
        entry.name === 'Thumbs.db' ||
        entry.name === 'desktop.ini' ||
        entry.name.endsWith('.pyc')
      ) {
        try {
          fs.rmSync(fullPath, { force: true });
          const relativeTarget = path.relative(projectRoot, fullPath);
          console.log(`✓ Removed file: ${relativeTarget}`);
          cleanedCount++;
        } catch (err) {
          console.warn(`! Failed to remove: ${fullPath}`, err);
        }
      }
    }
  }
}

cleanRecursive(projectRoot);

if (cleanedCount === 0) {
  console.log('✓ Project Pilot is already clean. No cache or build files to purge.');
} else {
  console.log(
    `✓ Successfully purged ${cleanedCount} build/cache/temporary item${cleanedCount === 1 ? '' : 's'}.`,
  );
}
