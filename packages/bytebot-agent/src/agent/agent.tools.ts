/**
 * Common schema definitions for reuse
 */
const coordinateSchema = {
  type: 'object' as const,
  properties: {
    x: {
      type: 'number' as const,
      description: 'The x-coordinate',
    },
    y: {
      type: 'number' as const,
      description: 'The y-coordinate',
    },
  },
  required: ['x', 'y'],
};

export const _mkdirTool = {
  name: 'computer_mkdir',
  description:
    'Creates a directory under /home/user. By default it creates parent directories as needed (recursive).',
  input_schema: {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string' as const,
        description:
          'Directory path to create (e.g., /home/user/Documents/site/assets or Documents/site/assets)',
      },
      recursive: {
        type: 'boolean' as const,
        nullable: true,
        description: 'Create parent directories as needed (defaults to true)',
      },
    },
    required: ['path'],
  },
};

export const _writeFilesTool = {
  name: 'computer_write_files',
  description:
    'Writes multiple files to the user\'s computer in one call. Each file can be text or base64.',
  input_schema: {
    type: 'object' as const,
    properties: {
      files: {
        type: 'array' as const,
        items: {
          type: 'object' as const,
          properties: {
            path: {
              type: 'string' as const,
              description:
                'Path to write under /home/user (e.g., Documents/website/index.html)',
            },
            encoding: {
              type: 'string' as const,
              enum: ['text', 'base64'],
              description: 'Encoding of the provided content',
            },
            content: {
              type: 'string' as const,
              description: 'File content in the specified encoding',
            },
            mediaType: {
              type: 'string' as const,
              nullable: true,
              description:
                'Optional media type (e.g., text/html) when using base64',
            },
          },
          required: ['path', 'encoding', 'content'],
        },
        description: 'Array of files to write',
      },
    },
    required: ['files'],
  },
};

const holdKeysSchema = {
  type: 'array' as const,
  items: { type: 'string' as const },
  description: 'Optional array of keys to hold during the action',
  nullable: true,
};

const buttonSchema = {
  type: 'string' as const,
  enum: ['left', 'right', 'middle'],
  description: 'The mouse button',
};

/**
 * Tool definitions for mouse actions
 */
export const _moveMouseTool = {
  name: 'computer_move_mouse',
  description: 'Moves the mouse cursor to the specified coordinates',
  input_schema: {
    type: 'object' as const,
    properties: {
      coordinates: {
        ...coordinateSchema,
        description: 'Target coordinates for mouse movement',
      },
    },
    required: ['coordinates'],
  },
};

export const _traceMouseTool = {
  name: 'computer_trace_mouse',
  description: 'Moves the mouse cursor along a specified path of coordinates',
  input_schema: {
    type: 'object' as const,
    properties: {
      path: {
        type: 'array' as const,
        items: coordinateSchema,
        description: 'Array of coordinate objects representing the path',
      },
      holdKeys: holdKeysSchema,
    },
    required: ['path'],
  },
};

export const _clickMouseTool = {
  name: 'computer_click_mouse',
  description:
    'Performs a mouse click at the specified coordinates or current position',
  input_schema: {
    type: 'object' as const,
    properties: {
      coordinates: {
        ...coordinateSchema,
        description:
          'Optional click coordinates (defaults to current position)',
        nullable: true,
      },
      button: buttonSchema,
      holdKeys: holdKeysSchema,
      clickCount: {
        type: 'integer' as const,
        description: 'Number of clicks to perform (e.g., 2 for double-click)',
        default: 1,
      },
    },
    required: ['button', 'clickCount'],
  },
};

export const _pressMouseTool = {
  name: 'computer_press_mouse',
  description: 'Presses or releases a specified mouse button',
  input_schema: {
    type: 'object' as const,
    properties: {
      coordinates: {
        ...coordinateSchema,
        description: 'Optional coordinates (defaults to current position)',
        nullable: true,
      },
      button: buttonSchema,
      press: {
        type: 'string' as const,
        enum: ['up', 'down'],
        description: 'Whether to press down or release up',
      },
    },
    required: ['button', 'press'],
  },
};

