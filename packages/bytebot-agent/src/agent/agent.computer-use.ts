import {
  Button,
  Coordinates,
  Press,
  ComputerToolUseContentBlock,
  ToolResultContentBlock,
  MessageContentType,
  isScreenshotToolUseBlock,
  isCursorPositionToolUseBlock,
  isMoveMouseToolUseBlock,
  isTraceMouseToolUseBlock,
  isClickMouseToolUseBlock,
  isPressMouseToolUseBlock,
  isDragMouseToolUseBlock,
  isScrollToolUseBlock,
  isTypeKeysToolUseBlock,
  isPressKeysToolUseBlock,
  isTypeTextToolUseBlock,
  isWaitToolUseBlock,
  isApplicationToolUseBlock,
  isPasteTextToolUseBlock,
  isReadFileToolUseBlock,
} from '@bytebot/shared';
import { Logger } from '@nestjs/common';

const BYTEBOT_DESKTOP_BASE_URL = process.env.BYTEBOT_DESKTOP_BASE_URL as string;

// -------- Interlock state (module-scoped) --------
const __agentInterlock: { active: boolean; taskId: string | null } = {
  active: false,
  taskId: null,
};

export function setAgentInterlockActive(taskId: string) {
  __agentInterlock.active = true;
  __agentInterlock.taskId = taskId;
}

export function clearAgentInterlock() {
  __agentInterlock.active = false;
  __agentInterlock.taskId = null;
}

// -------- Allowed tools gating (module-scoped) --------
let __allowedTools: Set<string> | null = null;
export function setAllowedTools(toolNames: string[]) {
  __allowedTools = new Set(toolNames);
}
export function clearAllowedTools() {
  __allowedTools = null;
}

