import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  File,
  FolderOpen,
  Save,
  Download,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Trash2,
  BookOpen,
  Database,
  Layers,
  GitBranch,
  Link2,
  Wand2,
  Box,
  Undo2,
  Redo2,
  ArrowLeftRight,
  Settings,
  UserCircle
} from 'lucide-react';
import { TYPE_ICONS, elementDef, PALETTE_ITEMS } from './model/umlElements';
import {
  RELATIONSHIP_ORDER,
  RELATIONSHIP_TYPES,
  resolveMarkers,
  NAVIGABILITY_OPTIONS,
  MULTIPLICITY_OPTIONS
} from './model/relationships';
import {
  INITIAL_NODES,
  INITIAL_CONNECTIONS,
  COMPRO_TEMPLATE_NODES,
  COMPRO_TEMPLATE_CONNECTIONS,
  HOSPITAL_TEMPLATE_NODES,
  HOSPITAL_TEMPLATE_CONNECTIONS
} from './model/samples';
import { portCoordsFor, orthogonalPath, snapTo8 } from './model/geometry';
import { useHistory } from './history/useHistory';
import ConnectorMarkers from './components/ConnectorMarkers';
import { NodeDeleteButton, ShortcutHelp } from './components/SharedControls';
import './App.css';

// Build the multiplicity option list, preserving any pre-existing custom token
// (e.g. loaded from a saved file) so it is not silently dropped.
const multiplicityOptionsFor = (current) => {
  const known = MULTIPLICITY_OPTIONS.some((o) => o.value === current);
  const extra = !known && current ? [{ value: current, label: `${current}  (custom)` }] : [];
  return [...extra, ...MULTIPLICITY_OPTIONS];
};

