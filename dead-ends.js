const DIRECT_DEAD_END = 'direct';
const TRANSITIVE_DEAD_END = 'transitive';

export function classifyDeadEnds(tasks, targetId = 'Z99') {
  const classifications = new Map();
  if (!Array.isArray(tasks)) return classifications;

  const taskById = new Map();
  let graphIsComplete = true;
  for (const task of tasks) {
    if (!task || typeof task.id !== 'string' || taskById.has(task.id)) {
      graphIsComplete = false;
      continue;
    }
    taskById.set(task.id, task);
  }

  const parentsById = new Map([...taskById.keys()].map((taskId) => [taskId, new Set()]));
  for (const task of taskById.values()) {
    if (!Array.isArray(task.children)) {
      graphIsComplete = false;
      continue;
    }
    if (task.id !== targetId && task.children.length === 0) {
      classifications.set(task.id, DIRECT_DEAD_END);
    }
    for (const childId of task.children) {
      const parents = parentsById.get(childId);
      if (!parents) {
        graphIsComplete = false;
        continue;
      }
      parents.add(task.id);
    }
  }

  if (!graphIsComplete || !taskById.has(targetId)) return classifications;

  const reachesTarget = new Set([targetId]);
  const queue = [targetId];
  for (let index = 0; index < queue.length; index += 1) {
    for (const parentId of parentsById.get(queue[index])) {
      if (reachesTarget.has(parentId)) continue;
      reachesTarget.add(parentId);
      queue.push(parentId);
    }
  }

  for (const task of taskById.values()) {
    if (task.id === targetId || task.children.length === 0 || reachesTarget.has(task.id)) continue;
    classifications.set(task.id, TRANSITIVE_DEAD_END);
  }

  return classifications;
}