export async function handleComputerToolUse(
  block: any,
  logger: Logger,
): Promise<ToolResultContentBlock> {
  // Safety interlock: block actions unless agent is actively processing
  if (!__agentInterlock.active) {
    return {
      type: MessageContentType.ToolResult,
      tool_use_id: (block as any)?.id ?? '',
      content: [
        {
          type: MessageContentType.Text,
          text: 'ERROR: Agent is not actively processing a task; tool execution is disabled.',
        },
      ],
      is_error: true,
    } as any;
  }
  // Allowed tools gate: if set, block any tool not on the allowlist
  if (__allowedTools && !__allowedTools.has(block?.name)) {
    return {
      type: MessageContentType.ToolResult,
      tool_use_id: (block as any)?.id ?? '',
      content: [
        {
          type: MessageContentType.Text,
          text: `ERROR: Tool '${block?.name}' is not permitted in this task. Use the approved tools only.`,
        },
      ],
      is_error: true,
    } as any;
  }

  // Helper: ensure parent directory exists via desktop mkdir action (best effort)
  async function ensureParentDir(filepath: string, logger: Logger) {
    try {
      const idx = filepath.lastIndexOf('/');
      if (idx <= 0) return;
      const dir = filepath.slice(0, idx);
      const response = await fetch(`${BYTEBOT_DESKTOP_BASE_URL}/computer-use`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mkdir', path: dir, recursive: true }),
      });
      if (!response.ok) {
        logger.warn(`ensureParentDir: mkdir failed with status ${response.status} for ${dir}`);
      }
    } catch (e: any) {
      logger.warn(`ensureParentDir: mkdir threw: ${e?.message}`);
    }
  }
  logger.debug(
    `Handling computer tool use: ${block.name}, tool_use_id: ${block.id}`,
  );

  if (isScreenshotToolUseBlock(block)) {
    logger.debug('Processing screenshot request');
    try {
      logger.debug('Taking screenshot');
      const image = await screenshot();
      logger.debug('Screenshot captured successfully');

      return {
        type: MessageContentType.ToolResult,
        tool_use_id: block.id,
        content: [
          {
            type: MessageContentType.Image,
            source: {
              data: image,
              media_type: 'image/png',
              type: 'base64',
            },
          },
        ],
      };
    } catch (error) {
      logger.error(`Screenshot failed: ${error.message}`, error.stack);
      return {
        type: MessageContentType.ToolResult,
        tool_use_id: block.id,
        content: [
          {
            type: MessageContentType.Text,
            text: 'ERROR: Failed to take screenshot',
          },
        ],
        is_error: true,
      };
    }
  }

  if (isCursorPositionToolUseBlock(block)) {
    logger.debug('Processing cursor position request');
    try {
      logger.debug('Getting cursor position');
      const position = await cursorPosition();
      logger.debug(`Cursor position obtained: ${position.x}, ${position.y}`);

      return {
        type: MessageContentType.ToolResult,
        tool_use_id: block.id,
        content: [
          {
            type: MessageContentType.Text,
            text: `Cursor position: ${position.x}, ${position.y}`,
          },
        ],
      };
    } catch (error) {
      logger.error(
        `Getting cursor position failed: ${error.message}`,
        error.stack,
      );
      return {
        type: MessageContentType.ToolResult,
        tool_use_id: block.id,
        content: [
          {
            type: MessageContentType.Text,
            text: 'ERROR: Failed to get cursor position',
          },
        ],
        is_error: true,
      };
    }
  }

  try {
    // Read dynamic properties via any to avoid union-type exhaustiveness issues
    const b: any = block as any;
    const blockName: string = b.name;
    const blockId: string = b.id;

    // Dispatch high-level helpers first
    if (blockName === 'computer_save_screenshot') {
      const rawPath = b.input?.path as string;
      if (!rawPath) {
        return {
          type: MessageContentType.ToolResult,
          tool_use_id: blockId,
          content: [
            { type: MessageContentType.Text, text: 'ERROR: Missing required input "path"' },
          ],
          is_error: true,
        };
      }
      const HOME = '/home/user';
      const now = new Date();
      const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
      let p = String(rawPath).trim();
      if (p.startsWith('~')) p = p.replace(/^~\/?/, HOME + '/');
      if (!p.startsWith('/')) p = `${HOME}/${p}`;
      p = p.replace(/\/+/, '/').replace(/\/+/, '/');
      if (p.includes('..')) {
        return {
          type: MessageContentType.ToolResult,
          tool_use_id: blockId,
          content: [
            { type: MessageContentType.Text, text: 'ERROR: Path traversal (..) is not allowed. Provide a path under /home/user' },
          ],
          is_error: true,
        };
      }
      if (!p.startsWith(HOME + '/')) {
        return {
          type: MessageContentType.ToolResult,
          tool_use_id: blockId,
          content: [
            { type: MessageContentType.Text, text: 'ERROR: Only paths under /home/user are allowed' },
          ],
          is_error: true,
        };
      }
      const looksDir = /\/$/.test(p) || /\.(png|jpg|jpeg)$/i.test(p) === false;
      const targetPath = looksDir ? `${p.replace(/\/$/, '')}/screenshot-${ts}.png` : p;
      try {
        const image = await screenshot();
        const writeRes = await writeFile({ path: targetPath, content: image });
        if (!writeRes.success) throw new Error(writeRes.message || 'Unknown error writing file');
        return {
          type: MessageContentType.ToolResult,
          tool_use_id: blockId,
          content: [
            { type: MessageContentType.Text, text: `Screenshot saved to ${targetPath}` },
          ],
        };
      } catch (e: any) {
        logger.error(`computer_save_screenshot failed: ${e.message}`, e.stack);
        return {
          type: MessageContentType.ToolResult,
          tool_use_id: blockId,
          content: [
            { type: MessageContentType.Text, text: `ERROR: ${e.message}` },
          ],
          is_error: true,
        };
      }
    }

    if (blockName === 'computer_write_file') {
      const { path: rawPath, encoding, content } = b.input || {};
      if (!rawPath || !encoding || typeof content !== 'string') {
        return {
          type: MessageContentType.ToolResult,
          tool_use_id: blockId,
          content: [
            { type: MessageContentType.Text, text: 'ERROR: Missing required input: path, encoding, and content are required' },
          ],
          is_error: true,
        };
      }
      const HOME = '/home/user';
      let p = String(rawPath).trim();
      if (p.startsWith('~')) p = p.replace(/^~\/?/, HOME + '/');
      if (!p.startsWith('/')) p = `${HOME}/${p}`;
      p = p.replace(/\/+/, '/').replace(/\/+/, '/');
      if (p.includes('..')) {
        return {
          type: MessageContentType.ToolResult,
          tool_use_id: blockId,
          content: [
            { type: MessageContentType.Text, text: 'ERROR: Path traversal (..) is not allowed. Provide a path under /home/user' },
          ],
          is_error: true,
        };
      }
      if (!p.startsWith(HOME + '/')) {
        return {
          type: MessageContentType.ToolResult,
          tool_use_id: blockId,
          content: [
            { type: MessageContentType.Text, text: 'ERROR: Only paths under /home/user are allowed' },
          ],
          is_error: true,
        };
      }
      try {
        let base64Data = content as string;
        if (encoding === 'text') {
          base64Data = Buffer.from(content, 'utf-8').toString('base64');
        } else if (encoding !== 'base64') {
          return {
            type: MessageContentType.ToolResult,
            tool_use_id: blockId,
            content: [
              { type: MessageContentType.Text, text: 'ERROR: encoding must be "text" or "base64"' },
            ],
            is_error: true,
          };
        }
        // Ensure parent directory exists (best effort)
        await ensureParentDir(p, logger);
        const writeRes = await writeFile({ path: p, content: base64Data });
        if (!writeRes.success) throw new Error(writeRes.message || 'Unknown error writing file');
        return {
          type: MessageContentType.ToolResult,
          tool_use_id: blockId,
          content: [
            { type: MessageContentType.Text, text: `File written to ${p}` },
          ],
        };
      } catch (e: any) {
        logger.error(`computer_write_file failed: ${e.message}`, e.stack);
        return {
          type: MessageContentType.ToolResult,
          tool_use_id: blockId,
          content: [
            { type: MessageContentType.Text, text: `ERROR: ${e.message}` },
          ],
          is_error: true,
        };
      }
    }

    if (blockName === 'computer_write_files') {
      const { files } = b.input || {};
      if (!Array.isArray(files) || files.length === 0) {
        return {
          type: MessageContentType.ToolResult,
          tool_use_id: blockId,
          content: [
            { type: MessageContentType.Text, text: 'ERROR: files must be a non-empty array' },
          ],
          is_error: true,
        };
      }
      const HOME = '/home/user';
      const results: string[] = [];
      for (const f of files) {
        try {
          let p = String(f.path || '').trim();
          if (!p) throw new Error('Missing path');
          if (p.startsWith('~')) p = p.replace(/^~\/?/, HOME + '/');
          if (!p.startsWith('/')) p = `${HOME}/${p}`;
          p = p.replace(/\/+/, '/').replace(/\/+/, '/');
          if (p.includes('..')) throw new Error('Path traversal (..) is not allowed');
          if (!p.startsWith(HOME + '/')) throw new Error('Only paths under /home/user are allowed');
          let base64Data = String(f.content ?? '');
          if (f.encoding === 'text') {
            base64Data = Buffer.from(base64Data, 'utf-8').toString('base64');
          } else if (f.encoding !== 'base64') {
            throw new Error('encoding must be "text" or "base64"');
          }
          // Ensure parent directory exists (best effort)
          await ensureParentDir(p, logger);
          const writeRes = await writeFile({ path: p, content: base64Data });
          if (!writeRes.success) throw new Error(writeRes.message || 'Unknown error writing file');
          results.push(`OK: ${p}`);
        } catch (e: any) {
          results.push(`ERROR: ${f?.path || '<unknown>'} - ${e.message}`);
        }
      }
      return {
        type: MessageContentType.ToolResult,
        tool_use_id: blockId,
        content: [
          { type: MessageContentType.Text, text: results.join('\n') },
        ],
      };
    }

    if (blockName === 'computer_mkdir') {
      const { path: rawPath, recursive } = b.input || {};
      const HOME = '/home/user';
      if (!rawPath || typeof rawPath !== 'string') {
        return {
          type: MessageContentType.ToolResult,
          tool_use_id: blockId,
          content: [
            { type: MessageContentType.Text, text: 'ERROR: Missing required input "path"' },
          ],
          is_error: true,
        };
      }
      let p = rawPath.trim();
      if (p.startsWith('~')) p = p.replace(/^~\/?/, HOME + '/');
      if (!p.startsWith('/')) p = `${HOME}/${p}`;
      p = p.replace(/\/+/, '/').replace(/\/+/, '/');
      if (p.includes('..')) {
        return {
          type: MessageContentType.ToolResult,
          tool_use_id: blockId,
          content: [
            { type: MessageContentType.Text, text: 'ERROR: Path traversal (..) is not allowed. Provide a path under /home/user' },
          ],
          is_error: true,
        };
      }
      if (!p.startsWith(HOME + '/')) {
        return {
          type: MessageContentType.ToolResult,
          tool_use_id: blockId,
          content: [
            { type: MessageContentType.Text, text: 'ERROR: Only paths under /home/user are allowed' },
          ],
          is_error: true,
        };
      }

      try {
        const response = await fetch(`${BYTEBOT_DESKTOP_BASE_URL}/computer-use`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'mkdir', path: p, recursive: recursive !== false }),
        });
        if (response.ok) {
          return {
            type: MessageContentType.ToolResult,
            tool_use_id: blockId,
            content: [
              { type: MessageContentType.Text, text: `Directory created: ${p}` },
            ],
          };
        }
        // Fallback: use Terminal with a short mkdir command (robust against long-text failures)
        logger.warn(`mkdir action not supported or failed (${response.status}). Falling back to Terminal mkdir -p.`);
        await application({ application: 'terminal' });
        await typeText({ text: `mkdir -p "${p}"` });
        await pressKeys({ keys: ['enter'], press: 'down' });
        await pressKeys({ keys: ['enter'], press: 'up' });
        return {
          type: MessageContentType.ToolResult,
          tool_use_id: blockId,
          content: [
            { type: MessageContentType.Text, text: `Directory created via Terminal: ${p}` },
          ],
        };
      } catch (e: any) {
        logger.error(`computer_mkdir failed: ${e.message}`, e.stack);
        return {
          type: MessageContentType.ToolResult,
          tool_use_id: blockId,
          content: [
            { type: MessageContentType.Text, text: `ERROR: ${e.message}` },
          ],
          is_error: true,
        };
      }
    }

    // OCR-backed click by visible text
    if (blockName === 'computer_click_by_text') {
      const { text, region, fuzz } = b.input || {};
      if (!text || typeof text !== 'string') {
        return {
          type: MessageContentType.ToolResult,
          tool_use_id: blockId,
          content: [
            {
              type: MessageContentType.Text,
              text: 'ERROR: Missing required input "text"',
            },
          ],
          is_error: true,
        };
      }

      try {
        const image = await screenshot();
        const { createWorker } = await import('tesseract.js');
        const worker = await createWorker(['eng']);
        const { data } = await worker.recognize(
          `data:image/png;base64,${image}`,
        );
        await worker.terminate();

        const target = text.toLowerCase();
        // Find best matching word block by simple contains; extend with fuzz if needed
        const words = (data.words || []) as Array<{
          text: string;
          bbox: { x0: number; y0: number; x1: number; y1: number };
        }>;

        let best = null as null | { x: number; y: number; word: string };
        for (const w of words) {
          const wtext = (w.text || '').toLowerCase();
          if (!wtext) continue;
          if (wtext.includes(target)) {
            const cx = Math.round((w.bbox.x0 + w.bbox.x1) / 2);
            const cy = Math.round((w.bbox.y0 + w.bbox.y1) / 2);
            best = { x: cx, y: cy, word: w.text };
            break;
          }
        }

        if (!best) {
          return {
            type: MessageContentType.ToolResult,
            tool_use_id: blockId,
            content: [
              {
                type: MessageContentType.Text,
                text: `ERROR: Could not find text "${text}" on screen`,
              },
            ],
            is_error: true,
          };
        }

        await clickMouse({
          coordinates: { x: best.x, y: best.y },
          button: 'left',
          clickCount: 1,
          holdKeys: undefined,
        });

        // Take a verification screenshot
        let verifyImg: string | null = null;
        try {
          await new Promise((r) => setTimeout(r, 600));
          verifyImg = await screenshot();
        } catch {}

        const result: ToolResultContentBlock = {
          type: MessageContentType.ToolResult,
          tool_use_id: blockId,
          content: [
            {
              type: MessageContentType.Text,
              text: `Clicked on text: ${best.word} at (${best.x}, ${best.y})`,
            },
          ],
        };
        if (verifyImg) {
          result.content.push({
            type: MessageContentType.Image,
            source: {
              data: verifyImg,
              media_type: 'image/png',
              type: 'base64',
            },
          });
        }

        return result;
      } catch (e: any) {
        logger.error(`computer_click_by_text failed: ${e.message}`, e.stack);
        return {
          type: MessageContentType.ToolResult,
          tool_use_id: blockId,
          content: [
            { type: MessageContentType.Text, text: `ERROR: ${e.message}` },
          ],
          is_error: true,
        };
      }
    }
    if (isMoveMouseToolUseBlock(block)) {
      await moveMouse(block.input);
    }
    if (isTraceMouseToolUseBlock(block)) {
      await traceMouse(block.input);
    }
    if (isClickMouseToolUseBlock(block)) {
      await clickMouse(block.input);
    }
    if (isPressMouseToolUseBlock(block)) {
      await pressMouse(block.input);
    }
    if (isDragMouseToolUseBlock(block)) {
      await dragMouse(block.input);
    }
    if (isScrollToolUseBlock(block)) {
      await scroll(block.input);
    }
    if (isTypeKeysToolUseBlock(block)) {
      await typeKeys(block.input);
    }
    if (isPressKeysToolUseBlock(block)) {
      await pressKeys(block.input);
    }
    if (isTypeTextToolUseBlock(block)) {
      await typeText(block.input);
    }
    if (isPasteTextToolUseBlock(block)) {
      await pasteText(block.input);
    }
    if (isWaitToolUseBlock(block)) {
      await wait(block.input);
    }
    if (isApplicationToolUseBlock(block)) {
      await application(block.input);
    }
    if (isReadFileToolUseBlock(block)) {
      logger.debug(`Reading file: ${block.input.path}`);
      const result = await readFile(block.input);

      if (result.success && result.data) {
        // Return document content block
        return {
          type: MessageContentType.ToolResult,
          tool_use_id: block.id,
          content: [
            {
              type: MessageContentType.Document,
              source: {
                type: 'base64',
                media_type: result.mediaType || 'application/octet-stream',
                data: result.data,
              },
              name: result.name || 'file',
              size: result.size,
            },
          ],
        };
      } else {
        // Return error message
        return {
          type: MessageContentType.ToolResult,
          tool_use_id: block.id,
          content: [
            {
              type: MessageContentType.Text,
              text: result.message || 'Error reading file',
            },
          ],
          is_error: true,
        };
      }
    }

    let image: string | null = null;
    try {
      // Wait before taking screenshot to allow UI to settle
      const delayMs = 750; // 750ms delay
      logger.debug(`Waiting ${delayMs}ms before taking screenshot`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));

      logger.debug('Taking screenshot');
      image = await screenshot();
      logger.debug('Screenshot captured successfully');
    } catch (error) {
      logger.error('Failed to take screenshot', error);
    }

    logger.debug(`Tool execution successful for tool_use_id: ${block.id}`);
    const toolResult: ToolResultContentBlock = {
      type: MessageContentType.ToolResult,
      tool_use_id: block.id,
      content: [
        {
          type: MessageContentType.Text,
          text: 'Tool executed successfully',
        },
      ],
    };

    if (image) {
      toolResult.content.push({
        type: MessageContentType.Image,
        source: {
          data: image,
          media_type: 'image/png',
          type: 'base64',
        },
      });
    }

    return toolResult;
  } catch (error) {
    logger.error(
      `Error executing ${block.name} tool: ${error.message}`,
      error.stack,
    );
    return {
      type: MessageContentType.ToolResult,
      tool_use_id: block.id,
      content: [
        {
          type: MessageContentType.Text,
          text: `Error executing ${block.name} tool: ${error.message}`,
        },
      ],
      is_error: true,
    };
  }
}

