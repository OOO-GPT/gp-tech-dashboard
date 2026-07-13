const STATUS_META = {
  done: { label: 'Готова', order: 0 },
  review: { label: 'На ревью', order: 1 },
  branch: { label: 'Есть ветка', order: 2 },
  ready: { label: 'Можно приступать', order: 3 },
  blocked: { label: 'Заблокирована', order: 4 }
};

const STATUS_ORDER = Object.keys(STATUS_META);

const elements = {
  filters: document.querySelector('#status-filters'),
  search: document.querySelector('#task-search'),
  groupFilter: document.querySelector('#group-filter'),
  resultCount: document.querySelector('#result-count'),
  groups: document.querySelector('#task-groups'),
  snapshotMeta: document.querySelector('#snapshot-meta'),
  repositoryLink: document.querySelector('#repository-link'),
  dialog: document.querySelector('#task-dialog'),
  dialogClose: document.querySelector('#dialog-close'),
  dialogId: document.querySelector('#dialog-id'),
  dialogStatus: document.querySelector('#dialog-status'),
  dialogTitle: document.querySelector('#dialog-title'),
  dialogDescription: document.querySelector('#dialog-description'),
  dialogReason: document.querySelector('#dialog-reason'),
  dialogParents: document.querySelector('#dialog-parents'),
  dialogChildren: document.querySelector('#dialog-children'),
  dialogGit: document.querySelector('#dialog-git'),
  dialogAction: document.querySelector('#dialog-action'),
  copyBranch: document.querySelector('#copy-branch')
};

const view = {
  snapshot: null,
  status: 'all',
  group: 'all',
  query: '',
  selectedTaskId: null
};

function createElement(tag, options = {}) {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.dataset) Object.assign(node.dataset, options.dataset);
  if (options.attributes) {
    for (const [name, value] of Object.entries(options.attributes)) {
      node.setAttribute(name, String(value));
    }
  }
  return node;
}

function taskById(taskId) {
  return view.snapshot?.tasks.find((task) => task.id === taskId) ?? null;
}

function statusLabel(status) {
  return STATUS_META[status]?.label ?? status;
}

function countFor(status) {
  if (status === 'all') return view.snapshot.tasks.length;
  return view.snapshot.counts?.[status] ?? view.snapshot.tasks.filter((task) => task.status === status).length;
}

function renderFilters() {
  elements.filters.replaceChildren();
  const statuses = ['all', ...STATUS_ORDER];

  for (const status of statuses) {
    const button = createElement('button', {
      className: `status-filter status-filter--${status}`,
      attributes: {
        type: 'button',
        'aria-pressed': view.status === status
      }
    });
    button.dataset.filterStatus = status;
    if (status !== 'all') button.dataset.status = status;

    const dot = createElement('span', { className: 'status-filter__dot' });
    dot.setAttribute('aria-hidden', 'true');
    const label = createElement('span', {
      className: 'status-filter__label',
      text: status === 'all' ? 'Все задачи' : statusLabel(status)
    });
    const count = createElement('span', {
      className: 'status-filter__count',
      text: String(countFor(status))
    });

    button.append(dot, label, count);
    button.addEventListener('click', () => {
      view.status = status !== 'all' && view.status === status ? 'all' : status;
      renderFilters();
      renderTasks();
      requestAnimationFrame(() => {
        elements.filters.querySelector(`[data-filter-status="${view.status}"]`)?.focus();
      });
    });
    elements.filters.append(button);
  }
}

function renderGroupOptions() {
  const current = view.group;
  elements.groupFilter.replaceChildren(
    createElement('option', { text: 'Все этапы', attributes: { value: 'all' } })
  );
  for (const group of view.snapshot.groups) {
    elements.groupFilter.append(
      createElement('option', {
        text: `${group.id}. ${group.title}`,
        attributes: { value: group.id }
      })
    );
  }
  elements.groupFilter.value = current;
}

function normalizedQuery() {
  return view.query.trim().toLocaleLowerCase('ru');
}

function visibleTasks() {
  const query = normalizedQuery();
  return view.snapshot.tasks.filter((task) => {
    const matchesStatus = view.status === 'all' || task.status === view.status;
    const matchesGroup = view.group === 'all' || task.group_id === view.group;
    const haystack = `${task.id} ${task.title} ${task.description}`.toLocaleLowerCase('ru');
    return matchesStatus && matchesGroup && (!query || haystack.includes(query));
  });
}

