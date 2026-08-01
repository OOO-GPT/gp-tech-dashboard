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

test('тупиковые вершины получают серую метку между ID и статусом', async () => {
  const [script, css] = await Promise.all([
    readFile(resolve(repoRoot, 'app.js'), 'utf8'),
    readFile(resolve(repoRoot, 'styles.css'), 'utf8')
  ]);

  const toplineStart = script.indexOf("const topLine = createElement('div', { className: 'task-card__topline' });");
  const toplineEnd = script.indexOf("const title = createElement('h3'", toplineStart);
  const topline = script.slice(toplineStart, toplineEnd);

  assert.ok(toplineStart >= 0 && toplineEnd > toplineStart, 'Не найдено построение заголовка карточки');
  assert.match(script, /Array\.isArray\(task\.children\) && task\.children\.length === 0/);
  assert.match(script, /isDeadEnd \? ', тупик: нет исходящих вершин' : ''/);
  assert.match(topline, /if \(isDeadEnd\)/);
  assert.match(topline, /text: 'Тупик'/);
  assert.match(topline, /title: 'Нет исходящих вершин'/);

  const taskIdIndex = topline.indexOf("className: 'task-id'");
  const deadEndIndex = topline.indexOf("className: 'dead-end-badge'");
  const statusIndex = topline.indexOf("className: 'status-badge'");
  assert.ok(
    taskIdIndex >= 0 && taskIdIndex < deadEndIndex && deadEndIndex < statusIndex,
    'Метка должна находиться между ID и статусом'
  );

  const deadEndStyles = [...css.matchAll(/(?:^|\n)\.dead-end-badge\s*\{([^}]*)\}/g)].at(-1)?.[1] ?? '';
  assert.match(css, /\.status-badge,\s*\.dead-end-badge\s*\{[^}]*border-radius:\s*999px/s);
  assert.match(deadEndStyles, /border:\s*1px solid var\(--blocked-border\)/);
  assert.match(deadEndStyles, /background:\s*var\(--blocked-bg\)/);
  assert.match(deadEndStyles, /color:\s*var\(--blocked-text\)/);
});

test('browser script синтаксически корректен', () => {
  const result = spawnSync(process.execPath, ['--check', resolve(repoRoot, 'app.js')], {
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr);
});
