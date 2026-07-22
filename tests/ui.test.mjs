import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));

test('dashboard использует относительные assets и доступную структуру страницы', async () => {
  const html = await readFile(resolve(repoRoot, 'index.html'), 'utf8');

  assert.match(html, /<html lang="ru">/);
  assert.match(html, /href="\.\/styles\.css"/);
  assert.match(html, /src="\.\/app\.js"/);
  assert.match(html, /<main id="task-groups"/);
  assert.match(html, /<dialog id="task-dialog"/);
  assert.match(html, /aria-live="polite"/);
});

test('status palette соответствует согласованным цветам', async () => {
  const css = await readFile(resolve(repoRoot, 'styles.css'), 'utf8');

  assert.match(css, /--done-bg:\s*#dcfce7/);
  assert.match(css, /--review-bg:\s*#e0f2fe/);
  assert.match(css, /--branch-bg:\s*#ffedd5/);
  assert.match(css, /--ready-bg:\s*#fef9c3/);
  assert.match(css, /--blocked-bg:\s*#f1f5f9/);
  assert.match(css, /prefers-reduced-motion/);
});

test('фильтры статусов расположены в согласованном порядке', async () => {
  const script = await readFile(resolve(repoRoot, 'app.js'), 'utf8');

  assert.match(
    script,
    /const statuses = \['all', 'blocked', 'ready', 'branch', 'review', 'done'\];/
  );
});

test('browser script синтаксически корректен', () => {
  const result = spawnSync(process.execPath, ['--check', resolve(repoRoot, 'app.js')], {
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr);
});