async function moveMouse(input: { coordinates: Coordinates }): Promise<void> {
  const { coordinates } = input;
  console.log(
    `Moving mouse to coordinates: [${coordinates.x}, ${coordinates.y}]`,
  );

  try {
    await fetch(`${BYTEBOT_DESKTOP_BASE_URL}/computer-use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'move_mouse',
        coordinates,
      }),
    });
  } catch (error) {
    console.error('Error in move_mouse action:', error);
    throw error;
  }
}

async function traceMouse(input: {
  path: Coordinates[];
  holdKeys?: string[];
}): Promise<void> {
  const { path, holdKeys } = input;
  console.log(
    `Tracing mouse to path: ${path} ${holdKeys ? `with holdKeys: ${holdKeys}` : ''}`,
  );

  try {
    await fetch(`${BYTEBOT_DESKTOP_BASE_URL}/computer-use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'trace_mouse',
        path,
        holdKeys,
      }),
    });
  } catch (error) {
    console.error('Error in trace_mouse action:', error);
    throw error;
  }
}

async function clickMouse(input: {
  coordinates?: Coordinates;
  button: Button;
  holdKeys?: string[];
  clickCount: number;
}): Promise<void> {
  const { coordinates, button, holdKeys, clickCount } = input;
  console.log(
    `Clicking mouse ${button} ${clickCount} times ${coordinates ? `at coordinates: [${coordinates.x}, ${coordinates.y}] ` : ''} ${holdKeys ? `with holdKeys: ${holdKeys}` : ''}`,
  );

  try {
    await fetch(`${BYTEBOT_DESKTOP_BASE_URL}/computer-use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'click_mouse',
        coordinates,
        button,
        holdKeys: holdKeys && holdKeys.length > 0 ? holdKeys : undefined,
        clickCount,
      }),
    });
  } catch (error) {
    console.error('Error in click_mouse action:', error);
    throw error;
  }
}

async function pressMouse(input: {
  coordinates?: Coordinates;
  button: Button;
  press: Press;
}): Promise<void> {
  const { coordinates, button, press } = input;
  console.log(
    `Pressing mouse ${button} ${press} ${coordinates ? `at coordinates: [${coordinates.x}, ${coordinates.y}]` : ''}`,
  );

  try {
    await fetch(`${BYTEBOT_DESKTOP_BASE_URL}/computer-use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'press_mouse',
        coordinates,
        button,
        press,
      }),
    });
  } catch (error) {
    console.error('Error in press_mouse action:', error);
    throw error;
  }
}

