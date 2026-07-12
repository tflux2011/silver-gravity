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
// midOffset (optional): custom elbow position offset for user-adjustable routing.
export const orthogonalPath = (start, end, fromPort, toPort, midOffset) => {
  const x1 = start.x;
  const y1 = start.y;
  const x2 = end.x;
  const y2 = end.y;

  if (fromPort === 'right' && toPort === 'left') {
    const midX = midOffset != null ? midOffset : (x1 + x2) / 2;
    return `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`;
  }
  if (fromPort === 'left' && toPort === 'right') {
    const midX = midOffset != null ? midOffset : (x1 + x2) / 2;
    return `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`;
  }
  if (fromPort === 'bottom' && toPort === 'top') {
    const midY = midOffset != null ? midOffset : (y1 + y2) / 2;
    return `M ${x1} ${y1} V ${midY} H ${x2} V ${y2}`;
  }
  if (fromPort === 'top' && toPort === 'bottom') {
    const midY = midOffset != null ? midOffset : (y1 + y2) / 2;
    return `M ${x1} ${y1} V ${midY} H ${x2} V ${y2}`;
  }

  // Default 2-step layout when the port pair is not directly opposed.
  if (fromPort === 'top' || fromPort === 'bottom') {
    return `M ${x1} ${y1} V ${y2} H ${x2}`;
  }
  return `M ${x1} ${y1} H ${x2} V ${y2}`;
};

// Determine the elbow midpoint coordinate for a given connection path.
// Returns { x, y, axis } where axis is 'x' or 'y' (the draggable direction).
export const getElbowMidpoint = (start, end, fromPort, toPort, midOffset) => {
  const x1 = start.x, y1 = start.y, x2 = end.x, y2 = end.y;

  if (fromPort === 'right' && toPort === 'left') {
    const midX = midOffset != null ? midOffset : (x1 + x2) / 2;
    return { x: midX, y: (y1 + y2) / 2, axis: 'x' };
  }
  if (fromPort === 'left' && toPort === 'right') {
    const midX = midOffset != null ? midOffset : (x1 + x2) / 2;
    return { x: midX, y: (y1 + y2) / 2, axis: 'x' };
  }
  if (fromPort === 'bottom' && toPort === 'top') {
    const midY = midOffset != null ? midOffset : (y1 + y2) / 2;
    return { x: (x1 + x2) / 2, y: midY, axis: 'y' };
  }
  if (fromPort === 'top' && toPort === 'bottom') {
    const midY = midOffset != null ? midOffset : (y1 + y2) / 2;
    return { x: (x1 + x2) / 2, y: midY, axis: 'y' };
  }

  // 2-step paths: midpoint at the corner
  if (fromPort === 'top' || fromPort === 'bottom') {
    return { x: x2, y: y2, axis: null }; // not easily draggable in 2-step
  }
  return { x: x2, y: y1, axis: null };
};

// Snap a raw coordinate to the nearest 8px increment.
export const snapTo8 = (val) => Math.round(val / 8) * 8;

// Heuristic calculation for standard node width/height to fit text content.
export const getFitDimensions = (node, def) => {
  let maxChars = node.name.length + (node.stereotype ? node.stereotype.length + 4 : 0);

  if (def.shape === 'class') {
    node.attributes.forEach((attr) => {
      const len =
        (attr.visibility || '').length +
        1 +
        (attr.isDerived ? 1 : 0) +
        (attr.name || '').length +
        2 +
        (attr.type || '').length +
        (attr.defaultValue ? attr.defaultValue.length + 3 : 0) +
        (attr.property ? attr.property.length + 3 : 0);
      if (len > maxChars) maxChars = len;
    });

    node.methods.forEach((meth) => {
      const len =
        (meth.visibility || '').length +
        1 +
        (meth.name || '').length +
        1 +
        (meth.parameters || '').length +
        3 +
        (meth.returnType || '').length +
        (meth.property ? meth.property.length + 3 : 0);
      if (len > maxChars) maxChars = len;
    });
  } else if (def.shape === 'note') {
    const lines = (node.text || '').split('\n');
    lines.forEach((line) => {
      if (line.length > maxChars) maxChars = line.length;
    });
  }

  const charWidth = 6.8;
  const horizontalPadding = 56;
  const calculatedWidth = Math.max(160, Math.ceil((maxChars * charWidth + horizontalPadding) / 8) * 8);

  let calculatedHeight = 40;
  if (def.shape === 'class') {
    calculatedHeight += 16 + Math.max(1, node.attributes.length) * 18;
    if (def.hasMethods) {
      calculatedHeight += 16 + Math.max(1, node.methods.length) * 18;
    }
  } else if (def.shape === 'note') {
    const lineCount = (node.text || '').split('\n').length;
    calculatedHeight += 16 + lineCount * 18;
  } else if (def.shape === 'actor') {
    calculatedHeight = 112;
  } else {
    calculatedHeight = 80;
  }

  calculatedHeight = Math.ceil(calculatedHeight / 8) * 8;

  return { width: calculatedWidth, height: calculatedHeight };
};

