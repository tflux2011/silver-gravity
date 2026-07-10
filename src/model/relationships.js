// UML relationship (connector) registry.
//
// Each relationship type declares how it renders:
//   markerEnd   -> id of the SVG <marker> painted at the target end
//   dashed      -> stroke rendered as a dashed line
//   label       -> human label used by the properties selector
//   navigable   -> whether per-end navigability arrows apply (association/dependency)
//
// The registry is the single source of truth consumed by the connector
// renderer and the properties panel.
export const RELATIONSHIP_TYPES = {
  association: {
    label: 'Association (Solid line)',
    markerEnd: null,
    dashed: false,
    navigable: true
  },
  dependency: {
    label: 'Dependency (Dashed, Open Arrow)',
    markerEnd: 'arrow',
    dashed: true,
    navigable: true
  },
  inheritance: {
    label: 'Generalization (Hollow Triangle)',
    markerEnd: 'inheritance',
    dashed: false,
    navigable: false
  },
  implementation: {
    label: 'Realization (Dashed, Hollow Triangle)',
    markerEnd: 'inheritance',
    dashed: true,
    navigable: false
  },
  aggregation: {
    label: 'Aggregation (Hollow Diamond)',
    markerEnd: 'aggregation',
    dashed: false,
    navigable: false
  },
  composition: {
    label: 'Composition (Solid Diamond)',
    markerEnd: 'composition',
    dashed: false,
    navigable: false
  }
};

export const relationshipDef = (type) =>
  RELATIONSHIP_TYPES[type] || RELATIONSHIP_TYPES.association;

// Ordered list used to build the relationship-type <select>.
export const RELATIONSHIP_ORDER = [
  'association',
  'dependency',
  'inheritance',
  'implementation',
  'aggregation',
  'composition'
];

// Per-end navigability options (UML 2.5): unspecified, navigable (open arrow),
// or explicitly not-navigable (small cross).
export const NAVIGABILITY_OPTIONS = [
  { value: 'none', label: 'Unspecified' },
  { value: 'open', label: 'Navigable (arrow)' },
  { value: 'cross', label: 'Not navigable (x)' }
];

// Map a navigability option to a marker id (or null for no marker).
const arrowMarkerFor = (option, fallback) => {
  if (option === 'open') return 'arrow';
  if (option === 'cross') return 'cross';
  if (option === undefined || option === null) return fallback;
  return null; // 'none'
};

// Resolve the start/end markers and dashing for a connection, honoring both
// the relationship type and per-end navigability (for associations).
export const resolveMarkers = (conn) => {
  const def = relationshipDef(conn.type);

  if (!def.navigable) {
    return { markerStartId: null, markerEndId: def.markerEnd, dashed: def.dashed };
  }

  // Dependency implies an open arrow at the target unless overridden.
  const endFallback = conn.type === 'dependency' ? 'arrow' : null;
  return {
    markerStartId: arrowMarkerFor(conn.startArrow, null),
    markerEndId: arrowMarkerFor(conn.endArrow, endFallback),
    dashed: def.dashed
  };
};
