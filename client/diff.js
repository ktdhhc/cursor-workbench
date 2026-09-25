function linesOf(text) {
  return text === null || text === undefined || text === '' ? [] : String(text).split('\n');
}

// Real line-based differences from the server's before/after snapshots. Limit the
// dynamic-programming matrix on large rewrites; the fallback remains lossless.
export function diffLines(before, after) {
  const left = linesOf(before);
  const right = linesOf(after);
  let prefix = 0;
  while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < left.length - prefix && suffix < right.length - prefix && left[left.length - suffix - 1] === right[right.length - suffix - 1]) suffix += 1;
  const oldMiddle = left.slice(prefix, left.length - suffix);
  const newMiddle = right.slice(prefix, right.length - suffix);
  const operations = left.slice(0, prefix).map((text) => ({ type: 'context', text }));
  const rows = oldMiddle.length;
  const columns = newMiddle.length;
  if ((rows + 1) * (columns + 1) <= 1200000) {
    const width = columns + 1;
    const matrix = new Uint32Array((rows + 1) * width);
    for (let i = rows - 1; i >= 0; i -= 1) {
      for (let j = columns - 1; j >= 0; j -= 1) {
        matrix[i * width + j] = oldMiddle[i] === newMiddle[j]
          ? matrix[(i + 1) * width + j + 1] + 1
          : Math.max(matrix[(i + 1) * width + j], matrix[i * width + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < rows || j < columns) {
      if (i < rows && j < columns && oldMiddle[i] === newMiddle[j]) {
        operations.push({ type: 'context', text: oldMiddle[i] }); i += 1; j += 1;
      } else if (i < rows && (j === columns || matrix[(i + 1) * width + j] >= matrix[i * width + j + 1])) {
        operations.push({ type: 'removed', text: oldMiddle[i] }); i += 1;
      } else {
        operations.push({ type: 'added', text: newMiddle[j] }); j += 1;
      }
    }
  } else {
    for (const text of oldMiddle) operations.push({ type: 'removed', text });
    for (const text of newMiddle) operations.push({ type: 'added', text });
  }
  if (suffix) for (const text of left.slice(left.length - suffix)) operations.push({ type: 'context', text });
  let oldLine = 0;
  let newLine = 0;
  let added = 0;
  let removed = 0;
  const result = operations.map((operation, index) => {
    if (operation.type !== 'added') oldLine += 1;
    if (operation.type !== 'removed') newLine += 1;
    if (operation.type === 'added') added += 1;
    if (operation.type === 'removed') removed += 1;
    return { ...operation, key: index, oldLine: operation.type === 'added' ? '' : oldLine, newLine: operation.type === 'removed' ? '' : newLine };
  });
  return { rows: result, added, removed };
}

export function compactDiff(rows, context = 3) {
  const visible = new Uint8Array(rows.length);
  for (let index = 0; index < rows.length; index += 1) {
    if (rows[index].type !== 'context') {
      for (let near = Math.max(0, index - context); near <= Math.min(rows.length - 1, index + context); near += 1) visible[near] = 1;
    }
  }
  const compact = [];
  let hidden = 0;
  for (let index = 0; index < rows.length; index += 1) {
    if (!visible[index]) { hidden += 1; continue; }
    if (hidden) { compact.push({ type: 'gap', count: hidden, key: `gap-${index}` }); hidden = 0; }
    compact.push(rows[index]);
  }
  if (hidden) compact.push({ type: 'gap', count: hidden, key: 'gap-end' });
  return compact;
}
