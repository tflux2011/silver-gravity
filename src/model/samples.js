// Bundled sample and template diagrams.
//
// These are static seed datasets loaded from the toolbar's "Load Sample" menu
// and used as the editor's initial state.

// Simple two-class starter diagram.
export const INITIAL_NODES = [
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

export const INITIAL_CONNECTIONS = [
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
export const COMPRO_TEMPLATE_NODES = [
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

export const COMPRO_TEMPLATE_CONNECTIONS = [
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
export const HOSPITAL_TEMPLATE_NODES = [
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

export const HOSPITAL_TEMPLATE_CONNECTIONS = [
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
