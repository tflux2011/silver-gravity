// Pure connector-geometry helpers.
//
// These functions are DOM-free: callers measure node dimensions (from refs)
// and pass them in, keeping routing logic testable and side-effect free.

// Compute the coordinate of a named port on a node given its measured size.
export const portCoordsFor = (node, portName, width, height) => {
  if (!node) return { x: 0, y: 0 };
  switch (portName) {
    case 'top':
      return { x: node.x + width / 2, y: node.y };
    case 'right':
      return { x: node.x + width, y: node.y + height / 2 };
    case 'bottom':
      return { x: node.x + width / 2, y: node.y + height };
    case 'left':
      return { x: node.x, y: node.y + height / 2 };
    default:
      return { x: node.x, y: node.y };
  }
};

// Build an orthogonal (right-angled) SVG path between two port coordinates.
export const orthogonalPath = (start, end, fromPort, toPort) => {
  const x1 = start.x;
  const y1 = start.y;
  const x2 = end.x;
  const y2 = end.y;

  if (fromPort === 'right' && toPort === 'left') {
    const midX = (x1 + x2) / 2;
    return `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`;
  }
  if (fromPort === 'left' && toPort === 'right') {
    const midX = (x1 + x2) / 2;
    return `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`;
  }
  if (fromPort === 'bottom' && toPort === 'top') {
    const midY = (y1 + y2) / 2;
    return `M ${x1} ${y1} V ${midY} H ${x2} V ${y2}`;
  }
  if (fromPort === 'top' && toPort === 'bottom') {
    const midY = (y1 + y2) / 2;
    return `M ${x1} ${y1} V ${midY} H ${x2} V ${y2}`;
  }

  // Default 2-step layout when the port pair is not directly opposed.
  if (fromPort === 'top' || fromPort === 'bottom') {
    return `M ${x1} ${y1} V ${y2} H ${x2}`;
  }
  return `M ${x1} ${y1} H ${x2} V ${y2}`;
};

// Snap a raw coordinate to the nearest 8px increment.
export const snapTo8 = (val) => Math.round(val / 8) * 8;