export const _dragMouseTool = {
  name: 'computer_drag_mouse',
  description: 'Drags the mouse along a path while holding a button',
  input_schema: {
    type: 'object' as const,
    properties: {
      path: {
        type: 'array' as const,
        items: coordinateSchema,
        description: 'Array of coordinates representing the drag path',
      },
      button: buttonSchema,
      holdKeys: holdKeysSchema,
    },
    required: ['path', 'button'],
  },
};

export const _scrollTool = {
  name: 'computer_scroll',
  description: 'Scrolls the mouse wheel in the specified direction',
  input_schema: {
    type: 'object' as const,
    properties: {
      coordinates: {
        ...coordinateSchema,
        description: 'Coordinates where the scroll should occur',
      },
      direction: {
        type: 'string' as const,
        enum: ['up', 'down', 'left', 'right'],
        description: 'The direction to scroll',
      },
      scrollCount: {
        type: 'integer' as const,
        description: 'Number of scroll steps',
      },
      holdKeys: holdKeysSchema,
    },
    required: ['coordinates', 'direction', 'scrollCount'],
  },
};

/**
 * Tool definitions for keyboard actions
 */
export const _typeKeysTool = {
  name: 'computer_type_keys',
  description: 'Types a sequence of keys (useful for keyboard shortcuts)',
  input_schema: {
    type: 'object' as const,
    properties: {
      keys: {
        type: 'array' as const,
        items: { type: 'string' as const },
        description: 'Array of key names to type in sequence',
      },
      delay: {
        type: 'number' as const,
        description: 'Optional delay in milliseconds between key presses',
        nullable: true,
      },
    },
    required: ['keys'],
  },
};

export const _pressKeysTool = {
  name: 'computer_press_keys',
  description:
    'Presses or releases specific keys (useful for holding modifiers)',
  input_schema: {
    type: 'object' as const,
    properties: {
      keys: {
        type: 'array' as const,
        items: { type: 'string' as const },
        description: 'Array of key names to press or release',
      },
      press: {
        type: 'string' as const,
        enum: ['up', 'down'],
        description: 'Whether to press down or release up',
      },
    },
    required: ['keys', 'press'],
  },
};

export const _typeTextTool = {
  name: 'computer_type_text',
  description:
    'Types a string of text character by character. Use this tool for strings less than 25 characters, or passwords/sensitive form fields.',
  input_schema: {
    type: 'object' as const,
    properties: {
      text: {
        type: 'string' as const,
        description: 'The text string to type',
      },
      delay: {
        type: 'number' as const,
        description: 'Optional delay in milliseconds between characters',
        nullable: true,
      },
      isSensitive: {
        type: 'boolean' as const,
        description: 'Flag to indicate sensitive information',
        nullable: true,
      },
    },
    required: ['text'],
  },
};

export const _pasteTextTool = {
  name: 'computer_paste_text',
  description:
    'Copies text to the clipboard and pastes it. Use this tool for typing long text strings or special characters not on the standard keyboard.',
  input_schema: {
    type: 'object' as const,
    properties: {
      text: {
        type: 'string' as const,
        description: 'The text string to type',
      },
      isSensitive: {
        type: 'boolean' as const,
        description: 'Flag to indicate sensitive information',
        nullable: true,
      },
    },
    required: ['text'],
  },
};

/**
 * Tool definitions for utility actions
 */
export const _waitTool = {
  name: 'computer_wait',
  description: 'Pauses execution for a specified duration',
  input_schema: {
    type: 'object' as const,
    properties: {
      duration: {
        type: 'integer' as const,
        enum: [500],
        description: 'The duration to wait in milliseconds',
      },
    },
    required: ['duration'],
  },
};

