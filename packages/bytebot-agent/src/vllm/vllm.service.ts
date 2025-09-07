import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI, { APIUserAbortError } from 'openai';
import {
  MessageContentBlock,
  MessageContentType,
  TextContentBlock,
  ToolUseContentBlock,
  ToolResultContentBlock,
  ImageContentBlock,
  isUserActionContentBlock,
  isComputerToolUseContentBlock,
  isImageContentBlock,
  ThinkingContentBlock,
} from '@bytebot/shared';
import { Message, Role } from '@prisma/client';
import {
  BytebotAgentService,
  BytebotAgentInterrupt,
  BytebotAgentResponse,
} from '../agent/agent.types';
import { proxyTools } from '../proxy/proxy.tools';
import { QwenToolParser } from './qwen-tool-parser';

@Injectable()
export class VllmService implements BytebotAgentService {
  private readonly openai: OpenAI;
  private readonly logger = new Logger(VllmService.name);
  private readonly qwenToolParser = new QwenToolParser();

  constructor(private readonly configService: ConfigService) {
    const vllmBaseUrl = this.configService.get<string>('VLLM_BASE_URL');
    const vllmApiKey = this.configService.get<string>('VLLM_API_KEY');

    if (!vllmBaseUrl) {
      this.logger.warn(
        'VLLM_BASE_URL is not set. VllmService will not work properly.',
      );
    }

    // Initialize OpenAI client with VLLM configuration
    this.openai = new OpenAI({
      apiKey: vllmApiKey || 'dummy-key-for-vllm',
      baseURL: vllmBaseUrl,
    });
  }

