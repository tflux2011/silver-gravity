import React, { useState, useEffect, useRef } from 'react';
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
  Sparkles,
  Box,
  GitBranch,
  Keyboard,
  Link2,
  Puzzle,
  Shapes,
  List,
  StickyNote,
  User,
  Circle,
  Wand2
} from 'lucide-react';
import './App.css';

// UML element type registry. Each node stores a `type`; an undefined type is
// treated as 'class' for backward compatibility. `shape` drives rendering:
//   'class'   -> 3-compartment box (class / interface / abstract / enumeration)
//   'note'    -> folded-corner comment
//   'actor'   -> stick figure (use-case diagrams)
//   'usecase' -> ellipse
const TYPE_ICONS = {
  class: Box,
  interface: Puzzle,
  abstract: Shapes,
  enumeration: List,
  note: StickyNote,
  actor: User,
  usecase: Circle
};

const UML_ELEMENTS = {
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
const elementDef = (type) => UML_ELEMENTS[type] || UML_ELEMENTS.class;

// Ordered palette entries rendered in the left rail.
const PALETTE_ITEMS = ['class', 'interface', 'abstract', 'enumeration', 'note', 'actor', 'usecase'];

// Hover-reveal delete control shared by every node shape.
const NodeDeleteButton = ({ label, name, onDelete }) => (
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

// Help helper component for shortcuts list
const ShortcutHelp = () => (
  <div className="help-card">
    <div className="help-title"><Keyboard size={14} strokeWidth={2} /> Keyboard Shortcuts</div>
    <ul className="help-list">
      <li><span className="help-key">Double Click Canvas</span> Spawns new Class</li>
      <li><span className="help-key">Ctrl / Cmd + S</span> Quick Save</li>
      <li><span className="help-key">Ctrl / Cmd + O</span> Open File</li>
      <li><span className="help-key">Delete / Backspace</span> Removes selected Class/Connection</li>
      <li><span className="help-key">Space + Drag</span> Pan Canvas</li>
    </ul>
  </div>
);

// Initial empty nodes and connections
const INITIAL_NODES = [
  {
    id: 'node-1',
    name: 'Student',
    x: 100,
    y: 120,
    attributes: [
      { id: 'a1', visibility: '-', name: 'studentId', type: 'String' },
      { id: 'a2', visibility: '-', name: 'name', type: 'String' },
      { id: 'a3', visibility: '-', name: 'email', type: 'String' }
    ],
    methods: [
      { id: 'm1', visibility: '+', name: 'enrollInCourse', parameters: 'course: Course', returnType: 'boolean' },
      { id: 'm2', visibility: '+', name: 'getSchedule', parameters: '', returnType: 'Schedule' }
    ]
  },
  {
    id: 'node-2',
    name: 'Course',
    x: 480,
    y: 120,
    attributes: [
      { id: 'ca1', visibility: '-', name: 'courseCode', type: 'String' },
      { id: 'ca2', visibility: '-', name: 'title', type: 'String' },
      { id: 'ca3', visibility: '-', name: 'credits', type: 'int' }
    ],
    methods: [
      { id: 'cm1', visibility: '+', name: 'getPrerequisites', parameters: '', returnType: 'List<Course>' }
    ]
  }
];

const INITIAL_CONNECTIONS = [
  {
    id: 'conn-1',
    fromNodeId: 'node-1',
    fromPort: 'right',
    toNodeId: 'node-2',
    toPort: 'left',
    type: 'association',
    multiplicityFrom: '*',
    multiplicityTo: '0..*'
  }
];

// Compro Schedule System template data
const COMPRO_TEMPLATE_NODES = [
  {
    id: 'dept',
    name: 'Department',
    x: 320,
    y: 40,
    attributes: [
      { id: 'dept-1', visibility: '-', name: 'deptId', type: 'String' },
      { id: 'dept-2', visibility: '-', name: 'name', type: 'String' }
    ],
    methods: [
      { id: 'dept-m1', visibility: '+', name: 'assignFaculty', parameters: 'f: Faculty', returnType: 'void' }
    ]
  },
  {
    id: 'faculty',
    name: 'Faculty',
    x: 80,
    y: 160,
    attributes: [
      { id: 'fac-1', visibility: '-', name: 'facultyId', type: 'String' },
      { id: 'fac-2', visibility: '-', name: 'specialization', type: 'String' }
    ],
    methods: [
      { id: 'fac-m1', visibility: '+', name: 'teachCourse', parameters: 'c: CourseSection', returnType: 'boolean' }
    ]
  },
  {
    id: 'student',
    name: 'Student',
    x: 580,
    y: 160,
    attributes: [
      { id: 'stud-1', visibility: '-', name: 'studentId', type: 'String' },
      { id: 'stud-2', visibility: '-', name: 'gpa', type: 'double' }
    ],
    methods: [
      { id: 'stud-m1', visibility: '+', name: 'registerSection', parameters: 's: Section', returnType: 'void' }
    ]
  },
  {
    id: 'course',
    name: 'Course',
    x: 320,
    y: 280,
    attributes: [
      { id: 'crs-1', visibility: '-', name: 'courseCode', type: 'String' },
      { id: 'crs-2', visibility: '-', name: 'credits', type: 'int' }
    ],
    methods: [
      { id: 'crs-m1', visibility: '+', name: 'checkPrereq', parameters: 's: Student', returnType: 'boolean' }
    ]
  },
  {
    id: 'section',
    name: 'CourseSection',
    x: 80,
    y: 440,
    attributes: [
      { id: 'sec-1', visibility: '-', name: 'sectionId', type: 'String' },
      { id: 'sec-2', visibility: '-', name: 'maxSeats', type: 'int' }
    ],
    methods: [
      { id: 'sec-m1', visibility: '+', name: 'hasAvailability', parameters: '', returnType: 'boolean' }
    ]
  },
  {
    id: 'schedule',
    name: 'Schedule',
    x: 320,
    y: 480,
    attributes: [
      { id: 'sch-1', visibility: '-', name: 'term', type: 'String' },
      { id: 'sch-2', visibility: '-', name: 'year', type: 'int' }
    ],
    methods: [
      { id: 'sch-m1', visibility: '+', name: 'resolveConflicts', parameters: '', returnType: 'List<Conflict>' }
    ]
  },
  {
    id: 'room',
    name: 'Room',
    x: 580,
    y: 440,
    attributes: [
      { id: 'rm-1', visibility: '-', name: 'roomNumber', type: 'String' },
      { id: 'rm-2', visibility: '-', name: 'capacity', type: 'int' }
    ],
    methods: []
  }
];

const COMPRO_TEMPLATE_CONNECTIONS = [
  {
    id: 'c-dept-fac',
    fromNodeId: 'dept',
    fromPort: 'left',
    toNodeId: 'faculty',
    toPort: 'top',
    type: 'composition',
    multiplicityFrom: '1',
    multiplicityTo: '1..*'
  },
  {
    id: 'c-dept-stud',
    fromNodeId: 'dept',
    fromPort: 'right',
    toNodeId: 'student',
    toPort: 'top',
    type: 'aggregation',
    multiplicityFrom: '1',
    multiplicityTo: '*'
  },
  {
    id: 'c-dept-crs',
    fromNodeId: 'dept',
    fromPort: 'bottom',
    toNodeId: 'course',
    toPort: 'top',
    type: 'composition',
    multiplicityFrom: '1',
    multiplicityTo: '1..*'
  },
  {
    id: 'c-fac-sec',
    fromNodeId: 'faculty',
    fromPort: 'bottom',
    toNodeId: 'section',
    toPort: 'top',
    type: 'association',
    multiplicityFrom: '1',
    multiplicityTo: '0..*'
  },
  {
    id: 'c-stud-sec',
    fromNodeId: 'student',
    fromPort: 'bottom',
    toNodeId: 'section',
    toPort: 'right',
    type: 'association',
    multiplicityFrom: '1..*',
    multiplicityTo: '0..*'
  },
  {
    id: 'c-crs-sec',
    fromNodeId: 'course',
    fromPort: 'left',
    toNodeId: 'section',
    toPort: 'right',
    type: 'composition',
    multiplicityFrom: '1',
    multiplicityTo: '1..*'
  },
  {
    id: 'c-sec-sch',
    fromNodeId: 'section',
    fromPort: 'bottom',
    toNodeId: 'schedule',
    toPort: 'left',
    type: 'aggregation',
    multiplicityFrom: '*',
    multiplicityTo: '1'
  },
  {
    id: 'c-sec-rm',
    fromNodeId: 'section',
    fromPort: 'right',
    toNodeId: 'room',
    toPort: 'left',
    type: 'association',
    multiplicityFrom: '0..*',
    multiplicityTo: '1'
  }
];

// Hospital Management System template data
const HOSPITAL_TEMPLATE_NODES = [
  {
    id: 'hosp-dept',
    name: 'Department',
    x: 280,
    y: 40,
    attributes: [
      { id: 'hd-1', visibility: '-', name: 'deptCode', type: 'String' },
      { id: 'hd-2', visibility: '-', name: 'name', type: 'String' }
    ],
    methods: []
  },
  {
    id: 'hosp-doc',
    name: 'Doctor',
    x: 80,
    y: 180,
    attributes: [
      { id: 'doc-1', visibility: '-', name: 'employeeId', type: 'String' },
      { id: 'doc-2', visibility: '-', name: 'specialty', type: 'String' }
    ],
    methods: [
      { id: 'doc-m1', visibility: '+', name: 'diagnose', parameters: 'p: Patient', returnType: 'Record' }
    ]
  },
  {
    id: 'hosp-pat',
    name: 'Patient',
    x: 480,
    y: 180,
    attributes: [
      { id: 'pat-1', visibility: '-', name: 'patientId', type: 'String' },
      { id: 'pat-2', visibility: '-', name: 'medicalHistory', type: 'History' }
    ],
    methods: [
      { id: 'pat-m1', visibility: '+', name: 'admit', parameters: '', returnType: 'void' }
    ]
  },
  {
    id: 'hosp-appt',
    name: 'Appointment',
    x: 280,
    y: 320,
    attributes: [
      { id: 'ap-1', visibility: '-', name: 'appointmentId', type: 'String' },
      { id: 'ap-2', visibility: '-', name: 'dateTime', type: 'Date' }
    ],
    methods: []
  }
];

const HOSPITAL_TEMPLATE_CONNECTIONS = [
  {
    id: 'hc-dept-doc',
    fromNodeId: 'hosp-dept',
    fromPort: 'left',
    toNodeId: 'hosp-doc',
    toPort: 'top',
    type: 'composition',
    multiplicityFrom: '1',
    multiplicityTo: '1..*'
  },
  {
    id: 'hc-doc-pat',
    fromNodeId: 'hosp-doc',
    fromPort: 'right',
    toNodeId: 'hosp-pat',
    toPort: 'left',
    type: 'association',
    multiplicityFrom: '1..*',
    multiplicityTo: '0..*'
  },
  {
    id: 'hc-doc-appt',
    fromNodeId: 'hosp-doc',
    fromPort: 'bottom',
    toNodeId: 'hosp-appt',
    toPort: 'left',
    type: 'association',
    multiplicityFrom: '1',
    multiplicityTo: '*'
  },
  {
    id: 'hc-pat-appt',
    fromNodeId: 'hosp-pat',
    fromPort: 'bottom',
    toNodeId: 'hosp-appt',
    toPort: 'right',
    type: 'association',
    multiplicityFrom: '1',
    multiplicityTo: '*'
  }
];

export default function App() {
  const [nodes, setNodes] = useState(INITIAL_NODES);
  const [connections, setConnections] = useState(INITIAL_CONNECTIONS);
  
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState(null);
  
  const [zoom, setZoom] = useState(1.0);
  const [panX, setPanX] = useState(100);
  const [panY, setPanY] = useState(80);
  const [filePath, setFilePath] = useState(null);
  
  // Dragging states
  const [draggedNodeId, setDraggedNodeId] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  
  const [drawingConnection, setDrawingConnection] = useState(null);
  
  // Controlled input states for sidebar renaming
  const [editingName, setEditingName] = useState('');
  const [nameError, setNameError] = useState('');

  // Load-sample dropdown menu visibility
  const [sampleMenuOpen, setSampleMenuOpen] = useState(false);

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

  // Snap position to closest 8px increment
  const snapTo8 = (val) => Math.round(val / 8) * 8;

  // Keyboard listeners for shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      const isInputFocused = ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName);
      if (isInputFocused) return;

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
  }, [selectedNodeId, selectedConnectionId, nodes, connections, filePath]);

  // IPC Bridge File operations
  const handleOpen = async () => {
    if (window.electronAPI) {
      try {
        const fileData = await window.electronAPI.openFile();
        if (fileData) {
          const parsed = JSON.parse(fileData.content);
          if (parsed.nodes && parsed.connections) {
            setNodes(parsed.nodes);
            setConnections(parsed.connections);
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
              setNodes(parsed.nodes);
              setConnections(parsed.connections);
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
      setNodes([]);
      setConnections([]);
      setFilePath(null);
      setSelectedNodeId(null);
      setSelectedConnectionId(null);
      setZoom(1.0);
      setPanX(100);
      setPanY(80);
    }
  };

  // Pre-load verification schema
  const handleLoadComproTemplate = () => {
    setNodes(COMPRO_TEMPLATE_NODES);
    setConnections(COMPRO_TEMPLATE_CONNECTIONS);
    setFilePath('ComproScheduleSystem.uml');
    setSelectedNodeId(null);
    setSelectedConnectionId(null);
    setZoom(0.9);
    setPanX(60);
    setPanY(50);
  };

  const handleLoadHospitalTemplate = () => {
    setNodes(HOSPITAL_TEMPLATE_NODES);
    setConnections(HOSPITAL_TEMPLATE_CONNECTIONS);
    setFilePath('HospitalManagementSystem.uml');
    setSelectedNodeId(null);
    setSelectedConnectionId(null);
    setZoom(0.9);
    setPanX(60);
    setPanY(50);
  };

  // Load a bundled sample diagram, then close the sample menu.
  const loadSample = (val) => {
    if (val === 'initial') {
      setNodes(INITIAL_NODES);
      setConnections(INITIAL_CONNECTIONS);
      setFilePath('SimpleSample.uml');
      setSelectedNodeId(null);
      setSelectedConnectionId(null);
    } else if (val === 'compro') {
      handleLoadComproTemplate();
    } else if (val === 'hospital') {
      handleLoadHospitalTemplate();
    }
    setSampleMenuOpen(false);
  };

  // Node operations
  const addNode = (type = 'class') => {
    const def = elementDef(type);

    // Generate element position relative to current viewport
    const x = snapTo8(Math.max(80, -panX + 200));
    const y = snapTo8(Math.max(80, -panY + 150));

    // Disallow creating multiple elements with the same default name
    const baseName = `New${def.label.replace(/\s+/g, '')}`;
    let name = baseName;
    let counter = 1;
    while (nodes.some(n => n.name.toLowerCase() === name.toLowerCase())) {
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

  const deleteNode = (nodeId) => {
    setNodes(nodes.filter(n => n.id !== nodeId));
    setConnections(connections.filter(c => c.fromNodeId !== nodeId && c.toNodeId !== nodeId));
    if (selectedNodeId === nodeId) {
      setSelectedNodeId(null);
    }
  };

  // Convert an existing element to another UML type. Compartments that the
  // target shape does not use are cleared, and notes get seeded body text.
  const updateNodeType = (nodeId, newType) => {
    const def = elementDef(newType);
    setNodes(nodes.map(n => {
      if (n.id !== nodeId) return n;
      const next = { ...n, type: newType };
      if (!def.hasMethods) next.methods = [];
      if (def.shape !== 'class') next.attributes = [];
      if (def.shape === 'note' && !next.text) next.text = 'Note…';
      return next;
    }));
  };

  // Update a note's body text.
  const updateNodeText = (nodeId, text) => {
    setNodes(nodes.map(n => n.id === nodeId ? { ...n, text } : n));
  };

  const updateNodeName = (nodeId, newName) => {
    const cleaned = newName.trim();
    if (cleaned === '') return;
    const isDuplicate = nodes.some(n => n.id !== nodeId && n.name.toLowerCase() === cleaned.toLowerCase());
    if (!isDuplicate) {
      setNodes(nodes.map(n => n.id === nodeId ? { ...n, name: cleaned } : n));
    }
  };

  const handleNameChange = (val) => {
    setEditingName(val);
    const cleaned = val.trim();
    const isDuplicate = nodes.some(n => n.id !== selectedNodeId && n.name.toLowerCase() === cleaned.toLowerCase());
    if (isDuplicate) {
      setNameError('Class name must be unique');
    } else if (cleaned === '') {
      setNameError('Class name cannot be empty');
    } else {
      setNameError('');
      // commit immediately to node name list
      setNodes(nodes.map(n => n.id === selectedNodeId ? { ...n, name: val } : n));
    }
  };

  const updateNodeCoords = (nodeId, x, y) => {
    setNodes(nodes.map(n => n.id === nodeId ? { ...n, x: snapTo8(x), y: snapTo8(y) } : n));
  };

  // Attributes / Methods editors
  const addAttribute = (nodeId) => {
    setNodes(nodes.map(n => {
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
    }));
  };

  const updateAttribute = (nodeId, attrId, fields) => {
    setNodes(nodes.map(n => {
      if (n.id === nodeId) {
        return {
          ...n,
          attributes: n.attributes.map(a => a.id === attrId ? { ...a, ...fields } : a)
        };
      }
      return n;
    }));
  };

  const removeAttribute = (nodeId, attrId) => {
    setNodes(nodes.map(n => {
      if (n.id === nodeId) {
        return {
          ...n,
          attributes: n.attributes.filter(a => a.id !== attrId)
        };
      }
      return n;
    }));
  };

  const addMethod = (nodeId) => {
    setNodes(nodes.map(n => {
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
    }));
  };

  const updateMethod = (nodeId, methId, fields) => {
    setNodes(nodes.map(n => {
      if (n.id === nodeId) {
        return {
          ...n,
          methods: n.methods.map(m => m.id === methId ? { ...m, ...fields } : m)
        };
      }
      return n;
    }));
  };

  const removeMethod = (nodeId, methId) => {
    setNodes(nodes.map(n => {
      if (n.id === nodeId) {
        return {
          ...n,
          methods: n.methods.filter(m => m.id !== methId)
        };
      }
      return n;
    }));
  };

  // Connections
  const deleteConnection = (connId) => {
    setConnections(connections.filter(c => c.id !== connId));
    if (selectedConnectionId === connId) {
      setSelectedConnectionId(null);
    }
  };

  const updateConnection = (connId, fields) => {
    setConnections(connections.map(c => c.id === connId ? { ...c, ...fields } : c));
  };

  // Canvas Drag Panning
  const handleCanvasMouseDown = (e) => {
    // If user clicked standard elements/ports, ignore canvas panning
    if (e.target.closest('.uml-node') || e.target.closest('.port') || e.target.closest('button') || e.target.closest('.sidebar')) {
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
      // Snapped offset drag
      const newX = snapTo8((e.clientX - panX) / zoom - dragOffset.x);
      const newY = snapTo8((e.clientY - panY) / zoom - dragOffset.y);
      updateNodeCoords(draggedNodeId, newX, newY);
    } else if (drawingConnection) {
      // Dynamic connection drawing preview
      const rect = canvasRef.current.getBoundingClientRect();
      const currentX = (e.clientX - rect.left - panX) / zoom;
      const currentY = (e.clientY - rect.top - panY) / zoom;
      setDrawingConnection({
        ...drawingConnection,
        currentX,
        currentY
      });
    }
  };

  const handleCanvasMouseUp = () => {
    setIsPanning(false);
    setDraggedNodeId(null);
    setDrawingConnection(null);
  };

  // Port node positioning calculations (dynamic offset tracking)
  const getPortCoords = (nodeId, portName) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return { x: 0, y: 0 };

    const el = nodeRefs.current[nodeId];
    const width = el ? el.offsetWidth : 200;
    const height = el ? el.offsetHeight : 120;

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

  // Orthogonal segment router
  const calculateOrthogonalPath = (fromId, fromPort, toId, toPort) => {
    const start = getPortCoords(fromId, fromPort);
    const end = getPortCoords(toId, toPort);

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

    // Default 2-step layout if mismatch in port configurations
    if (fromPort === 'top' || fromPort === 'bottom') {
      return `M ${x1} ${y1} V ${y2} H ${x2}`;
    } else {
      return `M ${x1} ${y1} H ${x2} V ${y2}`;
    }
  };

  // Connection markers styles
  const getConnectionMarkers = (type, isSelected) => {
    const strokeColor = isSelected ? 'var(--border-focus)' : 'var(--border-normal)';
    
    switch (type) {
      case 'association':
        return { markerEnd: 'url(#arrow)' };
      case 'inheritance':
      case 'implementation':
        return { markerEnd: 'url(#inheritance)' };
      case 'aggregation':
        return { markerEnd: 'url(#aggregation)' };
      case 'composition':
        return { markerEnd: 'url(#composition)' };
      default:
        return {};
    }
  };

  // Render variables
  const selectedNode = nodes.find(n => n.id === selectedNodeId);
  const selectedConnection = connections.find(c => c.id === selectedConnectionId);
  const selectedDef = selectedNode ? elementDef(selectedNode.type) : null;
  const SelectedTypeIcon = selectedNode ? (TYPE_ICONS[selectedNode.type] || Box) : Box;

  return (
    <div className="app-container">
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
          <button className="btn-icon" onClick={() => setZoom(Math.max(0.5, zoom - 0.1))} title="Zoom Out">
            <ZoomOut size={16} />
          </button>
          <div className="zoom-indicator">{Math.round(zoom * 100)}%</div>
          <button className="btn-icon" onClick={() => setZoom(Math.min(2.0, zoom + 0.1))} title="Zoom In">
            <ZoomIn size={16} />
          </button>
          <button className="btn-icon" onClick={() => { setZoom(1.0); setPanX(100); setPanY(80); }} title="Reset View">
            <Maximize2 size={16} />
          </button>
        </div>
      </div>

      {/* Main Workspace split */}
      <div className="editor-layout">
        {/* Left UML element palette */}
        <div className="palette" role="toolbar" aria-label="UML elements">
          {PALETTE_ITEMS.map((type) => {
            const def = elementDef(type);
            const Icon = TYPE_ICONS[type] || Box;
            return (
              <button
                key={type}
                className="palette-btn"
                onClick={() => addNode(type)}
                title={`Add ${def.label}`}
                aria-label={`Add ${def.label}`}
              >
                <Icon size={20} strokeWidth={1.5} />
              </button>
            );
          })}
        </div>

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
            style={{
              transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
            }}
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
              <defs>
                {/* UML Arrowheads definitions - soft slate on light canvas */}
                <marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M 0 1 L 10 5 L 0 9" fill="none" stroke="#9aa2af" strokeWidth="1.5" />
                </marker>
                
                {/* Hollow triangle for inheritance/generalization */}
                <marker id="inheritance" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 Z" fill="#ffffff" stroke="#9aa2af" strokeWidth="1.5" />
                </marker>
                
                {/* Filled diamond for Composition */}
                <marker id="composition" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                  <path d="M 0 5 L 5 10 L 10 5 L 5 0 Z" fill="#9aa2af" />
                </marker>
                
                {/* Hollow diamond for Aggregation */}
                <marker id="aggregation" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                  <path d="M 0 5 L 5 10 L 10 5 L 5 0 Z" fill="#ffffff" stroke="#9aa2af" strokeWidth="1.5" />
                </marker>
              </defs>

              {/* Draw established connection lines */}
              {connections.map((c) => {
                const pathStr = calculateOrthogonalPath(c.fromNodeId, c.fromPort, c.toNodeId, c.toPort);
                const isSelected = selectedConnectionId === c.id;
                const isDashed = c.type === 'implementation';

                // Pick marker
                const markers = getConnectionMarkers(c.type, isSelected);

                // Find mid-path coordinate to render multiplicity labels
                const startCoords = getPortCoords(c.fromNodeId, c.fromPort);
                const endCoords = getPortCoords(c.toNodeId, c.toPort);
                
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
                      strokeDasharray={isDashed ? '5,5' : 'none'}
                      {...markers}
                    />

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
            {nodes.map((node) => {
              const isSelected = selectedNodeId === node.id;
              const def = elementDef(node.type);
              const TypeIcon = TYPE_ICONS[node.type] || Box;

              return (
                <div
                  key={node.id}
                  ref={(el) => { nodeRefs.current[node.id] = el; }}
                  className={`uml-node uml-node--${node.type || 'class'} ${isSelected ? 'selected' : ''}`}
                  style={{
                    left: `${node.x}px`,
                    top: `${node.y}px`,
                  }}
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
                          // Complete connection drawing
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
                        {def.stereotype && (
                          <span className="uml-stereotype">«{def.stereotype}»</span>
                        )}
                        <span className={`uml-node-name-row ${def.italicName ? 'is-italic' : ''}`}>
                          <TypeIcon size={13} strokeWidth={1.5} style={{ opacity: 0.7 }} />
                          <span>{node.name}</span>
                        </span>
                      </div>

                      {/* Attributes / enum-literals area */}
                      <div className="uml-node-section">
                        {node.attributes.length === 0 && (
                          <span className="uml-node-item" style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>
                            {def.isEnum ? 'No values' : 'No attributes'}
                          </span>
                        )}
                        {node.attributes.map((attr) => (
                          <div key={attr.id} className="uml-node-item">
                            {def.isEnum
                              ? attr.name
                              : `${attr.visibility} ${attr.name}: ${attr.type}`}
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
                            <div key={meth.id} className="uml-node-item">
                              {meth.visibility} {meth.name}({meth.parameters}): {meth.returnType}
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
              <div className="sidebar-title"><SelectedTypeIcon size={16} strokeWidth={2} /> Edit {selectedDef.label}</div>

              <div className="property-group">
                <label className="property-label">Element Type</label>
                <select
                  value={selectedNode.type || 'class'}
                  onChange={(e) => updateNodeType(selectedNode.id, e.target.value)}
                >
                  {PALETTE_ITEMS.map((t) => (
                    <option key={t} value={t}>{elementDef(t).label}</option>
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

              <div className="property-group">
                <div className="property-row">
                  <div style={{ flex: 1 }}>
                    <label className="property-label">Position X</label>
                    <input
                      type="text"
                      disabled
                      value={selectedNode.x}
                      style={{ opacity: 0.7, fontFamily: 'var(--font-mono)' }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="property-label">Position Y</label>
                    <input
                      type="text"
                      disabled
                      value={selectedNode.y}
                      style={{ opacity: 0.7, fontFamily: 'var(--font-mono)' }}
                    />
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
                    <div key={attr.id} className="item-list-row">
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
                    <div key={meth.id} className="item-list-row" style={{ flexWrap: 'wrap', gap: '4px' }}>
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
                    </div>
                  ))}
                </div>
              </div>
              )}
            </div>
          ) : selectedConnection ? (
            <div className="sidebar-section">
              <div className="sidebar-title"><GitBranch size={16} strokeWidth={2} /> Edit Relationship</div>
              
              <div className="property-group">
                <label className="property-label">Relationship Type</label>
                <select
                  value={selectedConnection.type}
                  onChange={(e) => updateConnection(selectedConnection.id, { type: e.target.value })}
                >
                  <option value="association">Association (Solid line, Arrow)</option>
                  <option value="inheritance">Inheritance (Generalization)</option>
                  <option value="implementation">Implementation (Dashed line, Hollow Arrow)</option>
                  <option value="aggregation">Aggregation (Hollow Diamond)</option>
                  <option value="composition">Composition (Solid Diamond)</option>
                </select>
              </div>

              <div className="property-group">
                <label className="property-label">Source Multiplicity</label>
                <input
                  type="text"
                  placeholder="e.g. 1, *, 0..*"
                  value={selectedConnection.multiplicityFrom || ''}
                  onChange={(e) => updateConnection(selectedConnection.id, { multiplicityFrom: e.target.value })}
                />
              </div>

              <div className="property-group">
                <label className="property-label">Target Multiplicity</label>
                <input
                  type="text"
                  placeholder="e.g. 1, *, 0..*"
                  value={selectedConnection.multiplicityTo || ''}
                  onChange={(e) => updateConnection(selectedConnection.id, { multiplicityTo: e.target.value })}
                />
              </div>

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
              <div className="sidebar-title"><Layers size={16} strokeWidth={2} /> Global Overview</div>
              
              <div className="help-card">
                <div className="help-title" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <BookOpen size={13} /> Modeling stats
                </div>
                <ul className="help-list" style={{ marginTop: '8px' }}>
                  <li>Classes: <span className="help-key">{nodes.length}</span></li>
                  <li>Relationships: <span className="help-key">{connections.length}</span></li>
                  <li>File: <span style={{ fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>{filePath || 'unsaved'}</span></li>
                </ul>
              </div>

              <ShortcutHelp />

              <div className="help-card">
                <div className="help-title"><Link2 size={14} strokeWidth={2} /> Connecting Nodes</div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '140%' }}>
                  Hover over any Class card to reveal the 4 connection ports (top, bottom, left, right). Click and drag from one port to another port to draw relationship associations.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