function taskReason(task) {
  if (task.status === 'done') {
    return task.historical_done ? 'Исторически выполнена в main' : 'Marker done находится в main';
  }
  if (task.status === 'review') {
    if (task.pull_request?.number) return `PR #${task.pull_request.number} · ждёт ревью`;
    const files = task.branch?.files_changed;
    return files ? `${files} ${pluralize(files, 'файл', 'файла', 'файлов')} · ждёт ревью` : 'Ветка ждёт ревью';
  }
  if (task.status === 'branch') {
    const ahead = task.branch?.ahead_count ?? 0;
    return `${ahead} ${pluralize(ahead, 'коммит', 'коммита', 'коммитов')} впереди main`;
  }
  if (task.status === 'ready') return 'Все зависимости готовы';
  const blockers = task.missing_parents ?? [];
  return blockers.length ? `Ждёт: ${blockers.join(', ')}` : 'Есть незавершённые зависимости';
}

function pluralize(value, one, few, many) {
  const normalized = Math.abs(value) % 100;
  const last = normalized % 10;
  if (normalized > 10 && normalized < 20) return many;
  if (last === 1) return one;
  if (last > 1 && last < 5) return few;
  return many;
}

function createTaskCard(task) {
  const button = createElement('button', {
    className: 'task-card',
    dataset: { status: task.status },
    attributes: {
      type: 'button',
      'aria-label': `${task.id}, ${task.title}, ${statusLabel(task.status)}. ${taskReason(task)}`
    }
  });

  const topLine = createElement('div', { className: 'task-card__topline' });
  topLine.append(
    createElement('span', { className: 'task-id', text: task.id }),
    createElement('span', {
      className: 'status-badge',
      text: statusLabel(task.status),
      dataset: { status: task.status }
    })
  );

  const title = createElement('h3', { text: task.title });
  const description = createElement('p', {
    className: 'task-card__description',
    text: task.description
  });
  const reason = createElement('p', {
    className: 'task-card__reason',
    text: taskReason(task)
  });

  button.append(topLine, title, description, reason);
  button.addEventListener('click', () => openTask(task.id));
  return button;
}

function createDistribution(tasks) {
  const distribution = createElement('div', {
    className: 'group-distribution',
    attributes: { 'aria-label': 'Распределение статусов этапа', role: 'img' }
  });
  const summary = [];
  for (const status of STATUS_ORDER) {
    const count = tasks.filter((task) => task.status === status).length;
    if (!count) continue;
    const segment = createElement('span', { dataset: { status } });
    segment.style.flexGrow = String(count);
    segment.title = `${statusLabel(status)}: ${count}`;
    distribution.append(segment);
    summary.push(`${statusLabel(status)} — ${count}`);
  }
  distribution.setAttribute('aria-label', summary.join(', '));
  return distribution;
}

function renderTasks() {
  const tasks = visibleTasks();
  elements.resultCount.textContent = `Показано ${tasks.length} из ${view.snapshot.tasks.length}`;
  elements.groups.replaceChildren();

  if (!tasks.length) {
    const state = createElement('section', { className: 'page-state' });
    state.append(
      createElement('p', { text: 'Ничего не найдено. Измените запрос или фильтр.' })
    );
    elements.groups.append(state);
    return;
  }

  for (const group of view.snapshot.groups) {
    const groupTasks = tasks.filter((task) => task.group_id === group.id);
    if (!groupTasks.length) continue;

    const section = createElement('section', {
      className: 'task-group',
      attributes: { 'aria-labelledby': `group-${group.id}` }
    });
    const header = createElement('header', { className: 'task-group__header' });
    const heading = createElement('div', { className: 'task-group__heading' });
    heading.append(
      createElement('h2', { text: `${group.id}. ${group.title}`, attributes: { id: `group-${group.id}` } }),
      createElement('span', {
        className: 'task-group__count',
        text: `${groupTasks.length} ${pluralize(groupTasks.length, 'задача', 'задачи', 'задач')}`
      })
    );
    header.append(heading, createDistribution(groupTasks));

    const grid = createElement('div', { className: 'task-grid' });
    for (const task of groupTasks) grid.append(createTaskCard(task));
    section.append(header, grid);
    elements.groups.append(section);
  }
}