async function dragMouse(input: {
  path: Coordinates[];
  button: Button;
  holdKeys?: string[];
}): Promise<void> {
  const { path, button, holdKeys } = input;
  console.log(
    `Dragging mouse to path: ${path} ${holdKeys ? `with holdKeys: ${holdKeys}` : ''}`,
  );

  try {
    await fetch(`${BYTEBOT_DESKTOP_BASE_URL}/computer-use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'drag_mouse',
        path,
        button,
        holdKeys: holdKeys && holdKeys.length > 0 ? holdKeys : undefined,
      }),
    });
  } catch (error) {
    console.error('Error in drag_mouse action:', error);
    throw error;
  }
}

async function scroll(input: {
  coordinates?: Coordinates;
  direction: 'up' | 'down' | 'left' | 'right';
  scrollCount: number;
  holdKeys?: string[];
}): Promise<void> {
  const { coordinates, direction, scrollCount, holdKeys } = input;
  console.log(
    `Scrolling ${direction} ${scrollCount} times ${coordinates ? `at coordinates: [${coordinates.x}, ${coordinates.y}]` : ''}`,
  );

  try {
    await fetch(`${BYTEBOT_DESKTOP_BASE_URL}/computer-use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'scroll',
        coordinates,
        direction,
        scrollCount,
        holdKeys: holdKeys && holdKeys.length > 0 ? holdKeys : undefined,
      }),
    });
  } catch (error) {
    console.error('Error in scroll action:', error);
    throw error;
  }
}

