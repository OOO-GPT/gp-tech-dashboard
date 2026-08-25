const STATUS_ORDER = Object.freeze({
  done: 0,
  review: 1,
  branch: 2,
  ready: 3,
  blocked: 4
});

function timestamp(value) {
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function statusEnteredAt(task) {
  return timestamp(task.status_entered_at) ??
    (task.status === 'done' ? timestamp(task.pull_request?.merged_at) : null);
}

function formatShortDate(value) {
  if (value === null) return null;
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Europe/Moscow'
  }).format(new Date(value));
}

export function formatDependencyLabel(task) {
  const label = `${task.id} · ${task.title}`;
  if (task.status !== 'done') return label;

  const doneDate = formatShortDate(statusEnteredAt(task));
  return doneDate ? `${label} · ${doneDate}` : label;
}

export function sortDependencies(taskIds, tasks) {
  const tasksById = new Map(tasks.map((task) => [task.id, task]));

  return taskIds
    .map((taskId, sourceIndex) => ({
      taskId,
      sourceIndex,
      task: tasksById.get(taskId) ?? null
    }))
    .sort((left, right) => {
      const statusDelta = (STATUS_ORDER[left.task?.status] ?? Number.MAX_SAFE_INTEGER) -
        (STATUS_ORDER[right.task?.status] ?? Number.MAX_SAFE_INTEGER);
      if (statusDelta !== 0) return statusDelta;

      const leftTimestamp = left.task ? statusEnteredAt(left.task) : null;
      const rightTimestamp = right.task ? statusEnteredAt(right.task) : null;
      if (leftTimestamp !== rightTimestamp) {
        if (leftTimestamp === null) return 1;
        if (rightTimestamp === null) return -1;
        return rightTimestamp - leftTimestamp;
      }

      return left.sourceIndex - right.sourceIndex;
    })
    .map(({ taskId }) => taskId);
}