  /**
   * Main method to generate messages using the Chat Completions API
   */
  async generateMessage(
    systemPrompt: string,
    messages: Message[],
    model: string,
    useTools: boolean = true,
    signal?: AbortSignal,
  ): Promise<BytebotAgentResponse> {
    // Convert messages to Chat Completion format
    const chatMessages = this.formatMessagesForChatCompletion(
      systemPrompt,
      messages,
    );

    try {
      // Prepare the Chat Completion request
      // Use minimal parameters for MLX/VLLM compatibility
      const completionRequest: OpenAI.Chat.ChatCompletionCreateParams = {
        model,
        messages: chatMessages,
        max_tokens: 8192,
        temperature: 0.1,
        // Only include basic parameters that MLX servers support
      };

      // Make the API call
      const completion = await this.openai.chat.completions.create(
        completionRequest,
        { signal },
      );

      // Process the response
      const choice = completion.choices[0];
      if (!choice || !choice.message) {
        throw new Error('No valid response from VLLM Chat Completion API');
      }

      // Convert response to MessageContentBlocks
      const contentBlocks = this.formatChatCompletionResponse(choice.message, model);

      return {
        contentBlocks,
        tokenUsage: {
          inputTokens: completion.usage?.prompt_tokens || 0,
          outputTokens: completion.usage?.completion_tokens || 0,
          totalTokens: completion.usage?.total_tokens || 0,
        },
      };
    } catch (error: any) {
      if (error instanceof APIUserAbortError) {
        this.logger.log('VLLM Chat Completion API call aborted');
        throw new BytebotAgentInterrupt();
      }

      this.logger.error(
        `Error sending message to VLLM: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Convert Bytebot messages to Chat Completion format
   */
  private formatMessagesForChatCompletion(
    systemPrompt: string,
    messages: Message[],
  ): OpenAI.Chat.ChatCompletionMessageParam[] {
    const chatMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    // Add system message
    chatMessages.push({
      role: 'system',
      content: systemPrompt,
    });

    // Process each message
    for (const message of messages) {
      const messageContentBlocks = message.content as MessageContentBlock[];

      // Handle user actions specially
      if (
        messageContentBlocks.every((block) => isUserActionContentBlock(block))
      ) {
        const userActionBlocks = messageContentBlocks.flatMap(
          (block) => block.content,
        );

        for (const block of userActionBlocks) {
          if (isComputerToolUseContentBlock(block)) {
            chatMessages.push({
              role: 'user',
              content: `User performed action: ${block.name}\n${JSON.stringify(
                block.input,
                null,
                2,
              )}`,
            });
          } else if (isImageContentBlock(block)) {
            // Skip image content for VLLM models as most don't support vision
            chatMessages.push({
              role: 'user',
              content: '[Image content skipped - VLLM model does not support vision]',
            });
          }
        }
      } else {
        for (const block of messageContentBlocks) {
          switch (block.type) {
            case MessageContentType.Text: {
              chatMessages.push({
                role: message.role === Role.USER ? 'user' : 'assistant',
                content: block.text,
              });
              break;
            }
            case MessageContentType.Image: {
              // Skip image content for VLLM models as most don't support vision
              // Add a text description instead
              chatMessages.push({
                role: 'user',
                content: '[Image content skipped - VLLM model does not support vision]',
              });
              break;
            }
            case MessageContentType.ToolUse: {
              // Convert tool use to text format for MLX compatibility
              const toolBlock = block as ToolUseContentBlock;
              chatMessages.push({
                role: 'assistant',
                content: `\`\`\`json\n${JSON.stringify({
                  name: toolBlock.name,
                  input: toolBlock.input
                })}\n\`\`\``,
              });
              break;
            }
            case MessageContentType.Thinking: {
              const thinkingBlock = block as ThinkingContentBlock;
              chatMessages.push({
                role: 'assistant',
                content: `[Thinking: ${thinkingBlock.thinking}]`,
              });
              break;
            }
            case MessageContentType.ToolResult: {
              // Convert tool results to user messages for MLX compatibility
              const toolResultBlock = block as ToolResultContentBlock;

              toolResultBlock.content.forEach((content) => {
                if (content.type === MessageContentType.Text) {
                  chatMessages.push({
                    role: 'user',
                    content: `Tool result: ${content.text}`,
                  });
                }

                if (content.type === MessageContentType.Image) {
                  // Skip image content for VLLM models as most don't support vision
                  chatMessages.push({
                    role: 'user',
                    content: 'Tool result: [Image content skipped - VLLM model does not support vision]',
                  });
                }
              });
              break;
            }
          }
        }
      }
    }

    return chatMessages;
  }

  /**
   * Convert Chat Completion response to MessageContentBlocks
   */
  private formatChatCompletionResponse(
    message: OpenAI.Chat.ChatCompletionMessage,
    model?: string,
  ): MessageContentBlock[] {
    const contentBlocks: MessageContentBlock[] = [];

    // Handle text content
    if (message.content) {
      // Check if this is a Qwen3-Coder model and parse XML tool calls
      const isQwenCoder = model && (model.toLowerCase().includes('qwen') && model.toLowerCase().includes('coder'));
      
      if (isQwenCoder && this.qwenToolParser.hasQwenToolCalls(message.content)) {
        // Parse Qwen XML tool calls and add them as tool use blocks
        const qwenToolBlocks = this.qwenToolParser.parseToolCall(message.content);
        contentBlocks.push(...qwenToolBlocks);
        
        // Remove tool call XML from text content
        const textContent = message.content.replace(/<tool_call>.*?<\/tool_call>/gs, '').trim();
        if (textContent) {
          contentBlocks.push({
            type: MessageContentType.Text,
            text: textContent,
          } as TextContentBlock);
        }
      } else {
        contentBlocks.push({
          type: MessageContentType.Text,
          text: message.content,
        } as TextContentBlock);
      }
    }

    // Handle tool calls
    if (message.tool_calls && message.tool_calls.length > 0) {
      for (const toolCall of message.tool_calls) {
        if (toolCall.type === 'function') {
          let parsedInput = {};
          try {
            parsedInput = JSON.parse(toolCall.function.arguments || '{}');
          } catch (e) {
            this.logger.warn(
              `Failed to parse tool call arguments: ${toolCall.function.arguments}`,
            );
            parsedInput = {};
          }

          contentBlocks.push({
            type: MessageContentType.ToolUse,
            id: toolCall.id,
            name: toolCall.function.name,
            input: parsedInput,
          } as ToolUseContentBlock);
        }
      }
    }

    // Handle refusal
    if (message.refusal) {
      contentBlocks.push({
        type: MessageContentType.Text,
        text: `Refusal: ${message.refusal}`,
      } as TextContentBlock);
    }

    return contentBlocks;
  }
}