async function typeKeys(input: {
  keys: string[];
  delay?: number;
}): Promise<void> {
  const { keys, delay } = input;
  console.log(`Typing keys: ${keys}`);

  try {
    await fetch(`${BYTEBOT_DESKTOP_BASE_URL}/computer-use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'type_keys',
        keys,
        delay,
      }),
    });
  } catch (error) {
    console.error('Error in type_keys action:', error);
    throw error;
  }
}

async function pressKeys(input: {
  keys: string[];
  press: Press;
}): Promise<void> {
  const { keys, press } = input;
  console.log(`Pressing keys: ${keys}`);

  try {
    await fetch(`${BYTEBOT_DESKTOP_BASE_URL}/computer-use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'press_keys',
        keys,
        press,
      }),
    });
  } catch (error) {
    console.error('Error in press_keys action:', error);
    throw error;
  }
}

async function typeText(input: {
  text: string;
  delay?: number;
}): Promise<void> {
  const { text, delay } = input;
  console.log(`Typing text: ${text}`);

  try {
    await fetch(`${BYTEBOT_DESKTOP_BASE_URL}/computer-use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'type_text',
        text,
        delay,
      }),
    });
  } catch (error) {
    console.error('Error in type_text action:', error);
    throw error;
  }
}

async function pasteText(input: { text: string }): Promise<void> {
  const { text } = input;
  console.log(`Pasting text: ${text}`);

  try {
    await fetch(`${BYTEBOT_DESKTOP_BASE_URL}/computer-use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'paste_text',
        text,
      }),
    });
  } catch (error) {
    console.error('Error in paste_text action:', error);
    throw error;
  }
}