function dependencyChip(taskId) {
  const task = taskById(taskId);
  const chip = createElement('button', {
    className: 'dependency-chip',
    text: task ? `${task.id} · ${statusLabel(task.status)}` : taskId,
    dataset: { status: task?.status ?? 'blocked' },
    attributes: { type: 'button' }
  });
  chip.addEventListener('click', () => openTask(taskId, { replaceHistory: true, focusTitle: true }));
  return chip;
}

function renderDependencies(target, taskIds, emptyText) {
  target.replaceChildren();
  if (!taskIds?.length) {
    target.append(createElement('p', { className: 'dependency-list__empty', text: emptyText }));
    return;
  }
  for (const taskId of taskIds) target.append(dependencyChip(taskId));
}

function addGitFact(label, value, link) {
  elements.dialogGit.append(createElement('dt', { text: label }));
  const detail = createElement('dd');
  if (link) {
    detail.append(
      createElement('a', {
        text: value,
        attributes: { href: link, target: '_blank', rel: 'noreferrer' }
      })
    );
  } else {
    detail.textContent = value;
  }
  elements.dialogGit.append(detail);
}

function configureAction(task) {
  elements.dialogAction.hidden = true;
  elements.copyBranch.hidden = true;
  elements.copyBranch.onclick = null;
  elements.copyBranch.textContent = 'Скопировать имя ветки';

  if (task.status === 'done' && (task.urls?.pull_request || task.urls?.commit)) {
    elements.dialogAction.textContent = task.urls.pull_request ? 'Открыть принятое ревью' : 'Открыть commit в main';
    elements.dialogAction.href = task.urls.pull_request ?? task.urls.commit;
    elements.dialogAction.hidden = false;
    return;
  }

  if ((task.status === 'review' || task.status === 'branch') && (task.urls?.pull_request || task.urls?.compare)) {
    elements.dialogAction.textContent = task.urls.pull_request
      ? 'Открыть ревью'
      : task.status === 'review'
        ? 'Открыть изменения для ревью'
        : 'Посмотреть изменения';
    elements.dialogAction.href = task.urls.pull_request ?? task.urls.compare;
    elements.dialogAction.hidden = false;
    return;
  }

  if (task.status === 'ready') {
    elements.copyBranch.hidden = false;
    elements.copyBranch.onclick = async () => {
      const branchName = `codex/${task.id.toLocaleLowerCase('en-US')}`;
      try {
        await navigator.clipboard.writeText(branchName);
        elements.copyBranch.textContent = 'Имя ветки скопировано';
      } catch {
        elements.copyBranch.textContent = branchName;
      }
    };
  }
}

function renderGitFacts(task) {
  elements.dialogGit.replaceChildren();
  addGitFact('Статус', statusLabel(task.status));

  if (task.done_commit) {
    const commitLabel = task.done_commit.sha
      ? `${task.done_commit.sha.slice(0, 7)} · ${task.done_commit.subject}`
      : 'Результат находится в main';
    addGitFact('Commit в main', commitLabel, task.urls?.commit);
  }

  if (task.branch) {
    addGitFact('Ветка', task.branch.name, task.urls?.branch);
    if (task.branch.head_sha) {
      addGitFact('HEAD', `${task.branch.head_sha.slice(0, 7)} · ${task.branch.head_subject}`, task.urls?.branch);
    }
    if (task.branch.marker_sha) {
      addGitFact(
        'Marker ревью',
        `${task.branch.marker_sha.slice(0, 7)} · ${task.branch.marker_subject}`,
        task.urls?.marker
      );
    }
    if (task.branch.ahead_count !== undefined) {
      addGitFact('Относительно main', `${task.branch.ahead_count} коммитов · ${task.branch.files_changed ?? 0} файлов`);
    }
  }

  if (task.pull_request) {
    const state = task.pull_request.is_draft
      ? 'черновик'
      : ({ OPEN: 'открыт', MERGED: 'принят', CLOSED: 'закрыт' }[task.pull_request.state] ?? task.pull_request.state);
    addGitFact('Ревью', `PR #${task.pull_request.number} · ${state}`, task.urls?.pull_request);
  }

  if (task.status !== 'done' && !task.branch) {
    addGitFact('Нужная ветка', `codex/${task.id.toLocaleLowerCase('en-US')}`);
  }

  if (task.missing_parents?.length) addGitFact('Ожидает', task.missing_parents.join(', '));
}

