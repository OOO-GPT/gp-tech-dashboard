import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyDeadEnds } from '../dead-ends.js';

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

test('классификатор различает прямые и транзитивные тупики', () => {
  const tasks = [
    { id: 'Z99', children: [] },
    { id: 'RED_A', children: [] },
    { id: 'RED_B', children: [] },
    { id: 'GRAY_ONE', children: ['RED_A'] },
    { id: 'GRAY_DEEP', children: ['GRAY_ONE', 'RED_B'] },
    { id: 'TO_TARGET', children: ['Z99'] },
    { id: 'MIXED', children: ['RED_A', 'TO_TARGET'] },
    { id: 'CYCLE_A', children: ['CYCLE_B'] },
    { id: 'CYCLE_B', children: ['CYCLE_A'] },
    { id: 'CYCLE_TARGET_A', children: ['CYCLE_TARGET_B'] },
    { id: 'CYCLE_TARGET_B', children: ['CYCLE_TARGET_A', 'Z99'] }
  ];

  assert.deepEqual(Object.fromEntries(classifyDeadEnds(tasks)), {
    RED_A: 'direct',
    RED_B: 'direct',
    GRAY_ONE: 'transitive',
    GRAY_DEEP: 'transitive',
    CYCLE_A: 'transitive',
    CYCLE_B: 'transitive'
  });
});

test('повреждённые ссылки не создают недостоверные транзитивные тупики', () => {
  const tasks = [
    { id: 'Z99', children: [] },
    { id: 'RED', children: [] },
    { id: 'KNOWN_PARENT', children: ['RED'] },
    { id: 'UNKNOWN_PARENT', children: ['MISSING'] }
  ];

  assert.deepEqual(Object.fromEntries(classifyDeadEnds(tasks)), { RED: 'direct' });
});

test('метка тупика расположена между ID и статусом и различается цветом', async () => {
  const [script, css, workflow] = await Promise.all([
    readFile(resolve(repoRoot, 'app.js'), 'utf8'),
    readFile(resolve(repoRoot, 'styles.css'), 'utf8'),
    readFile(resolve(repoRoot, '.github/workflows/pages.yml'), 'utf8')
  ]);

  const toplineStart = script.indexOf("const topLine = createElement('div', { className: 'task-card__topline' });");
  const toplineEnd = script.indexOf("const title = createElement('h3'", toplineStart);
  const topline = script.slice(toplineStart, toplineEnd);

  assert.ok(toplineStart >= 0 && toplineEnd > toplineStart, 'Не найдено построение заголовка карточки');
  assert.match(script, /import \{ classifyDeadEnds \} from '\.\/dead-ends\.js';/);
  assert.match(script, /view\.deadEnds = classifyDeadEnds\(view\.snapshot\.tasks\)/);
  assert.match(topline, /text: 'Тупик'/);
  assert.match(topline, /dataset: \{ kind: deadEndKind \}/);

  const taskIdIndex = topline.indexOf("className: 'task-id'");
  const deadEndIndex = topline.indexOf("className: 'dead-end-badge'");
  const statusIndex = topline.indexOf("className: 'status-badge'");
  assert.ok(
    taskIdIndex >= 0 && taskIdIndex < deadEndIndex && deadEndIndex < statusIndex,
    'Метка должна находиться между ID и статусом'
  );

  assert.match(css, /\.status-badge,\s*\.dead-end-badge\s*\{[^}]*border-radius:\s*999px/s);
  assert.match(css, /\.dead-end-badge\[data-kind="direct"\]\s*\{[^}]*var\(--dead-end-direct-bg\)/s);
  assert.match(css, /\.dead-end-badge\[data-kind="transitive"\]\s*\{[^}]*var\(--blocked-bg\)/s);
  assert.match(workflow, /cp index\.html styles\.css app\.js dead-ends\.js \.nojekyll dist\//);
});

test('browser script синтаксически корректен', () => {
  const result = spawnSync(process.execPath, ['--check', resolve(repoRoot, 'app.js')], {
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr);
});