async function wait(input: { duration: number }): Promise<void> {
  const { duration } = input;
  console.log(`Waiting for ${duration}ms`);

  try {
    await fetch(`${BYTEBOT_DESKTOP_BASE_URL}/computer-use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'wait',
        duration,
      }),
    });
  } catch (error) {
    console.error('Error in wait action:', error);
    throw error;
  }
}

async function cursorPosition(): Promise<Coordinates> {
  console.log('Getting cursor position');

  try {
    const response = await fetch(`${BYTEBOT_DESKTOP_BASE_URL}/computer-use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'cursor_position',
      }),
    });

    const data = await response.json();
    return { x: data.x, y: data.y };
  } catch (error) {
    console.error('Error in cursor_position action:', error);
    throw error;
  }
}

async function screenshot(): Promise<string> {
  console.log('Taking screenshot');

  try {
    const requestBody = {
      action: 'screenshot',
    };

    const response = await fetch(`${BYTEBOT_DESKTOP_BASE_URL}/computer-use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`Failed to take screenshot: ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.image) {
      throw new Error('Failed to take screenshot: No image data received');
    }

    return data.image; // Base64 encoded image
  } catch (error) {
    console.error('Error in screenshot action:', error);
    throw error;
  }
}

async function application(input: { application: string }): Promise<void> {
  const { application } = input;
  console.log(`Opening application: ${application}`);

  try {
    await fetch(`${BYTEBOT_DESKTOP_BASE_URL}/computer-use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'application',
        application,
      }),
    });
  } catch (error) {
    console.error('Error in application action:', error);
    throw error;
  }
}

async function readFile(input: { path: string }): Promise<{
  success: boolean;
  data?: string;
  name?: string;
  size?: number;
  mediaType?: string;
  message?: string;
}> {
  const { path } = input;
  console.log(`Reading file: ${path}`);

  try {
    const response = await fetch(`${BYTEBOT_DESKTOP_BASE_URL}/computer-use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'read_file',
        path,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to read file: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error in read_file action:', error);
    return {
      success: false,
      message: `Error reading file: ${error.message}`,
    };
  }
}

export async function writeFile(input: {
  path: string;
  content: string;
}): Promise<{ success: boolean; message?: string }> {
  const { path, content } = input;
  console.log(`Writing file: ${path}`);

  try {
    // Content is always base64 encoded
    const base64Data = content;

    const response = await fetch(`${BYTEBOT_DESKTOP_BASE_URL}/computer-use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'write_file',
        path,
        data: base64Data,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to write file: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error in write_file action:', error);
    return {
      success: false,
      message: `Error writing file: ${error.message}`,
    };
  }
}
