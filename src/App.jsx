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
import { portCoordsFor, orthogonalPath, getElbowMidpoint, snapTo8, getFitDimensions, calculateConnectionPathWithJumps } from './model/geometry';
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
    nodes: [],
    connections: []
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

  const [selectedNodeIds, setSelectedNodeIds] = useState([]);
  const selectedNodeId = selectedNodeIds.length === 1 ? selectedNodeIds[0] : null;
  const setSelectedNodeId = useCallback((id) => setSelectedNodeIds(id ? [id] : []), []);
  const [selectedConnectionId, setSelectedConnectionId] = useState(null);

  const [zoom, setZoom] = useState(1.0);
  const [panX, setPanX] = useState(100);
  const [panY, setPanY] = useState(80);
  const [filePath, setFilePath] = useState(null);

  // Dragging states
  const [draggedNodeId, setDraggedNodeId] = useState(null); // ID of the node clicked to start drag
  const [dragStartMouse, setDragStartMouse] = useState(null); // { x, y } mouse canvas pos on drag start
  const [dragStartNodes, setDragStartNodes] = useState([]); // [{ id, x, y }] original nodes coords
  const [draggedNodesDelta, setDraggedNodesDelta] = useState({ dx: 0, dy: 0 }); // live delta relative to start
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  const [drawingConnection, setDrawingConnection] = useState(null);

  // Dragging a connector handle (endpoint or midpoint)
  // { connId, handleType: 'start'|'end'|'mid', startMouseX, startMouseY, origValue }
  const [draggingHandle, setDraggingHandle] = useState(null);

  // Active placement tool — when set, next canvas click places that element type.
  const [activeTool, setActiveTool] = useState(null);

  // Inline name editing — double-click a node name on the canvas to edit
  const [inlineEditId, setInlineEditId] = useState(null);

  // Inline attribute/method list item editing — double-click an item inside a node to edit
  const [inlineAttrEdit, setInlineAttrEdit] = useState(null); // { nodeId, attrId }
  const [inlineMethEdit, setInlineMethEdit] = useState(null); // { nodeId, methId }

  // Drawing state — user drags to define element size
  const [drawing, setDrawing] = useState(null); // { startX, startY, currentX, currentY }

  // Resizing state — user drags a handle to resize a node
  const [resizing, setResizing] = useState(null); // { nodeId, handle, startX, startY, origX, origY, origW, origH }

  // Lasso select state — user drags on empty space to select multiple elements
  const [lasso, setLasso] = useState(null); // { startX, startY, currentX, currentY }

  // Document-level resize handler (bypasses React event delegation issues)
  useEffect(() => {
    if (!resizing) return;
    const onMove = (e) => {
      const dx = (e.clientX - resizing.startX) / zoom;
      const dy = (e.clientY - resizing.startY) / zoom;
      const handle = resizing.handle;
      let newX = resizing.origX;
      let newY = resizing.origY;
      let newW = resizing.origW;
      let newH = resizing.origH;

      if (handle.includes('right')) newW = Math.max(60, resizing.origW + dx);
      if (handle.includes('bottom')) newH = Math.max(40, resizing.origH + dy);
      if (handle.includes('left')) {
        newW = Math.max(60, resizing.origW - dx);
        newX = resizing.origX + (resizing.origW - newW);
      }
      if (handle.includes('top')) {
        newH = Math.max(40, resizing.origH - dy);
        newY = resizing.origY + (resizing.origH - newH);
      }

      setNodes((prev) =>
        prev.map((n) =>
          n.id === resizing.nodeId
            ? { ...n, x: snapTo8(newX), y: snapTo8(newY), width: snapTo8(newW), height: snapTo8(newH) }
            : n
        )
      );
    };
    const onUp = () => setResizing(null);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [resizing, zoom, setNodes]);

  // Document-level handler for dragging connector handles (endpoints/midpoints)
  const connectionsRef = useRef(connections);
  connectionsRef.current = connections;
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  const draggingHandleRef = useRef(draggingHandle);
  useEffect(() => { draggingHandleRef.current = draggingHandle; }, [draggingHandle]);

  useEffect(() => {
    if (!draggingHandle) return;
    const onMove = (e) => {
      const dh = draggingHandleRef.current;
      if (!dh) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const cursorX = (e.clientX - rect.left - panX) / zoom;
      const cursorY = (e.clientY - rect.top - panY) / zoom;

      if (dh.handleType === 'mid') {
        const axis = dh.axis;
        const newVal = axis === 'x' ? cursorX : cursorY;
        updateConnection(dh.connId, { midOffset: snapTo8(newVal) });
      } else if (dh.handleType === 'start' || dh.handleType === 'end') {
        setDraggingHandle((prev) => ({ ...prev, cursorX, cursorY }));
      }
    };
    const onUp = (e) => {
      const dh = draggingHandleRef.current;
      if (!dh) return;
      if (dh.handleType === 'start' || dh.handleType === 'end') {
        const rect = canvasRef.current.getBoundingClientRect();
        const cursorX = (e.clientX - rect.left - panX) / zoom;
        const cursorY = (e.clientY - rect.top - panY) / zoom;
        const conn = connectionsRef.current.find((c) => c.id === dh.connId);
        if (conn) {
          const otherNodeId = dh.handleType === 'start' ? conn.toNodeId : conn.fromNodeId;
          let bestNode = null;
          let bestPort = null;
          let bestDist = Infinity;
          for (const n of nodesRef.current) {
            const el = nodeRefs.current[n.id];
            if (!el) continue;
            const w = el.offsetWidth;
            const h = el.offsetHeight;
            const pad = 20;
            if (cursorX >= n.x - pad && cursorX <= n.x + w + pad &&
                cursorY >= n.y - pad && cursorY <= n.y + h + pad) {
              for (const p of ['top', 'right', 'bottom', 'left']) {
                const coords = portCoordsFor(n, p, w, h);
                const dist = Math.hypot(cursorX - coords.x, cursorY - coords.y);
                if (dist < bestDist) {
                  bestDist = dist;
                  bestNode = n;
                  bestPort = p;
                }
              }
            }
          }
          if (bestNode && bestNode.id !== otherNodeId) {
            const update = dh.handleType === 'start'
              ? { fromNodeId: bestNode.id, fromPort: bestPort, midOffset: undefined }
              : { toNodeId: bestNode.id, toPort: bestPort, midOffset: undefined };
            updateConnection(conn.id, update);
          }
        }
      }
      setDraggingHandle(null);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    // Only re-register when dragging starts/stops (boolean), not on every cursor update
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!draggingHandle, zoom, panX, panY]);

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
  }, [selectedNodeId, nodes, selectedNode]);

  const canvasRef = useRef(null);
  const nodeRefs = useRef({});

  // Effective coordinates for a node: the in-flight drag position wins.
  const effectiveNode = useCallback(
    (node) => {
      if (draggedNodeId && dragStartNodes && dragStartNodes.length > 0) {
        const startNode = dragStartNodes.find((dn) => dn.id === node.id);
        if (startNode) {
          return {
            ...node,
            x: startNode.x + (draggedNodesDelta?.dx || 0),
            y: startNode.y + (draggedNodesDelta?.dy || 0)
          };
        }
      }
      return node;
    },
    [draggedNodeId, dragStartNodes, draggedNodesDelta]
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
      setSelectedNodeIds((cur) => cur.filter((id) => id !== nodeId));
    },
    [setDoc]
  );

  const deleteSelectedNodes = useCallback(() => {
    if (selectedNodeIds.length === 0) return;
    setDoc((prev) => ({
      nodes: prev.nodes.filter((n) => !selectedNodeIds.includes(n.id)),
      connections: prev.connections.filter(
        (c) => !selectedNodeIds.includes(c.fromNodeId) && !selectedNodeIds.includes(c.toNodeId)
      )
    }));
    setSelectedNodeIds([]);
  }, [selectedNodeIds, setDoc]);

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

      // Delete key or Backspace key removes selected nodes or connection
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNodeIds.length > 0) {
          deleteSelectedNodes();
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

      // Cmd/Ctrl + N to add a new class
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        addNode('class');
      }

      // Arrow keys nudging for selected nodes
      if (selectedNodeIds.length > 0) {
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setNodes((prev) =>
            prev.map((n) => (selectedNodeIds.includes(n.id) ? { ...n, y: snapTo8(n.y - 8) } : n))
          );
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          setNodes((prev) =>
            prev.map((n) => (selectedNodeIds.includes(n.id) ? { ...n, y: snapTo8(n.y + 8) } : n))
          );
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          setNodes((prev) =>
            prev.map((n) => (selectedNodeIds.includes(n.id) ? { ...n, x: snapTo8(n.x - 8) } : n))
          );
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          setNodes((prev) =>
            prev.map((n) => (selectedNodeIds.includes(n.id) ? { ...n, x: snapTo8(n.x + 8) } : n))
          );
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeIds, selectedConnectionId, nodes, connections, filePath, undo, redo, deleteSelectedNodes]);

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
          } catch {
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

  const addNode = (type = 'class', position, size) => {
    const def = elementDef(type);

    // Place at given position or fall back to viewport-relative default
    const x = position ? snapTo8(position.x) : snapTo8(Math.max(80, -panX + 200));
    const y = position ? snapTo8(position.y) : snapTo8(Math.max(80, -panY + 150));

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
      ...(size && size.width > 60 ? { width: snapTo8(size.width) } : {}),
      ...(size && size.height > 40 ? { height: snapTo8(size.height) } : {}),
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

  const handleFitContent = (nodeId) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const def = elementDef(node.type);
    const { width, height } = getFitDimensions(node, def);
    setNodes((prev) =>
      prev.map((n) => (n.id === nodeId ? { ...n, width, height } : n))
    );
  };

  const handleAlign = (type) => {
    if (selectedNodeIds.length <= 1) return;
    const activeNodes = nodes.filter((n) => selectedNodeIds.includes(n.id));

    if (type === 'left') {
      const minX = Math.min(...activeNodes.map((n) => n.x));
      setNodes((prev) =>
        prev.map((n) => (selectedNodeIds.includes(n.id) ? { ...n, x: minX } : n))
      );
    } else if (type === 'right') {
      const maxR = Math.max(...activeNodes.map((n) => {
        const el = nodeRefs.current[n.id];
        return n.x + (el ? el.offsetWidth : 160);
      }));
      setNodes((prev) =>
        prev.map((n) => {
          if (!selectedNodeIds.includes(n.id)) return n;
          const el = nodeRefs.current[n.id];
          const w = el ? el.offsetWidth : 160;
          return { ...n, x: snapTo8(maxR - w) };
        })
      );
    } else if (type === 'centerX') {
      const centers = activeNodes.map((n) => {
        const el = nodeRefs.current[n.id];
        return n.x + (el ? el.offsetWidth : 160) / 2;
      });
      const avgCenter = snapTo8(centers.reduce((sum, c) => sum + c, 0) / centers.length);
      setNodes((prev) =>
        prev.map((n) => {
          if (!selectedNodeIds.includes(n.id)) return n;
          const el = nodeRefs.current[n.id];
          const w = el ? el.offsetWidth : 160;
          return { ...n, x: snapTo8(avgCenter - w / 2) };
        })
      );
    } else if (type === 'top') {
      const minY = Math.min(...activeNodes.map((n) => n.y));
      setNodes((prev) =>
        prev.map((n) => (selectedNodeIds.includes(n.id) ? { ...n, y: minY } : n))
      );
    } else if (type === 'bottom') {
      const maxB = Math.max(...activeNodes.map((n) => {
        const el = nodeRefs.current[n.id];
        return n.y + (el ? el.offsetHeight : 100);
      }));
      setNodes((prev) =>
        prev.map((n) => {
          if (!selectedNodeIds.includes(n.id)) return n;
          const el = nodeRefs.current[n.id];
          const h = el ? el.offsetHeight : 100;
          return { ...n, y: snapTo8(maxB - h) };
        })
      );
    } else if (type === 'centerY') {
      const centers = activeNodes.map((n) => {
        const el = nodeRefs.current[n.id];
        return n.y + (el ? el.offsetHeight : 100) / 2;
      });
      const avgCenter = snapTo8(centers.reduce((sum, c) => sum + c, 0) / centers.length);
      setNodes((prev) =>
        prev.map((n) => {
          if (!selectedNodeIds.includes(n.id)) return n;
          const el = nodeRefs.current[n.id];
          const h = el ? el.offsetHeight : 100;
          return { ...n, y: snapTo8(avgCenter - h / 2) };
        })
      );
    }
  };

  const handleDistribute = (type) => {
    if (selectedNodeIds.length <= 2) return;
    const activeNodes = [...nodes.filter((n) => selectedNodeIds.includes(n.id))];

    if (type === 'horizontal') {
      activeNodes.sort((a, b) => a.x - b.x);
      const minX = activeNodes[0].x;
      const maxX = activeNodes[activeNodes.length - 1].x;
      const span = maxX - minX;
      const step = span / (activeNodes.length - 1);
      setNodes((prev) =>
        prev.map((n) => {
          const idx = activeNodes.findIndex((an) => an.id === n.id);
          if (idx === -1) return n;
          return { ...n, x: snapTo8(minX + idx * step) };
        })
      );
    } else if (type === 'vertical') {
      activeNodes.sort((a, b) => a.y - b.y);
      const minY = activeNodes[0].y;
      const maxY = activeNodes[activeNodes.length - 1].y;
      const span = maxY - minY;
      const step = span / (activeNodes.length - 1);
      setNodes((prev) =>
        prev.map((n) => {
          const idx = activeNodes.findIndex((an) => an.id === n.id);
          if (idx === -1) return n;
          return { ...n, y: snapTo8(minY + idx * step) };
        })
      );
    }
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

  const handleInlineAttributeSubmit = (nodeId, attrId, textValue) => {
    const raw = textValue.trim();
    if (!raw) {
      removeAttribute(nodeId, attrId);
      setInlineAttrEdit(null);
      return;
    }

    const regex = /^([+\-#~]?)\s*(\/?)\s*([a-zA-Z_0-9\-\*]*)\s*(?::\s*([^=]*))?(?:\s*=\s*(.*))?$/;
    const match = raw.match(regex);
    if (match) {
      const visibility = match[1] || '+';
      const isDerived = match[2] === '/';
      let name = match[3] || 'newAttribute';
      let rest = match[4] || 'String';
      let defaultValue = match[5] || '';

      let property = '';
      const propMatch = rest.match(/\{([^}]+)\}/);
      if (propMatch) {
        property = propMatch[1];
        rest = rest.replace(/\{[^}]+\}/, '').trim();
      } else {
        const propMatchDef = defaultValue.match(/\{([^}]+)\}/);
        if (propMatchDef) {
          property = propMatchDef[1];
          defaultValue = defaultValue.replace(/\{[^}]+\}/, '').trim();
        }
      }

      updateAttribute(nodeId, attrId, {
        visibility,
        isDerived,
        name: name.trim(),
        type: rest.trim(),
        defaultValue: defaultValue.trim(),
        property: property.trim()
      });
    }
    setInlineAttrEdit(null);
  };

  const handleInlineMethodSubmit = (nodeId, methId, textValue) => {
    const raw = textValue.trim();
    if (!raw) {
      removeMethod(nodeId, methId);
      setInlineMethEdit(null);
      return;
    }

    const regex = /^([+\-#~]?)\s*([a-zA-Z_0-9\-]*)\s*(?:\(([^)]*)\))?\s*(?::\s*(.*))?$/;
    const match = raw.match(regex);
    if (match) {
      const visibility = match[1] || '+';
      const name = match[2] || 'newMethod';
      let parameters = match[3] || '';
      let returnType = match[4] || 'void';

      let property = '';
      const propMatch = returnType.match(/\{([^}]+)\}/);
      if (propMatch) {
        property = propMatch[1];
        returnType = returnType.replace(/\{[^}]+\}/, '').trim();
      }

      updateMethod(nodeId, methId, {
        visibility,
        name: name.trim(),
        parameters: parameters.trim(),
        returnType: returnType.trim(),
        property: property.trim()
      });
    }
    setInlineMethEdit(null);
  };

  const updateConnection = (connId, fields) => {
    setConnections((prev) => prev.map((c) => (c.id === connId ? { ...c, ...fields } : c)));
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
    // If user clicked standard elements/ports/connectors, ignore canvas panning
    if (
      e.target.closest('.uml-node') ||
      e.target.closest('.port') ||
      e.target.closest('button') ||
      e.target.closest('.sidebar') ||
      e.target.closest('.connector-handle') ||
      (e.target.tagName === 'path' && e.target.getAttribute('stroke') === 'transparent')
    ) {
      return;
    }

    // Start drawing a new element when a tool is active
    if (activeTool) {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left - panX) / zoom;
      const y = (e.clientY - rect.top - panY) / zoom;
      setDrawing({ startX: x, startY: y, currentX: x, currentY: y });
      return;
    }

    // Lasso selection on Shift + drag
    if (e.shiftKey) {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left - panX) / zoom;
      const y = (e.clientY - rect.top - panY) / zoom;
      setLasso({ startX: x, startY: y, currentX: x, currentY: y });
      return;
    }

    setIsPanning(true);
    setPanStart({ x: e.clientX - panX, y: e.clientY - panY });
  };

  const handleCanvasMouseMove = (e) => {
    if (resizing) return; // Handled by document-level listener
    if (draggingHandle) return; // Handled by document-level listener
    if (drawing) {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left - panX) / zoom;
      const y = (e.clientY - rect.top - panY) / zoom;
      setDrawing((d) => ({ ...d, currentX: x, currentY: y }));
    } else if (lasso) {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left - panX) / zoom;
      const y = (e.clientY - rect.top - panY) / zoom;
      setLasso((l) => ({ ...l, currentX: x, currentY: y }));
    } else if (isPanning) {
      setPanX(e.clientX - panStart.x);
      setPanY(e.clientY - panStart.y);
    } else if (draggedNodeId && dragStartMouse) {
      const rect = canvasRef.current.getBoundingClientRect();
      const currentMouseX = (e.clientX - rect.left - panX) / zoom;
      const currentMouseY = (e.clientY - rect.top - panY) / zoom;

      const dx = currentMouseX - dragStartMouse.x;
      const dy = currentMouseY - dragStartMouse.y;

      // Smart alignment guides calculations
      const draggedNodeIds = dragStartNodes.map((dn) => dn.id);
      const otherNodes = nodes.filter((n) => !draggedNodeIds.includes(n.id));

      const guideLines = [];
      let snapX = null;
      let snapY = null;
      const SNAP_THRESHOLD = 5;

      for (const dn of dragStartNodes) {
        const el = nodeRefs.current[dn.id];
        const w = el ? el.offsetWidth : 160;
        const h = el ? el.offsetHeight : 100;

        const currentL = dn.x + dx;
        const currentR = currentL + w;
        const currentC = currentL + w / 2;

        for (const target of otherNodes) {
          const tEl = nodeRefs.current[target.id];
          const tW = tEl ? tEl.offsetWidth : 160;
          const tH = tEl ? tEl.offsetHeight : 100;

          const targetL = target.x;
          const targetR = target.x + tW;
          const targetC = target.x + tW / 2;

          if (Math.abs(currentL - targetL) < SNAP_THRESHOLD) {
            snapX = targetL - dn.x;
            guideLines.push({ type: 'v', val: targetL });
          } else if (Math.abs(currentL - targetR) < SNAP_THRESHOLD) {
            snapX = targetR - dn.x;
            guideLines.push({ type: 'v', val: targetR });
          } else if (Math.abs(currentL - targetC) < SNAP_THRESHOLD) {
            snapX = targetC - dn.x;
            guideLines.push({ type: 'v', val: targetC });
          }

          if (Math.abs(currentR - targetL) < SNAP_THRESHOLD) {
            snapX = targetL - w - dn.x;
            guideLines.push({ type: 'v', val: targetL });
          } else if (Math.abs(currentR - targetR) < SNAP_THRESHOLD) {
            snapX = targetR - w - dn.x;
            guideLines.push({ type: 'v', val: targetR });
          }

          if (Math.abs(currentC - targetC) < SNAP_THRESHOLD) {
            snapX = targetC - w / 2 - dn.x;
            guideLines.push({ type: 'v', val: targetC });
          }
        }
      }

      for (const dn of dragStartNodes) {
        const el = nodeRefs.current[dn.id];
        const w = el ? el.offsetWidth : 160;
        const h = el ? el.offsetHeight : 100;

        const currentT = dn.y + dy;
        const currentB = currentT + h;
        const currentC = currentT + h / 2;

        for (const target of otherNodes) {
          const tEl = nodeRefs.current[target.id];
          const tW = tEl ? tEl.offsetWidth : 160;
          const tH = tEl ? tEl.offsetHeight : 100;

          const targetT = target.y;
          const targetB = target.y + tH;
          const targetC = target.y + tH / 2;

          if (Math.abs(currentT - targetT) < SNAP_THRESHOLD) {
            snapY = targetT - dn.y;
            guideLines.push({ type: 'h', val: targetT });
          } else if (Math.abs(currentT - targetB) < SNAP_THRESHOLD) {
            snapY = targetB - dn.y;
            guideLines.push({ type: 'h', val: targetB });
          }

          if (Math.abs(currentB - targetT) < SNAP_THRESHOLD) {
            snapY = targetT - h - dn.y;
            guideLines.push({ type: 'h', val: targetT });
          } else if (Math.abs(currentB - targetB) < SNAP_THRESHOLD) {
            snapY = targetB - h - dn.y;
            guideLines.push({ type: 'h', val: targetB });
          }

          if (Math.abs(currentC - targetC) < SNAP_THRESHOLD) {
            snapY = targetC - h / 2 - dn.y;
            guideLines.push({ type: 'h', val: targetC });
          }
        }
      }

      const finalDx = snapX !== null ? snapX : snapTo8(dx);
      const finalDy = snapY !== null ? snapY : snapTo8(dy);

      setDraggedNodesDelta({ dx: finalDx, dy: finalDy });
      setActiveGuidelines(
        guideLines.filter((v, i, self) => self.findIndex((t) => t.type === v.type && t.val === v.val) === i)
      );
    } else if (drawingConnection) {
      // Dynamic connection drawing preview
      const rect = canvasRef.current.getBoundingClientRect();
      const currentX = (e.clientX - rect.left - panX) / zoom;
      const currentY = (e.clientY - rect.top - panY) / zoom;
      setDrawingConnection({ ...drawingConnection, currentX, currentY });
    }
  };

  const handleCanvasMouseUp = () => {
    if (resizing) return; // Handled by document-level listener
    if (draggingHandle) return; // Handled by document-level listener

    // Finalize element drawing
    if (drawing && activeTool) {
      const x = Math.min(drawing.startX, drawing.currentX);
      const y = Math.min(drawing.startY, drawing.currentY);
      const w = Math.abs(drawing.currentX - drawing.startX);
      const h = Math.abs(drawing.currentY - drawing.startY);
      addNode(activeTool, { x, y }, { width: w, height: h });
      setDrawing(null);
      return;
    }

    // Finalize lasso selection
    if (lasso) {
      const xMin = Math.min(lasso.startX, lasso.currentX);
      const xMax = Math.max(lasso.startX, lasso.currentX);
      const yMin = Math.min(lasso.startY, lasso.currentY);
      const yMax = Math.max(lasso.startY, lasso.currentY);

      const selected = [];
      nodes.forEach((n) => {
        const el = nodeRefs.current[n.id];
        const w = el ? el.offsetWidth : 160;
        const h = el ? el.offsetHeight : 100;
        const overlaps = !(n.x + w < xMin || n.x > xMax || n.y + h < yMin || n.y > yMax);
        if (overlaps) {
          selected.push(n.id);
        }
      });
      setSelectedNodeIds(selected);
      setSelectedConnectionId(null);
      setLasso(null);
      return;
    }

    // Commit group node drag
    if (draggedNodeId && dragStartNodes.length > 0 && draggedNodesDelta && (draggedNodesDelta.dx !== 0 || draggedNodesDelta.dy !== 0)) {
      setNodes((prev) =>
        prev.map((n) => {
          const startNode = dragStartNodes.find((dn) => dn.id === n.id);
          if (startNode) {
            return {
              ...n,
              x: snapTo8(startNode.x + draggedNodesDelta.dx),
              y: snapTo8(startNode.y + draggedNodesDelta.dy)
            };
          }
          return n;
        })
      );
    }

    setIsPanning(false);
    setDraggedNodeId(null);
    setDragStartMouse(null);
    setDragStartNodes([]);
    setDraggedNodesDelta({ dx: 0, dy: 0 });
    setActiveGuidelines([]);
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

  const calculateOrthogonalPath = (conn) => {
    return calculateConnectionPathWithJumps(conn, connections, getPortCoords);
  };

  // Render variables
  const selectedDef = selectedNode ? elementDef(selectedNode.type) : null;
  const SelectedTypeIcon = selectedNode ? (TYPE_ICONS[selectedNode.type] || Box) : Box;

  return (
    <div className="app-container">
      {/* VS Code-style Activity Bar (left, full height) */}
      <nav className="activity-bar" aria-label="UML elements">
        <div className="activity-bar-top">
          {/* Structure elements */}
          {['class', 'interface', 'abstract', 'enumeration'].map((type) => {
            const def = elementDef(type);
            const Icon = TYPE_ICONS[type] || Box;
            return (
              <button
                key={type}
                className={`activity-btn ${activeTool === type ? 'activity-btn--active' : ''}`}
                onClick={() => setActiveTool(activeTool === type ? null : type)}
                title={`Add ${def.label}`}
                aria-label={`Add ${def.label}`}
              >
                <Icon size={21} strokeWidth={1.5} />
              </button>
            );
          })}
          <div className="activity-separator" />
          {/* Behavior elements */}
          {['actor', 'usecase'].map((type) => {
            const def = elementDef(type);
            const Icon = TYPE_ICONS[type] || Box;
            return (
              <button
                key={type}
                className={`activity-btn ${activeTool === type ? 'activity-btn--active' : ''}`}
                onClick={() => setActiveTool(activeTool === type ? null : type)}
                title={`Add ${def.label}`}
                aria-label={`Add ${def.label}`}
              >
                <Icon size={21} strokeWidth={1.5} />
              </button>
            );
          })}
          <div className="activity-separator" />
          {/* Annotation */}
          {['note'].map((type) => {
            const def = elementDef(type);
            const Icon = TYPE_ICONS[type] || Box;
            return (
              <button
                key={type}
                className={`activity-btn ${activeTool === type ? 'activity-btn--active' : ''}`}
                onClick={() => setActiveTool(activeTool === type ? null : type)}
                title={`Add ${def.label}`}
                aria-label={`Add ${def.label}`}
              >
                <Icon size={21} strokeWidth={1.5} />
              </button>
            );
          })}
          <div className="activity-separator" />
        </div>
        <div className="activity-bar-bottom">
          <button className="activity-btn" title="Settings" aria-label="Settings">
            <Settings size={21} strokeWidth={1.5} />
          </button>
          <button className="activity-btn" title="Account" aria-label="Account">
            <UserCircle size={21} strokeWidth={1.5} />
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

          {selectedNodeIds.length > 1 && (
            <div className="toolbar-group" style={{ marginLeft: '12px' }}>
              <span className="toolbar-label" style={{ fontSize: '11px', color: 'var(--text-dim)', marginRight: '4px' }}>Align:</span>
              <button className="btn-icon" onClick={() => handleAlign('left')} title="Align Left">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="2" x2="4" y2="22" strokeWidth="2"></line><rect x="8" y="5" width="12" height="4" rx="1"></rect><rect x="8" y="15" width="8" height="4" rx="1"></rect></svg>
              </button>
              <button className="btn-icon" onClick={() => handleAlign('centerX')} title="Align Center X">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="2" x2="12" y2="22" strokeWidth="2"></line><rect x="4" y="5" width="16" height="4" rx="1"></rect><rect x="6" y="15" width="12" height="4" rx="1"></rect></svg>
              </button>
              <button className="btn-icon" onClick={() => handleAlign('right')} title="Align Right">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="20" y1="2" x2="20" y2="22" strokeWidth="2"></line><rect x="4" y="5" width="12" height="4" rx="1"></rect><rect x="8" y="15" width="8" height="4" rx="1"></rect></svg>
              </button>
              <button className="btn-icon" onClick={() => handleAlign('top')} title="Align Top">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="2" y1="4" x2="22" y2="4" strokeWidth="2"></line><rect x="5" y="8" width="4" height="12" rx="1"></rect><rect x="15" y="8" width="4" height="8" rx="1"></rect></svg>
              </button>
              <button className="btn-icon" onClick={() => handleAlign('centerY')} title="Align Center Y">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="2" y1="12" x2="22" y2="12" strokeWidth="2"></line><rect x="5" y="4" width="4" height="16" rx="1"></rect><rect x="15" y="6" width="4" height="12" rx="1"></rect></svg>
              </button>
              <button className="btn-icon" onClick={() => handleAlign('bottom')} title="Align Bottom">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="2" y1="20" x2="22" y2="20" strokeWidth="2"></line><rect x="5" y="4" width="4" height="12" rx="1"></rect><rect x="15" y="12" width="4" height="8" rx="1"></rect></svg>
              </button>
              {selectedNodeIds.length > 2 && (
                <>
                  <span className="toolbar-label" style={{ fontSize: '11px', color: 'var(--text-dim)', marginLeft: '8px', marginRight: '4px' }}>Dist:</span>
                  <button className="btn-icon" onClick={() => handleDistribute('horizontal')} title="Distribute Horizontally">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="2" x2="4" y2="22"></line><line x1="20" y1="2" x2="20" y2="22"></line><rect x="8" y="7" width="8" height="10" rx="1"></rect></svg>
                  </button>
                  <button className="btn-icon" onClick={() => handleDistribute('vertical')} title="Distribute Vertically">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="2" y1="4" x2="22" y2="4"></line><line x1="2" y1="20" x2="22" y2="20"></line><rect x="7" y="8" width="10" height="8" rx="1"></rect></svg>
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Workspace (canvas + right sidebar) */}
        <div className="editor-layout">

        {/* Canvas Panel */}
        <div
          className={`canvas-container ${activeTool ? 'canvas--tool-active' : ''}`}
          ref={canvasRef}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onDoubleClick={(e) => {
            // Double click on canvas empty space spawns class (legacy shortcut)
            if (!activeTool && (e.target === canvasRef.current || e.target.tagName === 'rect')) {
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
                const pathStr = calculateOrthogonalPath(c);
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
                      style={{ cursor: isSelected ? 'col-resize' : 'pointer', pointerEvents: 'stroke' }}
                      onMouseDown={(e) => {
                        if (isSelected) {
                          // Start midpoint drag directly from the line
                          e.stopPropagation();
                          const elbow = getElbowMidpoint(startCoords, endCoords, c.fromPort, c.toPort, c.midOffset);
                          if (elbow.axis) {
                            setDraggingHandle({ connId: c.id, handleType: 'mid', axis: elbow.axis });
                          }
                        }
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedConnectionId(c.id);
                        setSelectedNodeId(null);
                        setActiveTool(null);
                      }}
                    />

                    {/* Visual line */}
                    <path
                      d={pathStr}
                      className={`connection-line ${isSelected ? 'selected' : ''}`}
                      strokeDasharray={marks.dashed ? '5,5' : 'none'}
                      style={{ pointerEvents: 'none' }}
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
                  className={`uml-node uml-node--${node.type || 'class'} ${isSelected ? 'selected' : ''} ${drawingConnection && drawingConnection.fromNodeId !== node.id ? 'connection-target' : ''}`}
                  style={{
                    left: `${node.x}px`,
                    top: `${node.y}px`,
                    ...(node.width ? { width: `${node.width}px` } : {}),
                    ...(node.height ? { minHeight: `${node.height}px` } : {})
                  }}
                  onMouseUp={(e) => {
                    // Lucidchart-style: drop on node auto-connects to nearest port
                    if (drawingConnection && drawingConnection.fromNodeId !== node.id) {
                      e.stopPropagation();
                      const el = nodeRefs.current[node.id];
                      const width = el ? el.offsetWidth : 200;
                      const height = el ? el.offsetHeight : 120;
                      // Find nearest port to cursor
                      const rect = canvasRef.current.getBoundingClientRect();
                      const cursorX = (e.clientX - rect.left - panX) / zoom;
                      const cursorY = (e.clientY - rect.top - panY) / zoom;
                      const ports = ['top', 'right', 'bottom', 'left'];
                      let nearestPort = 'top';
                      let minDist = Infinity;
                      for (const p of ports) {
                        const coords = portCoordsFor(node, p, width, height);
                        const dist = Math.hypot(cursorX - coords.x, cursorY - coords.y);
                        if (dist < minDist) { minDist = dist; nearestPort = p; }
                      }
                      const newConnection = {
                        id: `conn-${Date.now()}`,
                        fromNodeId: drawingConnection.fromNodeId,
                        fromPort: drawingConnection.fromPort,
                        toNodeId: node.id,
                        toPort: nearestPort,
                        type: 'association',
                        multiplicityFrom: '1',
                        multiplicityTo: '1'
                      };
                      setConnections([...connections, newConnection]);
                      setSelectedConnectionId(newConnection.id);
                      setSelectedNodeIds([]);
                      setDrawingConnection(null);
                      return;
                    }
                  }}
                  onMouseDown={(e) => {
                    // Check if clicked port or resize handle
                    if (e.target.classList.contains('port') || e.target.classList.contains('resize-handle')) return;
                    e.stopPropagation();

                    let nextSelection = [...selectedNodeIds];
                    if (e.shiftKey) {
                      if (nextSelection.includes(node.id)) {
                        nextSelection = nextSelection.filter((id) => id !== node.id);
                      } else {
                        nextSelection.push(node.id);
                      }
                    } else {
                      if (!nextSelection.includes(node.id)) {
                        nextSelection = [node.id];
                      }
                    }
                    setSelectedNodeIds(nextSelection);
                    setSelectedConnectionId(null);

                    setDraggedNodeId(node.id);
                    const canvasRect = canvasRef.current.getBoundingClientRect();
                    const initialMouseX = (e.clientX - canvasRect.left - panX) / zoom;
                    const initialMouseY = (e.clientY - canvasRect.top - panY) / zoom;
                    setDragStartMouse({ x: initialMouseX, y: initialMouseY });

                    const activeDragNodes = nodes.filter((n) => nextSelection.includes(n.id));
                    setDragStartNodes(activeDragNodes.map((n) => ({ id: n.id, x: n.x, y: n.y })));
                    setDraggedNodesDelta({ dx: 0, dy: 0 });
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
                      <div
                        className="uml-node-header"
                        title="Double-click to fit to content"
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          handleFitContent(node.id);
                        }}
                      >
                        <NodeDeleteButton label={def.label} name={node.name} onDelete={() => deleteNode(node.id)} />
                        {(node.stereotype || def.stereotype) && (
                          <span className="uml-stereotype">«{node.stereotype || def.stereotype}»</span>
                        )}
                        <span className={`uml-node-name-row ${def.italicName ? 'is-italic' : ''}`}>
                          <TypeIcon size={13} strokeWidth={1.5} style={{ opacity: 0.7 }} />
                          {inlineEditId === node.id ? (
                            <input
                              className="inline-name-input"
                              defaultValue={node.name}
                              autoFocus
                              onFocus={(e) => e.target.select()}
                              onBlur={(e) => {
                                const val = e.target.value.trim();
                                if (val && val !== node.name) {
                                  setNodes((prev) => prev.map((n) => n.id === node.id ? { ...n, name: val } : n));
                                }
                                setInlineEditId(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') e.target.blur();
                                if (e.key === 'Escape') { setInlineEditId(null); }
                              }}
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <span onDoubleClick={(e) => { e.stopPropagation(); setInlineEditId(node.id); }}>{node.name}</span>
                          )}
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
                        {node.attributes.map((attr) => {
                          const attrStr = def.isEnum
                            ? attr.name
                            : `${attr.isDerived ? '/' : ''}${attr.visibility} ${attr.name}: ${attr.type}${
                                attr.defaultValue ? ` = ${attr.defaultValue}` : ''
                              }${attr.property ? ` {${attr.property}}` : ''}`;

                          const isEditing = inlineAttrEdit && inlineAttrEdit.nodeId === node.id && inlineAttrEdit.attrId === attr.id;

                          return (
                            <div
                              key={attr.id}
                              className={`uml-node-item ${attr.isStatic ? 'uml-static' : ''}`}
                              onDoubleClick={(e) => {
                                e.stopPropagation();
                                setInlineAttrEdit({ nodeId: node.id, attrId: attr.id });
                              }}
                            >
                              {isEditing ? (
                                <input
                                  className="inline-name-input"
                                  style={{ textAlign: 'left' }}
                                  defaultValue={attrStr}
                                  autoFocus
                                  onFocus={(evt) => evt.target.select()}
                                  onBlur={(evt) => handleInlineAttributeSubmit(node.id, attr.id, evt.target.value)}
                                  onKeyDown={(evt) => {
                                    if (evt.key === 'Enter') evt.target.blur();
                                    if (evt.key === 'Escape') setInlineAttrEdit(null);
                                  }}
                                  onMouseDown={(evt) => evt.stopPropagation()}
                                  onClick={(evt) => evt.stopPropagation()}
                                />
                              ) : (
                                attrStr
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Methods area (hidden for enumerations) */}
                      {def.hasMethods && (
                        <div className="uml-node-section">
                          {node.methods.length === 0 && (
                            <span className="uml-node-item" style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>
                              No methods
                            </span>
                          )}
                          {node.methods.map((meth) => {
                            const methStr = `${meth.visibility} ${meth.name}(${meth.parameters}): ${meth.returnType}${
                              meth.property ? ` {${meth.property}}` : ''
                            }`;

                            const isEditing = inlineMethEdit && inlineMethEdit.nodeId === node.id && inlineMethEdit.methId === meth.id;

                            return (
                              <div
                                key={meth.id}
                                className={`uml-node-item ${meth.isStatic ? 'uml-static' : ''} ${
                                  meth.isAbstract ? 'uml-abstract' : ''
                                }`}
                                onDoubleClick={(e) => {
                                  e.stopPropagation();
                                  setInlineMethEdit({ nodeId: node.id, methId: meth.id });
                                }}
                              >
                                {isEditing ? (
                                  <input
                                    className="inline-name-input"
                                    style={{ textAlign: 'left' }}
                                    defaultValue={methStr}
                                    autoFocus
                                    onFocus={(evt) => evt.target.select()}
                                    onBlur={(evt) => handleInlineMethodSubmit(node.id, meth.id, evt.target.value)}
                                    onKeyDown={(evt) => {
                                      if (evt.key === 'Enter') evt.target.blur();
                                      if (evt.key === 'Escape') setInlineMethEdit(null);
                                    }}
                                    onMouseDown={(evt) => evt.stopPropagation()}
                                    onClick={(evt) => evt.stopPropagation()}
                                  />
                                ) : (
                                  methStr
                                )}
                              </div>
                            );
                          })}
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
                      <div className="uml-actor-name">
                        {inlineEditId === node.id ? (
                          <input
                            className="inline-name-input"
                            defaultValue={node.name}
                            autoFocus
                            onFocus={(e) => e.target.select()}
                            onBlur={(e) => {
                              const val = e.target.value.trim();
                              if (val && val !== node.name) {
                                setNodes((prev) => prev.map((n) => n.id === node.id ? { ...n, name: val } : n));
                              }
                              setInlineEditId(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') e.target.blur();
                              if (e.key === 'Escape') { setInlineEditId(null); }
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <span onDoubleClick={(e) => { e.stopPropagation(); setInlineEditId(node.id); }}>{node.name}</span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="uml-usecase">
                      <NodeDeleteButton label={def.label} name={node.name} onDelete={() => deleteNode(node.id)} />
                      <span className="uml-usecase-name">
                        {inlineEditId === node.id ? (
                          <input
                            className="inline-name-input"
                            defaultValue={node.name}
                            autoFocus
                            onFocus={(e) => e.target.select()}
                            onBlur={(e) => {
                              const val = e.target.value.trim();
                              if (val && val !== node.name) {
                                setNodes((prev) => prev.map((n) => n.id === node.id ? { ...n, name: val } : n));
                              }
                              setInlineEditId(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') e.target.blur();
                              if (e.key === 'Escape') { setInlineEditId(null); }
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <span onDoubleClick={(e) => { e.stopPropagation(); setInlineEditId(node.id); }}>{node.name}</span>
                        )}
                      </span>
                    </div>
                  )}

                  {/* Resize handles (shown when selected) */}
                  {isSelected && (
                    <>
                      {['top-left', 'top-right', 'bottom-left', 'bottom-right', 'top', 'right', 'bottom', 'left'].map((handle) => (
                        <div
                          key={handle}
                          className={`resize-handle resize-handle--${handle}`}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            const el = nodeRefs.current[node.id];
                            setResizing({
                              nodeId: node.id,
                              handle,
                              startX: e.clientX,
                              startY: e.clientY,
                              origX: node.x,
                              origY: node.y,
                              origW: el ? el.offsetWidth : (node.width || 160),
                              origH: el ? el.offsetHeight : (node.height || 100)
                            });
                          }}
                        />
                      ))}
                    </>
                  )}
                </div>
              );
            })}

            {/* SVG overlay for connector handles (above nodes so they're clickable) */}
            <svg className="connections-handles-overlay">
              {connections.map((c) => {
                if (selectedConnectionId !== c.id) return null;
                const startCoords = getPortCoords(c.fromNodeId, c.fromPort);
                const endCoords = getPortCoords(c.toNodeId, c.toPort);
                if (!startCoords || !endCoords) return null;
                return (
                  <g key={c.id}>
                    {/* Endpoint handle: source */}
                    <circle
                      cx={startCoords.x}
                      cy={startCoords.y}
                      r={5}
                      className="connector-handle connector-handle--endpoint"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setDraggingHandle({ connId: c.id, handleType: 'start' });
                      }}
                    />
                    {/* Endpoint handle: target */}
                    <circle
                      cx={endCoords.x}
                      cy={endCoords.y}
                      r={5}
                      className="connector-handle connector-handle--endpoint"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setDraggingHandle({ connId: c.id, handleType: 'end' });
                      }}
                    />
                    {/* Midpoint elbow handle */}
                    {(() => {
                      const elbow = getElbowMidpoint(startCoords, endCoords, c.fromPort, c.toPort, c.midOffset);
                      if (!elbow.axis) return null;
                      return (
                        <rect
                          x={elbow.x - 5}
                          y={elbow.y - 5}
                          width={10}
                          height={10}
                          className="connector-handle connector-handle--midpoint"
                          style={{ cursor: elbow.axis === 'x' ? 'ew-resize' : 'ns-resize' }}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setDraggingHandle({ connId: c.id, handleType: 'mid', axis: elbow.axis });
                          }}
                        />
                      );
                    })()}
                  </g>
                );
              })}

              {/* Endpoint drag preview line */}
              {draggingHandle && (draggingHandle.handleType === 'start' || draggingHandle.handleType === 'end') && draggingHandle.cursorX != null && (() => {
                const conn = connections.find((c) => c.id === draggingHandle.connId);
                if (!conn) return null;
                const fixedEnd = draggingHandle.handleType === 'start'
                  ? getPortCoords(conn.toNodeId, conn.toPort)
                  : getPortCoords(conn.fromNodeId, conn.fromPort);
                return (
                  <path
                    d={`M ${fixedEnd.x} ${fixedEnd.y} L ${draggingHandle.cursorX} ${draggingHandle.cursorY}`}
                    className="connection-line drawing"
                  />
                );
              })()}
            </svg>

            {/* Draw-to-size preview shape */}
            {drawing && activeTool && (
              <div
                className={`draw-preview draw-preview--${activeTool}`}
                style={{
                  left: `${Math.min(drawing.startX, drawing.currentX)}px`,
                  top: `${Math.min(drawing.startY, drawing.currentY)}px`,
                  width: `${Math.abs(drawing.currentX - drawing.startX)}px`,
                  height: `${Math.abs(drawing.currentY - drawing.startY)}px`
                }}
              />
            )}

            {/* Lasso select preview shape */}
            {lasso && (
              <div
                className="lasso-select"
                style={{
                  left: `${Math.min(lasso.startX, lasso.currentX)}px`,
                  top: `${Math.min(lasso.startY, lasso.currentY)}px`,
                  width: `${Math.abs(lasso.currentX - lasso.startX)}px`,
                  height: `${Math.abs(lasso.currentY - lasso.startY)}px`
                }}
              />
            )}

            {/* Smart alignment guidelines */}
            {activeGuidelines.map((g, idx) => (
              <div
                key={idx}
                className={`smart-guide-line smart-guide-line--${g.type}`}
                style={{
                  [g.type === 'h' ? 'top' : 'left']: `${g.val}px`
                }}
              />
            ))}
          </div>

          {/* Welcome overlay when canvas is empty and no tool active */}
          {nodes.length === 0 && !activeTool && (
            <div className="canvas-welcome">
              <h1 className="welcome-title">Silver Gravity UML</h1>
              <p className="welcome-hint">Select a tool from the sidebar, then click on the canvas to place it</p>
              <p className="welcome-shortcut"><kbd>⌘</kbd> + <kbd>N</kbd> to add a class</p>
            </div>
          )}
        </div>

        {/* Sidebar Configuration Panel (hidden when canvas is empty) */}
        {nodes.length > 0 && (
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

              <div className="property-group">
                <button
                  className="btn-line"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => handleFitContent(selectedNode.id)}
                  title="Auto-fit element bounding box to text content size"
                >
                  Fit to content
                </button>
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
        )}
      </div>
      </div>
    </div>
  );
}
