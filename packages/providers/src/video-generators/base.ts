export interface VideoGenerationRequest {
  prompt: string;
  model: string;
  aspectRatio?: string;
}

export interface VideoGenerationResponse {
  output: string;
}

export abstract class BaseVideoGenerator {
  abstract generate(request: VideoGenerationRequest): Promise<VideoGenerationResponse>;
}
