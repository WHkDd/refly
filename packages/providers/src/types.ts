export interface BaseProvider {
  providerKey: string;
  apiKey?: string;
  baseUrl?: string;
}

// Multimodal Provider base interface
export interface MultimodalProvider extends BaseProvider {
  model: string;
  maxWidth?: number;
  maxHeight?: number;
  // Asynchronous task configuration
  pollInterval?: number; // Polling interval (milliseconds)
  maxPollAttempts?: number; // Maximum polling times
  webhookUrl?: string; // webhook Callback address (optional)
}

// Image Generation Provider
export interface ImageGenerationProvider extends MultimodalProvider {
  providerKey: 'replicate' | 'fal' | string;
}

// Video Generation Provider
export interface VideoGenerationProvider extends MultimodalProvider {
  providerKey: 'replicate' | 'fal' | string;
}

// Audio Generation Provider
export interface AudioGenerationProvider extends MultimodalProvider {
  providerKey: 'replicate' | 'fal' | string;
}

// Unified generation request interface
export interface GenerationRequest {
  prompt: string;
  negativePrompt?: string;
  // Media Specific Parameters
  width?: number;
  height?: number;
  duration?: number; // Audio/Video
  fps?: number; // Video frame rate
  // Input Media
  inputImage?: string;
  inputAudio?: string;
  inputVideo?: string;
  // General parameters
  seed?: number;
  steps?: number;
  guidance?: number;
  aspectRatio?: string;
  quality?: 'standard' | 'hd';
  count?: number;
}

// Unified response generation interface
export interface GenerationResponse {
  outputs: GeneratedMedia[];
  metadata: {
    prompt: string;
    model: string;
    provider: string;
    parameters: Record<string, any>;
    usage?: {
      cost?: number;
      credits?: number;
      processingTime?: number;
    };
    taskId?: string; // Asynchronous task ID
  };
}

export interface GeneratedMedia {
  url?: string;
  base64?: string;
  width?: number;
  height?: number;
  duration?: number;
  format: string;
  seed?: number;
}
