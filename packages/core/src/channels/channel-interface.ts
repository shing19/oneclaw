import type { Disposable } from "../types/model-config.js";

export type ChannelStatus = "connected" | "disconnected" | "error";

export interface ChannelConfig {
  channel: string;
  enabled?: boolean;
  [key: string]: unknown;
}

export interface Attachment {
  type: "image" | "file" | "audio" | "video" | "link" | "card" | "unknown";
  id?: string;
  name?: string;
  url?: string;
  mimeType?: string;
  sizeBytes?: number;
  metadata?: Record<string, unknown>;
}

export interface InboundMessage {
  text: string;
  sender: string;
  channel: string;
  timestamp: Date;
  attachments?: Attachment[];
  metadata?: Record<string, unknown>;
}

export interface OutboundMessage {
  text: string;
  format: "plain" | "markdown" | "card";
  recipient?: string;
  attachments?: Attachment[];
  metadata?: Record<string, unknown>;
}

export type ChannelErrorCode =
  | "CHANNEL_NOT_CONNECTED"
  | "CHANNEL_AUTH_FAILED"
  | "CHANNEL_SEND_FAILED"
  | "CHANNEL_RECEIVE_FAILED"
  | "CHANNEL_TIMEOUT"
  | "CHANNEL_UNKNOWN";

export interface ChannelErrorInfo {
  code: ChannelErrorCode;
  message: string;
  recoverable: boolean;
  details?: Record<string, unknown>;
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  timestamp: Date;
  error?: ChannelErrorInfo;
}

export interface TestResult {
  success: boolean;
  latencyMs: number;
  checkedAt: Date;
  status: ChannelStatus;
  message?: string;
  error?: ChannelErrorInfo;
}

export interface ChannelAdapter {
  connect(config: ChannelConfig): Promise<void>;
  disconnect(): Promise<void>;
  sendMessage(message: OutboundMessage): Promise<SendResult>;
  onMessage(callback: (message: InboundMessage) => void): Disposable;
  testConnection(): Promise<TestResult>;
  getStatus(): ChannelStatus;
}

export type CommunicationChannel = ChannelAdapter;