function openTask(taskId, options = {}) {
  const task = taskById(taskId);
  if (!task) return;
  view.selectedTaskId = task.id;

  elements.dialog.dataset.status = task.status;
  elements.dialogId.textContent = task.id;
  elements.dialogStatus.dataset.status = task.status;
  elements.dialogStatus.textContent = statusLabel(task.status);
  elements.dialogTitle.textContent = task.title;
  elements.dialogDescription.textContent = task.description;
  elements.dialogReason.textContent = taskReason(task);
  renderDependencies(elements.dialogParents, task.parents, 'Корневая задача — зависимостей нет.');
  renderDependencies(elements.dialogChildren, task.children, 'Эта задача никого напрямую не разблокирует.');
  renderGitFacts(task);
  configureAction(task);

  const url = new URL(window.location.href);
  url.searchParams.set('task', task.id);
  const method = options.replaceHistory ? 'replaceState' : 'pushState';
  window.history[method]({ task: task.id }, '', url);

  if (!elements.dialog.open) elements.dialog.showModal();
  if (options.focusTitle) requestAnimationFrame(() => elements.dialogTitle.focus());
}

function closeTask({ updateHistory = true } = {}) {
  view.selectedTaskId = null;
  if (elements.dialog.open) elements.dialog.close();
  if (!updateHistory) return;
  const url = new URL(window.location.href);
  url.searchParams.delete('task');
  window.history.replaceState({}, '', url);
}

function renderSnapshotMeta() {
  const generatedAt = new Date(view.snapshot.generated_at);
  const isValid = !Number.isNaN(generatedAt.getTime());
  const ageMs = isValid ? Date.now() - generatedAt.getTime() : 0;
  const formatted = isValid
    ? new Intl.DateTimeFormat('ru-RU', {
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit'
      }).format(generatedAt)
    : 'неизвестно';
  const sha = view.snapshot.main?.sha?.slice(0, 7);
  elements.snapshotMeta.textContent = `Обновлено ${formatted}${sha ? ` · main ${sha}` : ''}`;
  elements.snapshotMeta.classList.toggle('snapshot-meta--stale', ageMs > 2 * 60 * 60 * 1000);
  if (ageMs > 2 * 60 * 60 * 1000) {
    elements.snapshotMeta.textContent += ' · снимок старше двух часов';
  }

  if (view.snapshot.repository?.url) elements.repositoryLink.href = view.snapshot.repository.url;
}

function renderError() {
  elements.groups.replaceChildren();
  const state = createElement('section', { className: 'page-state' });
  const retry = createElement('button', {
    className: 'retry-button',
    text: 'Повторить',
    attributes: { type: 'button' }
  });
  retry.addEventListener('click', loadSnapshot);
  state.append(
    createElement('p', { text: 'Не удалось загрузить состояние графа.' }),
    retry
  );
  elements.groups.append(state);
  elements.snapshotMeta.textContent = 'Состояние недоступно';
}

async function loadSnapshot() {
  try {
    const response = await fetch('./data/tasks.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    view.snapshot = await response.json();
    renderSnapshotMeta();
    renderFilters();
    renderGroupOptions();
    renderTasks();

    const requestedTask = new URL(window.location.href).searchParams.get('task');
    if (requestedTask && taskById(requestedTask.toLocaleUpperCase('en-US'))) {
      openTask(requestedTask.toLocaleUpperCase('en-US'), { replaceHistory: true });
    }
  } catch (error) {
    console.error(error);
    renderError();
  }
}

elements.search.addEventListener('input', (event) => {
  view.query = event.currentTarget.value;
  renderTasks();
});

elements.search.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && event.currentTarget.value) {
    event.currentTarget.value = '';
    view.query = '';
    renderTasks();
  }
});

elements.groupFilter.addEventListener('change', (event) => {
  view.group = event.currentTarget.value;
  renderTasks();
});

elements.dialogClose.addEventListener('click', () => closeTask());
elements.dialog.addEventListener('close', () => {
  if (!view.selectedTaskId) return;
  view.selectedTaskId = null;
  const url = new URL(window.location.href);
  url.searchParams.delete('task');
  window.history.replaceState({}, '', url);
});

window.addEventListener('popstate', () => {
  const taskId = new URL(window.location.href).searchParams.get('task');
  if (taskId && taskById(taskId)) {
    openTask(taskId, { replaceHistory: true });
  } else if (elements.dialog.open) {
    view.selectedTaskId = null;
    elements.dialog.close();
  }
});

loadSnapshot();