export const _screenshotTool = {
  name: 'computer_screenshot',
  description: 'Captures a screenshot of the current screen',
  input_schema: {
    type: 'object' as const,
    properties: {},
  },
};

export const _saveScreenshotTool = {
  name: 'computer_save_screenshot',
  description:
    'Captures a screenshot of the current screen and saves it directly to a file path',
  input_schema: {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string' as const,
        description: 'Absolute path where the screenshot should be saved (e.g., /home/user/Documents/desktop.png)',
      },
    },
    required: ['path'],
  },
};

// (read file tool is defined later; avoid duplicate definition here)

export const _writeFileTool = {
  name: 'computer_write_file',
  description:
    'Writes a file to the user\'s computer. Provide either plain text or base64 content.',
  input_schema: {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string' as const,
        description:
          'Path to write under /home/user (e.g., /home/user/Documents/website/index.html or Documents/website/index.html)',
      },
      encoding: {
        type: 'string' as const,
        enum: ['text', 'base64'],
        description: 'Encoding of the provided content',
      },
      content: {
        type: 'string' as const,
        description: 'File content in the specified encoding',
      },
      mediaType: {
        type: 'string' as const,
        nullable: true,
        description:
          'Optional media type for the file (e.g., text/html, text/css, application/json) when using base64',
      },
    },
    required: ['path', 'encoding', 'content'],
  },
};

export const _clickByTextTool = {
  name: 'computer_click_by_text',
  description:
    'Finds on-screen text via OCR and clicks the center of the matched text bounding box',
  input_schema: {
    type: 'object' as const,
    properties: {
      text: {
        type: 'string' as const,
        description: 'The exact text to click (case-insensitive match)',
      },
      region: {
        type: 'object' as const,
        nullable: true,
        description: 'Optional search region to constrain OCR',
        properties: {
          x: { type: 'number' as const },
          y: { type: 'number' as const },
          width: { type: 'number' as const },
          height: { type: 'number' as const },
        },
        required: ['x', 'y', 'width', 'height'],
      },
      fuzz: {
        type: 'number' as const,
        nullable: true,
        description: 'Optional fuzz ratio (0-1) for substring similarity; defaults to strict contains',
      },
    },
    required: ['text'],
  },
};

export const _cursorPositionTool = {
  name: 'computer_cursor_position',
  description: 'Gets the current (x, y) coordinates of the mouse cursor',
  input_schema: {
    type: 'object' as const,
    properties: {},
  },
};

export const _applicationTool = {
  name: 'computer_application',
  description: 'Opens or focuses an application and ensures it is fullscreen',
  input_schema: {
    type: 'object' as const,
    properties: {
      application: {
        type: 'string' as const,
        enum: [
          'firefox',
          '1password',
          'thunderbird',
          'vscode',
          'terminal',
          'desktop',
          'directory',
        ],
        description: 'The application to open or focus',
      },
    },
    required: ['application'],
  },
};

/**
 * Tool definitions for task management
 */
export const _setTaskStatusTool = {
  name: 'set_task_status',
  description: 'Sets the status of the current task',
  input_schema: {
    type: 'object' as const,
    properties: {
      status: {
        type: 'string' as const,
        enum: ['completed', 'needs_help'],
        description: 'The status of the task',
      },
      description: {
        type: 'string' as const,
        description:
          'If the task is completed, a summary of the task. If the task needs help, a description of the issue or clarification needed.',
      },
    },
    required: ['status', 'description'],
  },
};

export const _createTaskTool = {
  name: 'create_task',
  description: 'Creates a new task',
  input_schema: {
    type: 'object' as const,
    properties: {
      description: {
        type: 'string' as const,
        description: 'The description of the task',
      },
      type: {
        type: 'string' as const,
        enum: ['IMMEDIATE', 'SCHEDULED'],
        description: 'The type of the task (defaults to IMMEDIATE)',
      },
      scheduledFor: {
        type: 'string' as const,
        format: 'date-time',
        description: 'RFC 3339 / ISO 8601 datetime for scheduled tasks',
      },
      priority: {
        type: 'string' as const,
        enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
        description: 'The priority of the task (defaults to MEDIUM)',
      },
    },
    required: ['description'],
  },
};

