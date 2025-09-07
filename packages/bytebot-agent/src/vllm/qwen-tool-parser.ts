import { Logger } from '@nestjs/common';
import { ToolUseContentBlock, MessageContentType } from '@bytebot/shared';

export interface QwenToolCall {
  name: string;
  arguments: Record<string, any>;
}

export class QwenToolParser {
  private readonly logger = new Logger(QwenToolParser.name);

  /**
   * Parse Qwen3-Coder tool call format (both XML and JSON) to standard JSON
   * XML Example: <tool_call> <function=search_products> <parameter=query> waterproof running shoes </parameter> </function> </tool_call>
   * JSON Example: ```json\n{ "name": "computer_application", "input": { "application": "firefox" } }\n```
   */
  parseToolCall(content: string): ToolUseContentBlock[] {
    const toolBlocks: ToolUseContentBlock[] = [];
    
    // First try to parse JSON format (more common with current models)
    const jsonToolBlocks = this.parseJsonToolCalls(content);
    toolBlocks.push(...jsonToolBlocks);
    
    // Then try XML format for backwards compatibility
    const xmlToolBlocks = this.parseXmlToolCalls(content);
    toolBlocks.push(...xmlToolBlocks);
    
    return toolBlocks;
  }

  /**
   * Parse JSON tool calls from code blocks
   */
  private parseJsonToolCalls(content: string): ToolUseContentBlock[] {
    const toolBlocks: ToolUseContentBlock[] = [];
    
    // Match JSON code blocks
    const jsonRegex = /```json\s*\n([\s\S]*?)\n```/g;
    let match;
    
    while ((match = jsonRegex.exec(content)) !== null) {
      try {
        const jsonContent = match[1].trim();
        const parsed = JSON.parse(jsonContent);
        
        if (parsed.name && typeof parsed.name === 'string') {
          toolBlocks.push({
            type: MessageContentType.ToolUse,
            id: this.generateToolId(),
            name: parsed.name,
            input: parsed.input || parsed.arguments || {},
          });
        }
      } catch (error) {
        this.logger.warn(`Failed to parse JSON tool call: ${error.message}`);
      }
    }
    
    return toolBlocks;
  }

  /**
   * Parse XML tool calls (legacy format)
   */
  private parseXmlToolCalls(content: string): ToolUseContentBlock[] {
    const toolBlocks: ToolUseContentBlock[] = [];
    
    // Match tool_call blocks
    const toolCallRegex = /<tool_call>(.*?)<\/tool_call>/gs;
    let match;
    
    while ((match = toolCallRegex.exec(content)) !== null) {
      const toolCallContent = match[1].trim();
      
      try {
        const parsedTool = this.parseQwenXmlFormat(toolCallContent);
        if (parsedTool) {
          toolBlocks.push({
            type: MessageContentType.ToolUse,
            id: this.generateToolId(),
            name: parsedTool.name,
            input: parsedTool.arguments,
          });
        }
      } catch (error) {
        this.logger.warn(`Failed to parse XML tool call: ${error.message}`);
      }
    }
    
    return toolBlocks;
  }

  /**
   * Parse the XML format used by Qwen3-Coder
   * <function=function_name> <parameter=param1> value1 </parameter> <parameter=param2> value2 </parameter> </function>
   */
  private parseQwenXmlFormat(content: string): QwenToolCall | null {
    // Extract function name
    const functionMatch = content.match(/<function=([^>]+)>/);
    if (!functionMatch) {
      return null;
    }
    
    const functionName = functionMatch[1].trim();
    const args: Record<string, any> = {};
    
    // Extract parameters
    const parameterRegex = /<parameter=([^>]+)>\s*(.*?)\s*<\/parameter>/gs;
    let paramMatch;
    
    while ((paramMatch = parameterRegex.exec(content)) !== null) {
      const paramName = paramMatch[1].trim();
      const paramValue = paramMatch[2].trim();
      
      // Try to parse as JSON, otherwise use as string
      try {
        args[paramName] = JSON.parse(paramValue);
      } catch {
        args[paramName] = paramValue;
      }
    }
    
    return {
      name: functionName,
      arguments: args,
    };
  }

  /**
   * Check if content contains Qwen3-Coder tool calls (JSON or XML format)
   */
  hasQwenToolCalls(content: string): boolean {
    // Check for JSON format
    const hasJsonTools = /```json\s*\n[\s\S]*?"name"\s*:\s*"[^"]+"/s.test(content);
    
    // Check for XML format
    const hasXmlTools = /<tool_call>.*?<function=.*?<\/tool_call>/s.test(content);
    
    return hasJsonTools || hasXmlTools;
  }

  /**
   * Generate a unique tool ID
   */
  private generateToolId(): string {
    return `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