// Generate vertices for orthogonal connections.
export const getOrthogonalVertices = (start, end, fromPort, toPort, midOffset) => {
  const x1 = start.x;
  const y1 = start.y;
  const x2 = end.x;
  const y2 = end.y;

  if (fromPort === 'right' && toPort === 'left') {
    const midX = midOffset != null ? midOffset : (x1 + x2) / 2;
    return [
      { x: x1, y: y1 },
      { x: midX, y: y1 },
      { x: midX, y: y2 },
      { x: x2, y: y2 }
    ];
  }
  if (fromPort === 'left' && toPort === 'right') {
    const midX = midOffset != null ? midOffset : (x1 + x2) / 2;
    return [
      { x: x1, y: y1 },
      { x: midX, y: y1 },
      { x: midX, y: y2 },
      { x: x2, y: y2 }
    ];
  }
  if (fromPort === 'bottom' && toPort === 'top') {
    const midY = midOffset != null ? midOffset : (y1 + y2) / 2;
    return [
      { x: x1, y: y1 },
      { x: x1, y: midY },
      { x: x2, y: midY },
      { x: x2, y: y2 }
    ];
  }
  if (fromPort === 'top' && toPort === 'bottom') {
    const midY = midOffset != null ? midOffset : (y1 + y2) / 2;
    return [
      { x: x1, y: y1 },
      { x: x1, y: midY },
      { x: x2, y: midY },
      { x: x2, y: y2 }
    ];
  }

  // Default 2-step layout when the port pair is not directly opposed.
  if (fromPort === 'top' || fromPort === 'bottom') {
    return [
      { x: x1, y: y1 },
      { x: x1, y: y2 },
      { x: x2, y: y2 }
    ];
  }
  return [
    { x: x1, y: y1 },
    { x: x2, y: y1 },
    { x: x2, y: y2 }
  ];
};

// Calculate orthogonal path strings with small bridge jumps over perpendicular lines.
export const calculateConnectionPathWithJumps = (conn, allConnections, getPortCoords) => {
  const start = getPortCoords(conn.fromNodeId, conn.fromPort);
  const end = getPortCoords(conn.toNodeId, conn.toPort);
  const vertices = getOrthogonalVertices(start, end, conn.fromPort, conn.toPort, conn.midOffset);

  // Find all other connections' vertical segments to check for intersection
  const otherVerticalSegments = [];
  allConnections.forEach((other) => {
    if (other.id === conn.id) return;
    const otherStart = getPortCoords(other.fromNodeId, other.fromPort);
    const otherEnd = getPortCoords(other.toNodeId, other.toPort);
    const otherVertices = getOrthogonalVertices(otherStart, otherEnd, other.fromPort, other.toPort, other.midOffset);
    for (let i = 0; i < otherVertices.length - 1; i++) {
      const p1 = otherVertices[i];
      const p2 = otherVertices[i + 1];
      if (Math.abs(p1.x - p2.x) < 0.1) {
        otherVerticalSegments.push({
          x: p1.x,
          y1: Math.min(p1.y, p2.y),
          y2: Math.max(p1.y, p2.y)
        });
      }
    }
  });

  let pathStr = `M ${vertices[0].x} ${vertices[0].y}`;
  for (let i = 0; i < vertices.length - 1; i++) {
    const p1 = vertices[i];
    const p2 = vertices[i + 1];

    if (Math.abs(p1.y - p2.y) < 0.1) {
      // Horizontal segment: cross check with vertical lines
      const y = p1.y;
      const xStart = p1.x;
      const xEnd = p2.x;
      const xMin = Math.min(xStart, xEnd);
      const xMax = Math.max(xStart, xEnd);

      const intersections = [];
      otherVerticalSegments.forEach((vSeg) => {
        // Cross segment within bounds, skipping points close to ends
        if (vSeg.x > xMin + 6 && vSeg.x < xMax - 6 && y > vSeg.y1 + 6 && y < vSeg.y2 - 6) {
          intersections.push(vSeg.x);
        }
      });

      if (intersections.length > 0) {
        if (xStart < xEnd) {
          intersections.sort((a, b) => a - b);
        } else {
          intersections.sort((a, b) => b - a);
        }

        intersections.forEach((xInt) => {
          const jumpRadius = 4;
          const sweepFlag = 1; // arc up
          if (xStart < xEnd) {
            pathStr += ` H ${xInt - jumpRadius} A ${jumpRadius} ${jumpRadius} 0 0 ${sweepFlag} ${xInt + jumpRadius} ${y}`;
          } else {
            pathStr += ` H ${xInt + jumpRadius} A ${jumpRadius} ${jumpRadius} 0 0 ${sweepFlag} ${xInt - jumpRadius} ${y}`;
          }
        });
      }
      pathStr += ` H ${xEnd}`;
    } else {
      pathStr += ` V ${p2.y}`;
    }
  }

  return pathStr;
};

