import { useCallback, useReducer } from 'react';

// Undo/redo history for the diagram document ({ nodes, connections }).
//
// The whole document is treated as a single immutable value. Each committed
// change pushes the previous document onto the past stack and clears the
// redo (future) stack. `set` accepts either a next value or an updater fn.
//
// This keeps history logic isolated from the editor's transient UI state
// (selection, drag, pan) which should never be part of undo.

const HISTORY_LIMIT = 100;

function reducer(state, action) {
  switch (action.type) {
    case 'commit': {
      const nextPresent =
        typeof action.value === 'function'
          ? action.value(state.present)
          : action.value;
      if (nextPresent === state.present) return state;
      const past = [...state.past, state.present];
      if (past.length > HISTORY_LIMIT) past.shift();
      return { past, present: nextPresent, future: [] };
    }
    case 'undo': {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      const past = state.past.slice(0, -1);
      return { past, present: previous, future: [state.present, ...state.future] };
    }
    case 'redo': {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      const future = state.future.slice(1);
      return { past: [...state.past, state.present], present: next, future };
    }
    case 'reset': {
      return { past: [], present: action.value, future: [] };
    }
    default:
      return state;
  }
}

export function useHistory(initialDocument) {
  const [state, dispatch] = useReducer(reducer, {
    past: [],
    present: initialDocument,
    future: []
  });

  // Commit a new document version (undoable).
  const set = useCallback((value) => dispatch({ type: 'commit', value }), []);
  // Replace the document without creating an undo step (e.g. file open / new).
  const reset = useCallback((value) => dispatch({ type: 'reset', value }), []);
  const undo = useCallback(() => dispatch({ type: 'undo' }), []);
  const redo = useCallback(() => dispatch({ type: 'redo' }), []);

  return {
    document: state.present,
    set,
    reset,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0
  };
}
