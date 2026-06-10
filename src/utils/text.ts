function lineAndColumn(content: string, cursor: number) {
  const beforeCursor = content.slice(0, cursor);
  const lines = beforeCursor.split("\n");
  return { line: lines.length, column: lines[lines.length - 1].length + 1 };
}

function buildLineStarts(content: string) {
  const starts = [0];
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === "\n") {
      starts.push(index + 1);
    }
  }
  return starts;
}

function getLineIndexAtOffset(lineStarts: number[], offset: number) {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (lineStarts[middle] <= offset) {
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return Math.max(0, high);
}

function lineAndColumnFromStarts(content: string, cursor: number, lineStarts: number[]) {
  const lineIndex = getLineIndexAtOffset(lineStarts, cursor);
  return {
    line: lineIndex + 1,
    column: cursor - lineStarts[lineIndex] + 1
  };
}

export { lineAndColumn, buildLineStarts, getLineIndexAtOffset, lineAndColumnFromStarts };