/**
 * Tool definition for reading files
 */
export const _readFileTool = {
  name: 'computer_read_file',
  description:
    'Reads a file from the specified path and returns it as a document content block with base64 encoded data',
  input_schema: {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string' as const,
        description: 'The file path to read from',
      },
    },
    required: ['path'],
  },
};

/**
 * Export all tools as an array
 */
export const agentTools = [
  _moveMouseTool,
  _traceMouseTool,
  _clickMouseTool,
  _pressMouseTool,
  _dragMouseTool,
  _scrollTool,
  _typeKeysTool,
  _pressKeysTool,
  _typeTextTool,
  _pasteTextTool,
  _waitTool,
  _screenshotTool,
  _saveScreenshotTool,
  _applicationTool,
  _cursorPositionTool,
  _clickByTextTool,
  _setTaskStatusTool,
  _createTaskTool,
  _readFileTool,
  _writeFileTool,
  _writeFilesTool,
  _mkdirTool,
  // Calendar tools
  {
    name: 'calendar_list_events',
    description:
      'List calendar events from Google Calendar. Specify a time range and optional search query.',
    input_schema: {
      type: 'object' as const,
      properties: {
        timeMin: {
          type: 'string' as const,
          nullable: true,
          description: 'RFC 3339 start datetime (e.g., 2025-09-11T00:00:00-07:00)',
        },
        timeMax: {
          type: 'string' as const,
          nullable: true,
          description: 'RFC 3339 end datetime',
        },
        maxResults: {
          type: 'integer' as const,
          nullable: true,
          description: 'Maximum number of events to return (default 50)',
        },
        q: {
          type: 'string' as const,
          nullable: true,
          description: 'Free-text search query (summary/description/location)',
        },
        calendarId: {
          type: 'string' as const,
          nullable: true,
          description: 'Calendar ID (defaults to primary)',
        },
      },
    },
  },
  {
    name: 'calendar_create_event',
    description:
      'Create a new event in Google Calendar with start/end, attendees, and reminders.',
    input_schema: {
      type: 'object' as const,
      properties: {
        summary: { type: 'string' as const, description: 'Event title' },
        description: { type: 'string' as const, nullable: true },
        location: { type: 'string' as const, nullable: true },
        start: {
          type: 'object' as const,
          properties: {
            dateTime: { type: 'string' as const, nullable: true },
            date: { type: 'string' as const, nullable: true },
            timeZone: { type: 'string' as const, nullable: true },
          },
          required: [],
        },
        end: {
          type: 'object' as const,
          properties: {
            dateTime: { type: 'string' as const, nullable: true },
            date: { type: 'string' as const, nullable: true },
            timeZone: { type: 'string' as const, nullable: true },
          },
          required: [],
        },
        attendees: {
          type: 'array' as const,
          nullable: true,
          items: {
            type: 'object' as const,
            properties: { email: { type: 'string' as const } },
            required: ['email'],
          },
        },
        reminders: {
          type: 'object' as const,
          nullable: true,
          properties: {
            useDefault: { type: 'boolean' as const, nullable: true },
            overrides: {
              type: 'array' as const,
              items: {
                type: 'object' as const,
                properties: {
                  method: {
                    type: 'string' as const,
                    enum: ['email', 'popup'],
                  },
                  minutes: { type: 'integer' as const },
                },
                required: ['method', 'minutes'],
              },
            },
          },
        },
        calendarId: { type: 'string' as const, nullable: true },
      },
      required: ['summary', 'start', 'end'],
    },
  },
];
