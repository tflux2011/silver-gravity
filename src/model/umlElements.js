// UML element type registry.
//
// Each node stores a `type`; an undefined type is treated as 'class' for
// backward compatibility. `shape` drives rendering:
//   'class'   -> 3-compartment box (class / interface / abstract / enumeration)
//   'note'    -> folded-corner comment
//   'actor'   -> stick figure (use-case diagrams)
//   'usecase' -> ellipse
import {
  Box,
  Puzzle,
  Shapes,
  List,
  StickyNote,
  User,
  Circle
} from 'lucide-react';

export const TYPE_ICONS = {
  class: Box,
  interface: Puzzle,
  abstract: Shapes,
  enumeration: List,
  note: StickyNote,
  actor: User,
  usecase: Circle
};

export const UML_ELEMENTS = {
  class: {
    label: 'Class',
    shape: 'class',
    stereotype: null,
    italicName: false,
    hasMethods: true,
    isEnum: false,
    seed: (t) => ({
      attributes: [{ id: `attr-${t}-1`, visibility: '-', name: 'id', type: 'String' }],
      methods: [{ id: `meth-${t}-1`, visibility: '+', name: 'execute', parameters: '', returnType: 'void' }]
    })
  },
  interface: {
    label: 'Interface',
    shape: 'class',
    stereotype: 'interface',
    italicName: true,
    hasMethods: true,
    isEnum: false,
    seed: (t) => ({
      attributes: [],
      methods: [{ id: `meth-${t}-1`, visibility: '+', name: 'operation', parameters: '', returnType: 'void' }]
    })
  },
  abstract: {
    label: 'Abstract Class',
    shape: 'class',
    stereotype: 'abstract',
    italicName: true,
    hasMethods: true,
    isEnum: false,
    seed: (t) => ({
      attributes: [{ id: `attr-${t}-1`, visibility: '#', name: 'state', type: 'String' }],
      methods: [{ id: `meth-${t}-1`, visibility: '+', name: 'process', parameters: '', returnType: 'void' }]
    })
  },
  enumeration: {
    label: 'Enumeration',
    shape: 'class',
    stereotype: 'enumeration',
    italicName: false,
    hasMethods: false,
    isEnum: true,
    seed: (t) => ({
      attributes: [
        { id: `attr-${t}-1`, visibility: '', name: 'VALUE_ONE', type: '' },
        { id: `attr-${t}-2`, visibility: '', name: 'VALUE_TWO', type: '' }
      ],
      methods: []
    })
  },
  note: {
    label: 'Note',
    shape: 'note',
    stereotype: null,
    italicName: false,
    hasMethods: false,
    isEnum: false,
    seed: () => ({ attributes: [], methods: [], text: 'Note…' })
  },
  actor: {
    label: 'Actor',
    shape: 'actor',
    stereotype: null,
    italicName: false,
    hasMethods: false,
    isEnum: false,
    seed: () => ({ attributes: [], methods: [] })
  },
  usecase: {
    label: 'Use Case',
    shape: 'usecase',
    stereotype: null,
    italicName: false,
    hasMethods: false,
    isEnum: false,
    seed: () => ({ attributes: [], methods: [] })
  }
};

// Resolve a node's element definition, defaulting to class.
export const elementDef = (type) => UML_ELEMENTS[type] || UML_ELEMENTS.class;

// Ordered palette entries rendered in the left rail.
export const PALETTE_ITEMS = ['class', 'interface', 'abstract', 'enumeration', 'note', 'actor', 'usecase'];
