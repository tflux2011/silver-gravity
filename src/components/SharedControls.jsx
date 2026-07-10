import { Trash2, Keyboard } from 'lucide-react';

// Hover-reveal delete control shared by every node shape.
export const NodeDeleteButton = ({ label, name, onDelete }) => (
  <button
    className="node-delete-btn"
    onClick={(e) => {
      e.stopPropagation();
      if (window.confirm(`Delete ${label} ${name}?`)) {
        onDelete();
      }
    }}
    title={`Delete ${label}`}
  >
    <Trash2 size={13} strokeWidth={1.5} />
  </button>
);

// Keyboard-shortcut reference card shown in the empty-selection sidebar.
export const ShortcutHelp = () => (
  <div className="help-card">
    <div className="help-title"><Keyboard size={14} strokeWidth={2} /> Keyboard Shortcuts</div>
    <ul className="help-list">
      <li><span className="help-key">Double Click Canvas</span> Spawns new Class</li>
      <li><span className="help-key">Ctrl / Cmd + S</span> Quick Save</li>
      <li><span className="help-key">Ctrl / Cmd + O</span> Open File</li>
      <li><span className="help-key">Ctrl / Cmd + Z</span> Undo</li>
      <li><span className="help-key">Ctrl / Cmd + Shift + Z</span> Redo</li>
      <li><span className="help-key">Delete / Backspace</span> Removes selected Class/Connection</li>
      <li><span className="help-key">Space + Drag</span> Pan Canvas</li>
    </ul>
  </div>
);
