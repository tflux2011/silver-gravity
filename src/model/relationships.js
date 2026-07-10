// UML relationship (connector) registry.
//
// Each relationship type declares how it renders:
//   markerEnd   -> id of the SVG <marker> painted at the target end
//   markerStart -> id of the SVG <marker> painted at the source end (optional)
//   dashed      -> stroke rendered as a dashed line
//   label       -> human label used by the properties selector
//
// The registry is the single source of truth consumed by the connector
// renderer and the properties panel. Phase 1 extends this with the remaining
// OMG UML 2.5 connectors (dependency, directed association, realization, etc.).
export const RELATIONSHIP_TYPES = {
  association: {
    label: 'Association (Solid line, Arrow)',
    markerEnd: 'arrow',
    dashed: false
  },
  inheritance: {
    label: 'Inheritance (Generalization)',
    markerEnd: 'inheritance',
    dashed: false
  },
  implementation: {
    label: 'Implementation (Dashed line, Hollow Arrow)',
    markerEnd: 'inheritance',
    dashed: true
  },
  aggregation: {
    label: 'Aggregation (Hollow Diamond)',
    markerEnd: 'aggregation',
    dashed: false
  },
  composition: {
    label: 'Composition (Solid Diamond)',
    markerEnd: 'composition',
    dashed: false
  }
};

export const relationshipDef = (type) =>
  RELATIONSHIP_TYPES[type] || RELATIONSHIP_TYPES.association;

// Ordered list used to build the relationship-type <select>.
export const RELATIONSHIP_ORDER = [
  'association',
  'inheritance',
  'implementation',
  'aggregation',
  'composition'
];