export default function App() {
  // Single undoable document. Transient UI state (selection, drag, pan) is
  // deliberately kept outside history so undo/redo only affect diagram data.
  const { document: doc, set: setDoc, undo, redo, canUndo, canRedo } = useHistory({
    nodes: INITIAL_NODES,
    connections: INITIAL_CONNECTIONS
  });
  const nodes = doc.nodes;
  const connections = doc.connections;

  // Field-scoped setters that commit a single history entry.
  const setNodes = useCallback(
    (value) =>
      setDoc((prev) => ({
        ...prev,
        nodes: typeof value === 'function' ? value(prev.nodes) : value
      })),
    [setDoc]
  );
  const setConnections = useCallback(
    (value) =>
      setDoc((prev) => ({
        ...prev,
        connections: typeof value === 'function' ? value(prev.connections) : value
      })),
    [setDoc]
  );

  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState(null);

  const [zoom, setZoom] = useState(1.0);
  const [panX, setPanX] = useState(100);
  const [panY, setPanY] = useState(80);
  const [filePath, setFilePath] = useState(null);

  // Dragging states
  const [draggedNodeId, setDraggedNodeId] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  // Live position of the node being dragged. Kept out of history so a drag
  // produces exactly one undo entry (committed on mouse-up).
  const [livePos, setLivePos] = useState(null);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  const [drawingConnection, setDrawingConnection] = useState(null);

  // Controlled input states for sidebar renaming
  const [editingName, setEditingName] = useState('');
  const [nameError, setNameError] = useState('');

  // Load-sample dropdown menu visibility
  const [sampleMenuOpen, setSampleMenuOpen] = useState(false);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const selectedConnection = connections.find((c) => c.id === selectedConnectionId);

  // Sync input name when selection changes
  useEffect(() => {
    if (selectedNode) {
      setEditingName(selectedNode.name);
      setNameError('');
    } else {
      setEditingName('');
      setNameError('');
    }
  }, [selectedNodeId, nodes]);

  const canvasRef = useRef(null);
  const nodeRefs = useRef({});

  // Effective coordinates for a node: the in-flight drag position wins.
  const effectiveNode = useCallback(
    (node) => {
      if (livePos && draggedNodeId === node.id) {
        return { ...node, x: livePos.x, y: livePos.y };
      }
      return node;
    },
    [livePos, draggedNodeId]
  );

  // Node operations
  const deleteNode = useCallback(
    (nodeId) => {
      setDoc((prev) => ({
        nodes: prev.nodes.filter((n) => n.id !== nodeId),
        connections: prev.connections.filter(
          (c) => c.fromNodeId !== nodeId && c.toNodeId !== nodeId
        )
      }));
      setSelectedNodeId((cur) => (cur === nodeId ? null : cur));
    },
    [setDoc]
  );

  const deleteConnection = useCallback(
    (connId) => {
      setConnections((prev) => prev.filter((c) => c.id !== connId));
      setSelectedConnectionId((cur) => (cur === connId ? null : cur));
    },
    [setConnections]
  );

  // Keyboard listeners for shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      const isInputFocused = ['INPUT', 'SELECT', 'TEXTAREA'].includes(
        document.activeElement.tagName
      );
      if (isInputFocused) return;

      // Undo / Redo
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }

      // Delete key or Backspace key removes selected node or connection
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNodeId) {
          deleteNode(selectedNodeId);
        } else if (selectedConnectionId) {
          deleteConnection(selectedConnectionId);
        }
      }

      // Cmd/Ctrl + S for Save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }

      // Cmd/Ctrl + O for Open
      if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault();
        handleOpen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeId, selectedConnectionId, nodes, connections, filePath, undo, redo]);

  // IPC Bridge File operations
  const handleOpen = async () => {
    if (window.electronAPI) {
      try {
        const fileData = await window.electronAPI.openFile();
        if (fileData) {
          const parsed = JSON.parse(fileData.content);
          if (parsed.nodes && parsed.connections) {
            setDoc({ nodes: parsed.nodes, connections: parsed.connections });
            setFilePath(fileData.filePath);
            setSelectedNodeId(null);
            setSelectedConnectionId(null);
          }
        }
      } catch (err) {
        alert('Failed to load project: ' + err.message);
      }
    } else {
      // Fallback: Web browser file reader simulation
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.uml,.json';
      input.onchange = (e) => {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const parsed = JSON.parse(event.target.result);
            if (parsed.nodes && parsed.connections) {
              setDoc({ nodes: parsed.nodes, connections: parsed.connections });
              setFilePath(file.name);
            }
          } catch (err) {
            alert('Invalid JSON file format.');
          }
        };
        reader.readAsText(file);
      };
      input.click();
    }
  };

  const handleSave = async () => {
    const payload = JSON.stringify({ nodes, connections }, null, 2);
    if (window.electronAPI) {
      if (filePath) {
        try {
          await window.electronAPI.saveFile(filePath, payload);
        } catch (err) {
          alert('Failed to save file: ' + err.message);
        }
      } else {
        handleSaveAs();
      }
    } else {
      // Fallback: Web browser download file simulation
      const blob = new Blob([payload], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filePath || 'diagram.uml';
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleSaveAs = async () => {
    const payload = JSON.stringify({ nodes, connections }, null, 2);
    if (window.electronAPI) {
      try {
        const result = await window.electronAPI.saveFileAs(payload);
        if (result && result.filePath) {
          setFilePath(result.filePath);
        }
      } catch (err) {
        alert('Failed to save as: ' + err.message);
      }
    } else {
      const name = prompt('Enter filename to save:', filePath || 'diagram.uml');
      if (name) {
        setFilePath(name);
        const blob = new Blob([payload], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.click();
        URL.revokeObjectURL(url);
      }
    }
  };

  const handleNewProject = () => {
    if (window.confirm('Are you sure you want to start a new blank diagram?')) {
      setDoc({ nodes: [], connections: [] });
      setFilePath(null);
      setSelectedNodeId(null);
      setSelectedConnectionId(null);
      setZoom(1.0);
      setPanX(100);
      setPanY(80);
    }
  };

  // Load a bundled sample diagram, then close the sample menu.
  const loadSample = (val) => {
    if (val === 'initial') {
      setDoc({ nodes: INITIAL_NODES, connections: INITIAL_CONNECTIONS });
      setFilePath('SimpleSample.uml');
      setSelectedNodeId(null);
      setSelectedConnectionId(null);
    } else if (val === 'compro') {
      setDoc({ nodes: COMPRO_TEMPLATE_NODES, connections: COMPRO_TEMPLATE_CONNECTIONS });
      setFilePath('ComproScheduleSystem.uml');
      setSelectedNodeId(null);
      setSelectedConnectionId(null);
      setZoom(0.9);
      setPanX(60);
      setPanY(50);
    } else if (val === 'hospital') {
      setDoc({ nodes: HOSPITAL_TEMPLATE_NODES, connections: HOSPITAL_TEMPLATE_CONNECTIONS });
      setFilePath('HospitalManagementSystem.uml');
      setSelectedNodeId(null);
      setSelectedConnectionId(null);
      setZoom(0.9);
      setPanX(60);
      setPanY(50);
    }
    setSampleMenuOpen(false);
  };

  const addNode = (type = 'class') => {
    const def = elementDef(type);

    // Generate element position relative to current viewport
    const x = snapTo8(Math.max(80, -panX + 200));
    const y = snapTo8(Math.max(80, -panY + 150));

    // Disallow creating multiple elements with the same default name
    const baseName = `New${def.label.replace(/\s+/g, '')}`;
    let name = baseName;
    let counter = 1;
    while (nodes.some((n) => n.name.toLowerCase() === name.toLowerCase())) {
      name = `${baseName}${counter}`;
      counter++;
    }

    const stamp = Date.now();
    const seed = def.seed(stamp);
    const newNode = {
      id: `node-${stamp}`,
      type,
      name,
      x,
      y,
      attributes: seed.attributes,
      methods: seed.methods,
      text: seed.text || ''
    };

    setNodes([...nodes, newNode]);
    setSelectedNodeId(newNode.id);
    setSelectedConnectionId(null);
  };

  // Convert an existing element to another UML type. Compartments that the
  // target shape does not use are cleared, and notes get seeded body text.
  const updateNodeType = (nodeId, newType) => {
    const def = elementDef(newType);
    setNodes(
      nodes.map((n) => {
        if (n.id !== nodeId) return n;
        const next = { ...n, type: newType };
        if (!def.hasMethods) next.methods = [];
        if (def.shape !== 'class') next.attributes = [];
        if (def.shape === 'note' && !next.text) next.text = 'Note…';
        return next;
      })
    );
  };

  // Update a note's body text.
  const updateNodeText = (nodeId, text) => {
    setNodes(nodes.map((n) => (n.id === nodeId ? { ...n, text } : n)));
  };

  // Patch arbitrary top-level fields on a node (stereotype, constraint, …).
  const updateNodeFields = (nodeId, fields) => {
    setNodes(nodes.map((n) => (n.id === nodeId ? { ...n, ...fields } : n)));
  };

  const handleNameChange = (val) => {
    setEditingName(val);
    const cleaned = val.trim();
    const isDuplicate = nodes.some(
      (n) => n.id !== selectedNodeId && n.name.toLowerCase() === cleaned.toLowerCase()
    );
    if (isDuplicate) {
      setNameError('Class name must be unique');
    } else if (cleaned === '') {
      setNameError('Class name cannot be empty');
    } else {
      setNameError('');
      // commit immediately to node name list
      setNodes(nodes.map((n) => (n.id === selectedNodeId ? { ...n, name: val } : n)));
    }
  };

  const updateNodeCoords = (nodeId, x, y) => {
    setNodes(nodes.map((n) => (n.id === nodeId ? { ...n, x: snapTo8(x), y: snapTo8(y) } : n)));
  };

  // Attributes / Methods editors
  const addAttribute = (nodeId) => {
    setNodes(
      nodes.map((n) => {
        if (n.id === nodeId) {
          return {
            ...n,
            attributes: [
              ...n.attributes,
              { id: `attr-${Date.now()}`, visibility: '+', name: 'newAttribute', type: 'String' }
            ]
          };
        }
        return n;
      })
    );
  };

  const updateAttribute = (nodeId, attrId, fields) => {
    setNodes(
      nodes.map((n) => {
        if (n.id === nodeId) {
          return {
            ...n,
            attributes: n.attributes.map((a) => (a.id === attrId ? { ...a, ...fields } : a))
          };
        }
        return n;
      })
    );
  };

  const removeAttribute = (nodeId, attrId) => {
    setNodes(
      nodes.map((n) => {
        if (n.id === nodeId) {
          return { ...n, attributes: n.attributes.filter((a) => a.id !== attrId) };
        }
        return n;
      })
    );
  };

  const addMethod = (nodeId) => {
    setNodes(
      nodes.map((n) => {
        if (n.id === nodeId) {
          return {
            ...n,
            methods: [
              ...n.methods,
              { id: `meth-${Date.now()}`, visibility: '+', name: 'newMethod', parameters: '', returnType: 'void' }
            ]
          };
        }
        return n;
      })
    );
  };

  const updateMethod = (nodeId, methId, fields) => {
    setNodes(
      nodes.map((n) => {
        if (n.id === nodeId) {
          return {
            ...n,
            methods: n.methods.map((m) => (m.id === methId ? { ...m, ...fields } : m))
          };
        }
        return n;
      })
    );
  };

  const removeMethod = (nodeId, methId) => {
    setNodes(
      nodes.map((n) => {
        if (n.id === nodeId) {
          return { ...n, methods: n.methods.filter((m) => m.id !== methId) };
        }
        return n;
      })
    );
  };

  const updateConnection = (connId, fields) => {
    setConnections(connections.map((c) => (c.id === connId ? { ...c, ...fields } : c)));
  };

  // Flip a relationship's direction: swap source/target endpoints together with
  // every paired end-property so arrowheads, roles and multiplicities follow.
  const reverseConnection = (connId) => {
    setConnections(
      connections.map((c) =>
        c.id === connId
          ? {
              ...c,
              fromNodeId: c.toNodeId,
              toNodeId: c.fromNodeId,
              fromPort: c.toPort,
              toPort: c.fromPort,
              roleFrom: c.roleTo,
              roleTo: c.roleFrom,
              multiplicityFrom: c.multiplicityTo,
              multiplicityTo: c.multiplicityFrom,
              startArrow: c.endArrow,
              endArrow: c.startArrow
            }
          : c
      )
    );
  };

  // Canvas Drag Panning
  const handleCanvasMouseDown = (e) => {
    // If user clicked standard elements/ports, ignore canvas panning
    if (
      e.target.closest('.uml-node') ||
      e.target.closest('.port') ||
      e.target.closest('button') ||
      e.target.closest('.sidebar')
    ) {
      return;
    }
    setIsPanning(true);
    setPanStart({ x: e.clientX - panX, y: e.clientY - panY });
  };

  const handleCanvasMouseMove = (e) => {
    if (isPanning) {
      setPanX(e.clientX - panStart.x);
      setPanY(e.clientY - panStart.y);
    } else if (draggedNodeId) {
      // Live drag - update transient position only (committed on mouse-up).
      const newX = snapTo8((e.clientX - panX) / zoom - dragOffset.x);
      const newY = snapTo8((e.clientY - panY) / zoom - dragOffset.y);
      setLivePos({ x: newX, y: newY });
    } else if (drawingConnection) {
      // Dynamic connection drawing preview
      const rect = canvasRef.current.getBoundingClientRect();
      const currentX = (e.clientX - rect.left - panX) / zoom;
      const currentY = (e.clientY - rect.top - panY) / zoom;
      setDrawingConnection({ ...drawingConnection, currentX, currentY });
    }
  };

  const handleCanvasMouseUp = () => {
    // Commit a completed node drag as a single undoable change.
    if (draggedNodeId && livePos) {
      updateNodeCoords(draggedNodeId, livePos.x, livePos.y);
    }
    setIsPanning(false);
    setDraggedNodeId(null);
    setLivePos(null);
    setDrawingConnection(null);
  };

  // Port node positioning calculations (dynamic offset tracking)
  const getPortCoords = (nodeId, portName) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return { x: 0, y: 0 };
    const el = nodeRefs.current[nodeId];
    const width = el ? el.offsetWidth : 200;
    const height = el ? el.offsetHeight : 120;
    return portCoordsFor(effectiveNode(node), portName, width, height);
  };

  const calculateOrthogonalPath = (fromId, fromPort, toId, toPort) => {
    const start = getPortCoords(fromId, fromPort);
    const end = getPortCoords(toId, toPort);
    return orthogonalPath(start, end, fromPort, toPort);
  };

  // Render variables
  const selectedDef = selectedNode ? elementDef(selectedNode.type) : null;
  const SelectedTypeIcon = selectedNode ? (TYPE_ICONS[selectedNode.type] || Box) : Box;

  return (
    <div className="app-container">
      {/* VS Code-style Activity Bar (left, full height) */}
      <nav className="activity-bar" aria-label="UML elements">
        <div className="activity-bar-top">
          {PALETTE_ITEMS.map((type) => {
            const def = elementDef(type);
            const Icon = TYPE_ICONS[type] || Box;
            return (
              <button
                key={type}
                className="activity-btn"
                onClick={() => addNode(type)}
                title={`Add ${def.label}`}
                aria-label={`Add ${def.label}`}
              >
                <Icon size={28} strokeWidth={1.5} />
              </button>
            );
          })}
        </div>
        <div className="activity-bar-bottom">
          <button className="activity-btn" title="Settings" aria-label="Settings">
            <Settings size={28} strokeWidth={1.5} />
          </button>
          <button className="activity-btn" title="Account" aria-label="Account">
            <UserCircle size={28} strokeWidth={1.5} />
          </button>
        </div>
      </nav>

      {/* Right side: toolbar on top, then workspace below */}
      <div className="main-column">
        {/* Top Toolbar */}
        <div className="toolbar">
          <div className="toolbar-group">
            <button className="btn-icon" onClick={handleNewProject} title="New Diagram">
              <File size={16} />
            </button>
            <button className="btn-icon" onClick={handleOpen} title="Open File (Cmd+O)">
              <FolderOpen size={16} />
            </button>
            <button className="btn-icon" onClick={handleSave} title="Save File (Cmd+S)">
              <Save size={16} />
            </button>
            <button className="btn-icon" onClick={handleSaveAs} title="Save File As">
              <Download size={16} />
            </button>

            <div className="toolbar-menu">
              <button
                className="btn-icon"
                onClick={() => setSampleMenuOpen((o) => !o)}
                title="Load Sample Diagram"
                aria-haspopup="menu"
                aria-expanded={sampleMenuOpen}
              >
                <Wand2 size={16} />
              </button>
              {sampleMenuOpen && (
                <>
                  <div className="menu-backdrop" onClick={() => setSampleMenuOpen(false)} />
                  <div className="dropdown-menu" role="menu">
                    <div className="dropdown-heading">Load Sample</div>
                    <button className="dropdown-item" role="menuitem" onClick={() => loadSample('initial')}>
                      Simple Sample
                    </button>
                    <button className="dropdown-item" role="menuitem" onClick={() => loadSample('compro')}>
                      Compro Schedule System
                    </button>
                    <button className="dropdown-item" role="menuitem" onClick={() => loadSample('hospital')}>
                      Hospital Management System
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="toolbar-group">
            <button
              className="btn-icon"
              onClick={undo}
              disabled={!canUndo}
              title="Undo (Cmd+Z)"
              style={!canUndo ? { opacity: 0.35, pointerEvents: 'none' } : undefined}
            >
              <Undo2 size={16} />
            </button>
            <button
              className="btn-icon"
              onClick={redo}
              disabled={!canRedo}
              title="Redo (Cmd+Shift+Z)"
              style={!canRedo ? { opacity: 0.35, pointerEvents: 'none' } : undefined}
            >
              <Redo2 size={16} />
            </button>

            <button className="btn-icon" onClick={() => setZoom(Math.max(0.5, zoom - 0.1))} title="Zoom Out">
              <ZoomOut size={16} />
            </button>
            <div className="zoom-indicator">{Math.round(zoom * 100)}%</div>
            <button className="btn-icon" onClick={() => setZoom(Math.min(2.0, zoom + 0.1))} title="Zoom In">
              <ZoomIn size={16} />
            </button>
            <button
              className="btn-icon"
              onClick={() => {
                setZoom(1.0);
                setPanX(100);
                setPanY(80);
              }}
              title="Reset View"
            >
              <Maximize2 size={16} />
            </button>
          </div>
        </div>

        {/* Workspace (canvas + right sidebar) */}
        <div className="editor-layout">

        {/* Canvas Panel */}
        <div
          className="canvas-container"
          ref={canvasRef}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onDoubleClick={(e) => {
            // Double click on canvas empty space spawns node
            if (e.target === canvasRef.current || e.target.tagName === 'rect') {
              addNode('class');
            }
          }}
        >
          <div
            className="canvas-workspace"
            style={{ transform: `translate(${panX}px, ${panY}px) scale(${zoom})` }}
          >
            {/* Background alignment grid */}
            <svg className="canvas-grid-svg" width="5000" height="5000">
              <defs>
                <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
                  <circle cx="2" cy="2" r="1" fill="#dbe0e6" />
                </pattern>
              </defs>
              <rect width="5000" height="5000" fill="url(#grid)" />
            </svg>

            {/* SVG Relationship Connector lines */}
            <svg className="connections-overlay">
              <ConnectorMarkers />

              {/* Draw established connection lines */}
              {connections.map((c) => {
                const pathStr = calculateOrthogonalPath(c.fromNodeId, c.fromPort, c.toNodeId, c.toPort);
                const isSelected = selectedConnectionId === c.id;
                const marks = resolveMarkers(c);
                const markerAttrs = {};
                if (marks.markerEndId) markerAttrs.markerEnd = `url(#${marks.markerEndId})`;
                if (marks.markerStartId) markerAttrs.markerStart = `url(#${marks.markerStartId})`;

                const startCoords = getPortCoords(c.fromNodeId, c.fromPort);
                const endCoords = getPortCoords(c.toNodeId, c.toPort);
                const midX = (startCoords.x + endCoords.x) / 2;
                const midY = (startCoords.y + endCoords.y) / 2;

                // Association class: dashed tie-line from the connector midpoint
                // to the linked class node's centre.
                let assocClassLine = null;
                if (c.associationClassId) {
                  const acCoords = getPortCoords(c.associationClassId, 'top');
                  if (acCoords) {
                    assocClassLine = `M ${midX} ${midY} L ${acCoords.x} ${acCoords.y}`;
                  }
                }

                // Label positions near the edges of connector lines
                const fromLabelOffset = {
                  x: c.fromPort === 'right' ? startCoords.x + 12 : c.fromPort === 'left' ? startCoords.x - 22 : startCoords.x + 8,
                  y: c.fromPort === 'bottom' ? startCoords.y + 16 : c.fromPort === 'top' ? startCoords.y - 8 : startCoords.y - 8
                };
                const toLabelOffset = {
                  x: c.toPort === 'right' ? endCoords.x + 12 : c.toPort === 'left' ? endCoords.x - 22 : endCoords.x + 8,
                  y: c.toPort === 'bottom' ? endCoords.y + 16 : c.toPort === 'top' ? endCoords.y - 8 : endCoords.y - 8
                };

                return (
                  <g key={c.id}>
                    {/* Association-class tie line (dashed) */}
                    {assocClassLine && (
                      <path d={assocClassLine} className="connection-line assoc-class-line" strokeDasharray="4,4" />
                    )}

                    {/* Invisible thicker line for easier clicks */}
                    <path
                      d={pathStr}
                      stroke="transparent"
                      strokeWidth="10"
                      fill="none"
                      style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedConnectionId(c.id);
                        setSelectedNodeId(null);
                      }}
                    />

                    {/* Visual line */}
                    <path
                      d={pathStr}
                      className={`connection-line ${isSelected ? 'selected' : ''}`}
                      strokeDasharray={marks.dashed ? '5,5' : 'none'}
                      {...markerAttrs}
                    />

                    {/* Association name at the midpoint */}
                    {c.label && (
                      <text x={midX} y={midY - 6} className="relationship-name" textAnchor="middle">
                        {c.label}
                      </text>
                    )}

                    {/* Multiplicities labels rendering */}
                    {c.multiplicityFrom && (
                      <text x={fromLabelOffset.x} y={fromLabelOffset.y} className="relationship-text">
                        {c.multiplicityFrom}
                      </text>
                    )}
                    {c.multiplicityTo && (
                      <text x={toLabelOffset.x} y={toLabelOffset.y} className="relationship-text">
                        {c.multiplicityTo}
                      </text>
                    )}

                    {/* Role names near each end */}
                    {c.roleFrom && (
                      <text x={fromLabelOffset.x} y={fromLabelOffset.y + 12} className="relationship-role">
                        {c.roleFrom}
                      </text>
                    )}
                    {c.roleTo && (
                      <text x={toLabelOffset.x} y={toLabelOffset.y + 12} className="relationship-role">
                        {c.roleTo}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Panning/drawing temporary connection lines */}
              {drawingConnection && (
                <path
                  d={`M ${drawingConnection.startX} ${drawingConnection.startY} L ${drawingConnection.currentX} ${drawingConnection.currentY}`}
                  className="connection-line drawing"
                />
              )}
            </svg>

            {/* Draggable UML Nodes */}
            {nodes.map((rawNode) => {
              const node = effectiveNode(rawNode);
              const isSelected = selectedNodeId === node.id;
              const def = elementDef(node.type);
              const TypeIcon = TYPE_ICONS[node.type] || Box;

              return (
                <div
                  key={node.id}
                  ref={(el) => {
                    nodeRefs.current[node.id] = el;
                  }}
                  className={`uml-node uml-node--${node.type || 'class'} ${isSelected ? 'selected' : ''}`}
                  style={{ left: `${node.x}px`, top: `${node.y}px` }}
                  onMouseDown={(e) => {
                    // Check if clicked port
                    if (e.target.classList.contains('port')) return;
                    e.stopPropagation();

                    setSelectedNodeId(node.id);
                    setSelectedConnectionId(null);

                    setDraggedNodeId(node.id);
                    const rect = e.currentTarget.getBoundingClientRect();
                    setDragOffset({
                      x: (e.clientX - rect.left) / zoom,
                      y: (e.clientY - rect.top) / zoom
                    });
                  }}
                >
                  {/* Connection ports handles */}
                  {['top', 'right', 'bottom', 'left'].map((portName) => (
                    <div
                      key={portName}
                      className={`port port-${portName}`}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        const coords = getPortCoords(node.id, portName);
                        setDrawingConnection({
                          fromNodeId: node.id,
                          fromPort: portName,
                          startX: coords.x,
                          startY: coords.y,
                          currentX: coords.x,
                          currentY: coords.y
                        });
                      }}
                      onMouseUp={(e) => {
                        e.stopPropagation();
                        if (drawingConnection && drawingConnection.fromNodeId !== node.id) {
                          const newConnection = {
                            id: `conn-${Date.now()}`,
                            fromNodeId: drawingConnection.fromNodeId,
                            fromPort: drawingConnection.fromPort,
                            toNodeId: node.id,
                            toPort: portName,
                            type: 'association',
                            multiplicityFrom: '1',
                            multiplicityTo: '1'
                          };
                          setConnections([...connections, newConnection]);
                          setSelectedConnectionId(newConnection.id);
                          setSelectedNodeId(null);
                        }
                        setDrawingConnection(null);
                      }}
                    />
                  ))}

                  {def.shape === 'class' ? (
                    <>
                      {/* Header: stereotype + element name */}
                      <div className="uml-node-header">
                        <NodeDeleteButton label={def.label} name={node.name} onDelete={() => deleteNode(node.id)} />
                        {(node.stereotype || def.stereotype) && (
                          <span className="uml-stereotype">«{node.stereotype || def.stereotype}»</span>
                        )}
                        <span className={`uml-node-name-row ${def.italicName ? 'is-italic' : ''}`}>
                          <TypeIcon size={13} strokeWidth={1.5} style={{ opacity: 0.7 }} />
                          <span>{node.name}</span>
                        </span>
                        {node.constraint && (
                          <span className="uml-node-constraint">{`{${node.constraint}}`}</span>
                        )}
                      </div>

                      {/* Attributes / enum-literals area */}
                      <div className="uml-node-section">
                        {node.attributes.length === 0 && (
                          <span className="uml-node-item" style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>
                            {def.isEnum ? 'No values' : 'No attributes'}
                          </span>
                        )}
                        {node.attributes.map((attr) => (
                          <div
                            key={attr.id}
                            className={`uml-node-item ${attr.isStatic ? 'uml-static' : ''}`}
                          >
                            {def.isEnum
                              ? attr.name
                              : `${attr.isDerived ? '/' : ''}${attr.visibility} ${attr.name}: ${attr.type}${
                                  attr.defaultValue ? ` = ${attr.defaultValue}` : ''
                                }${attr.property ? ` {${attr.property}}` : ''}`}
                          </div>
                        ))}
                      </div>

                      {/* Methods area (hidden for enumerations) */}
                      {def.hasMethods && (
                        <div className="uml-node-section">
                          {node.methods.length === 0 && (
                            <span className="uml-node-item" style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>
                              No methods
                            </span>
                          )}
                          {node.methods.map((meth) => (
                            <div
                              key={meth.id}
                              className={`uml-node-item ${meth.isStatic ? 'uml-static' : ''} ${
                                meth.isAbstract ? 'uml-abstract' : ''
                              }`}
                            >
                              {meth.visibility} {meth.name}({meth.parameters}): {meth.returnType}
                              {meth.property ? ` {${meth.property}}` : ''}
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : def.shape === 'note' ? (
                    <div className="uml-note">
                      <NodeDeleteButton label={def.label} name={node.name} onDelete={() => deleteNode(node.id)} />
                      <div className="uml-note-text">{node.text || 'Note…'}</div>
                    </div>
                  ) : def.shape === 'actor' ? (
                    <div className="uml-actor">
                      <NodeDeleteButton label={def.label} name={node.name} onDelete={() => deleteNode(node.id)} />
                      <svg className="uml-actor-figure" viewBox="0 0 40 64" width="40" height="64" aria-hidden="true">
                        <circle cx="20" cy="9" r="8" />
                        <line x1="20" y1="17" x2="20" y2="42" />
                        <line x1="4" y1="26" x2="36" y2="26" />
                        <line x1="20" y1="42" x2="6" y2="62" />
                        <line x1="20" y1="42" x2="34" y2="62" />
                      </svg>
                      <div className="uml-actor-name">{node.name}</div>
                    </div>
                  ) : (
                    <div className="uml-usecase">
                      <NodeDeleteButton label={def.label} name={node.name} onDelete={() => deleteNode(node.id)} />
                      <span className="uml-usecase-name">{node.name}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Sidebar Configuration Panel */}
        <div className="sidebar">
          {/* Section: Properties */}
          {selectedNode ? (
            <div className="sidebar-section">
              <div className="sidebar-title">
                <SelectedTypeIcon size={16} strokeWidth={2} /> Edit {selectedDef.label}
              </div>

              <div className="property-group">
                <label className="property-label">Element Type</label>
                <select
                  value={selectedNode.type || 'class'}
                  onChange={(e) => updateNodeType(selectedNode.id, e.target.value)}
                >
                  {PALETTE_ITEMS.map((t) => (
                    <option key={t} value={t}>
                      {elementDef(t).label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="property-group">
                <label className="property-label">{selectedDef.label} Name</label>
                <input
                  type="text"
                  value={editingName}
                  style={nameError ? { border: '1px solid #ef4444' } : {}}
                  onChange={(e) => handleNameChange(e.target.value)}
                />
                {nameError && (
                  <span style={{ color: '#ef4444', fontSize: '10px', fontWeight: 'bold', marginTop: '4px' }}>
                    {nameError}
                  </span>
                )}
              </div>

              {selectedDef.shape === 'note' && (
                <div className="property-group">
                  <label className="property-label">Note Text</label>
                  <textarea
                    className="note-text-input"
                    rows={4}
                    value={selectedNode.text || ''}
                    onChange={(e) => updateNodeText(selectedNode.id, e.target.value)}
                    placeholder="Enter note text…"
                  />
                </div>
              )}

              {selectedDef.shape === 'class' && (
                <div className="property-group">
                  <div className="property-row">
                    <div style={{ flex: 1 }}>
                      <label className="property-label">Stereotype</label>
                      <input
                        type="text"
                        placeholder={selectedDef.stereotype || 'e.g. entity'}
                        value={selectedNode.stereotype || ''}
                        onChange={(e) => updateNodeFields(selectedNode.id, { stereotype: e.target.value })}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label className="property-label">Constraint</label>
                      <input
                        type="text"
                        placeholder="e.g. abstract"
                        value={selectedNode.constraint || ''}
                        onChange={(e) => updateNodeFields(selectedNode.id, { constraint: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="property-group">
                <div className="property-row">
                  <div style={{ flex: 1 }}>
                    <label className="property-label">Position X</label>
                    <input type="text" disabled value={selectedNode.x} style={{ opacity: 0.7, fontFamily: 'var(--font-mono)' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="property-label">Position Y</label>
                    <input type="text" disabled value={selectedNode.y} style={{ opacity: 0.7, fontFamily: 'var(--font-mono)' }} />
                  </div>
                </div>
                <div className="property-label" style={{ fontSize: '10px', marginTop: '4px', color: 'var(--text-dim)' }}>
                  (Draggable, snapped to 8px coordinates)
                </div>
              </div>

              {/* Attributes / Enum values Section (class-family only) */}
              {selectedDef.shape === 'class' && (
                <div className="property-group" style={{ marginTop: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className="property-label">{selectedDef.isEnum ? 'Values' : 'Attributes'}</label>
                    <button className="btn-small" onClick={() => addAttribute(selectedNode.id)}>
                      + Add
                    </button>
                  </div>

                  <div className="item-list">
                    {selectedNode.attributes.map((attr) => (
                      <div key={attr.id} className="item-block">
                        <div className="item-list-row">
                          {!selectedDef.isEnum && (
                            <select
                              style={{ width: '40px' }}
                              value={attr.visibility}
                              onChange={(e) => updateAttribute(selectedNode.id, attr.id, { visibility: e.target.value })}
                            >
                              <option value="+">+</option>
                              <option value="-">-</option>
                              <option value="#">#</option>
                              <option value="~">~</option>
                            </select>
                          )}
                          <input
                            type="text"
                            placeholder={selectedDef.isEnum ? 'VALUE' : 'name'}
                            value={attr.name}
                            onChange={(e) => updateAttribute(selectedNode.id, attr.id, { name: e.target.value })}
                          />
                          {!selectedDef.isEnum && (
                            <input
                              type="text"
                              placeholder="type"
                              style={{ width: '70px' }}
                              value={attr.type}
                              onChange={(e) => updateAttribute(selectedNode.id, attr.id, { type: e.target.value })}
                            />
                          )}
                          <button
                            className="btn-danger btn-small"
                            style={{ padding: '0 8px', height: '28px' }}
                            onClick={() => removeAttribute(selectedNode.id, attr.id)}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>

                        {!selectedDef.isEnum && (
                          <div className="item-list-row item-sub">
                            <label className="mini-toggle" title="Static member (underlined)">
                              <input
                                type="checkbox"
                                checked={!!attr.isStatic}
                                onChange={(e) => updateAttribute(selectedNode.id, attr.id, { isStatic: e.target.checked })}
                              />
                              static
                            </label>
                            <label className="mini-toggle" title="Derived attribute (/ prefix)">
                              <input
                                type="checkbox"
                                checked={!!attr.isDerived}
                                onChange={(e) => updateAttribute(selectedNode.id, attr.id, { isDerived: e.target.checked })}
                              />
                              derived
                            </label>
                            <input
                              type="text"
                              placeholder="= default"
                              style={{ width: '72px' }}
                              value={attr.defaultValue || ''}
                              onChange={(e) => updateAttribute(selectedNode.id, attr.id, { defaultValue: e.target.value })}
                            />
                            <input
                              type="text"
                              placeholder="{property}"
                              value={attr.property || ''}
                              onChange={(e) => updateAttribute(selectedNode.id, attr.id, { property: e.target.value })}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Methods Section (hidden for enumerations) */}
              {selectedDef.hasMethods && (
                <div className="property-group" style={{ marginTop: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className="property-label">Methods</label>
                    <button className="btn-small" onClick={() => addMethod(selectedNode.id)}>
                      + Add
                    </button>
                  </div>

                  <div className="item-list">
                    {selectedNode.methods.map((meth) => (
                      <div key={meth.id} className="item-block" style={{ gap: '4px' }}>
                        <div style={{ display: 'flex', width: '100%', gap: '4px' }}>
                          <select
                            style={{ width: '40px' }}
                            value={meth.visibility}
                            onChange={(e) => updateMethod(selectedNode.id, meth.id, { visibility: e.target.value })}
                          >
                            <option value="+">+</option>
                            <option value="-">-</option>
                            <option value="#">#</option>
                            <option value="~">~</option>
                          </select>
                          <input
                            type="text"
                            placeholder="methodName"
                            value={meth.name}
                            onChange={(e) => updateMethod(selectedNode.id, meth.id, { name: e.target.value })}
                          />
                        </div>
                        <div style={{ display: 'flex', width: '100%', gap: '4px' }}>
                          <input
                            type="text"
                            placeholder="params"
                            value={meth.parameters}
                            onChange={(e) => updateMethod(selectedNode.id, meth.id, { parameters: e.target.value })}
                          />
                          <input
                            type="text"
                            placeholder="return"
                            style={{ width: '70px' }}
                            value={meth.returnType}
                            onChange={(e) => updateMethod(selectedNode.id, meth.id, { returnType: e.target.value })}
                          />
                          <button
                            className="btn-danger btn-small"
                            style={{ padding: '0 8px', height: '28px' }}
                            onClick={() => removeMethod(selectedNode.id, meth.id)}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                        <div className="item-list-row item-sub" style={{ width: '100%' }}>
                          <label className="mini-toggle" title="Static operation (underlined)">
                            <input
                              type="checkbox"
                              checked={!!meth.isStatic}
                              onChange={(e) => updateMethod(selectedNode.id, meth.id, { isStatic: e.target.checked })}
                            />
                            static
                          </label>
                          <label className="mini-toggle" title="Abstract operation (italic)">
                            <input
                              type="checkbox"
                              checked={!!meth.isAbstract}
                              onChange={(e) => updateMethod(selectedNode.id, meth.id, { isAbstract: e.target.checked })}
                            />
                            abstract
                          </label>
                          <input
                            type="text"
                            placeholder="{property}"
                            value={meth.property || ''}
                            onChange={(e) => updateMethod(selectedNode.id, meth.id, { property: e.target.value })}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : selectedConnection ? (
            <div className="sidebar-section">
              <div className="sidebar-title">
                <GitBranch size={16} strokeWidth={2} /> Edit Relationship
              </div>

              <div className="property-group">
                <label className="property-label">Relationship Type</label>
                <select
                  value={selectedConnection.type}
                  onChange={(e) => updateConnection(selectedConnection.id, { type: e.target.value })}
                >
                  {RELATIONSHIP_ORDER.map((t) => (
                    <option key={t} value={t}>
                      {RELATIONSHIP_TYPES[t].label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="property-group">
                <button
                  className="btn-line"
                  onClick={() => reverseConnection(selectedConnection.id)}
                  title="Swap the source and target ends of this relationship"
                >
                  <ArrowLeftRight size={14} /> Reverse direction
                </button>
              </div>

              <div className="property-group">
                <label className="property-label">Association Name</label>
                <input
                  type="text"
                  placeholder="e.g. enrolls in ▸"
                  value={selectedConnection.label || ''}
                  onChange={(e) => updateConnection(selectedConnection.id, { label: e.target.value })}
                />
              </div>

              {RELATIONSHIP_TYPES[selectedConnection.type]?.navigable && (
                <div className="property-group">
                  <div className="property-row">
                    <div style={{ flex: 1 }}>
                      <label className="property-label">Source End</label>
                      <select
                        value={selectedConnection.startArrow || 'none'}
                        onChange={(e) => updateConnection(selectedConnection.id, { startArrow: e.target.value })}
                      >
                        {NAVIGABILITY_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <label className="property-label">Target End</label>
                      <select
                        value={selectedConnection.endArrow || 'none'}
                        onChange={(e) => updateConnection(selectedConnection.id, { endArrow: e.target.value })}
                      >
                        {NAVIGABILITY_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              <div className="property-group">
                <div className="property-row">
                  <div style={{ flex: 1 }}>
                    <label className="property-label">Source Role</label>
                    <input
                      type="text"
                      placeholder="e.g. owner"
                      value={selectedConnection.roleFrom || ''}
                      onChange={(e) => updateConnection(selectedConnection.id, { roleFrom: e.target.value })}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="property-label">Target Role</label>
                    <input
                      type="text"
                      placeholder="e.g. items"
                      value={selectedConnection.roleTo || ''}
                      onChange={(e) => updateConnection(selectedConnection.id, { roleTo: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="property-group">
                <label className="property-label">Source Multiplicity</label>
                <select
                  value={selectedConnection.multiplicityFrom || ''}
                  onChange={(e) => updateConnection(selectedConnection.id, { multiplicityFrom: e.target.value })}
                >
                  {multiplicityOptionsFor(selectedConnection.multiplicityFrom || '').map((o) => (
                    <option key={o.value || 'none'} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="property-group">
                <label className="property-label">Target Multiplicity</label>
                <select
                  value={selectedConnection.multiplicityTo || ''}
                  onChange={(e) => updateConnection(selectedConnection.id, { multiplicityTo: e.target.value })}
                >
                  {multiplicityOptionsFor(selectedConnection.multiplicityTo || '').map((o) => (
                    <option key={o.value || 'none'} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              {selectedConnection.type === 'association' && (
                <div className="property-group">
                  <label className="property-label">Association Class</label>
                  <select
                    value={selectedConnection.associationClassId || ''}
                    onChange={(e) =>
                      updateConnection(selectedConnection.id, {
                        associationClassId: e.target.value || null
                      })
                    }
                  >
                    <option value="">None</option>
                    {nodes
                      .filter(
                        (n) =>
                          elementDef(n.type).shape === 'class' &&
                          n.id !== selectedConnection.fromNodeId &&
                          n.id !== selectedConnection.toNodeId
                      )
                      .map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.name}
                        </option>
                      ))}
                  </select>
                  <div className="property-label" style={{ fontSize: '10px', marginTop: '4px', color: 'var(--text-dim)' }}>
                    Links a class to this association with a dashed tie-line.
                  </div>
                </div>
              )}

              {/* Info tips */}
              <div className="help-card" style={{ marginTop: '16px' }}>
                <div className="help-title" style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Database size={12} /> Multiplicity guidelines
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
                  Standard multiplicities restrict counts: "1" (exactly one), "*" (many), "0..*" (zero or more), "1..*" (one or more).
                </div>
              </div>

              {/* Connection deletion */}
              <button
                className="btn-danger"
                style={{ width: '100%', marginTop: '32px', gap: '8px' }}
                onClick={() => deleteConnection(selectedConnection.id)}
              >
                <Trash2 size={16} /> Delete Relationship
              </button>
            </div>
          ) : (
            <div className="sidebar-section">
              <div className="sidebar-title">
                <Layers size={16} strokeWidth={2} /> Global Overview
              </div>

              <div className="help-card">
                <div className="help-title" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <BookOpen size={13} /> Modeling stats
                </div>
                <ul className="help-list" style={{ marginTop: '8px' }}>
                  <li>
                    Classes: <span className="help-key">{nodes.length}</span>
                  </li>
                  <li>
                    Relationships: <span className="help-key">{connections.length}</span>
                  </li>
                  <li>
                    File: <span style={{ fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>{filePath || 'unsaved'}</span>
                  </li>
                </ul>
              </div>

              <ShortcutHelp />

              <div className="help-card">
                <div className="help-title">
                  <Link2 size={14} strokeWidth={2} /> Connecting Nodes
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '140%' }}>
                  Hover over any Class card to reveal the 4 connection ports (top, bottom, left, right). Click and drag from one port to another port to draw relationship associations.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
