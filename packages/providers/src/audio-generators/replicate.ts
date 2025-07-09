import { BaseAudioGenerator, AudioGenerationRequest, AudioGenerationResponse } from './base';

/**
 * Replicate Audio Generator
 */
export class ReplicateAudioGenerator extends BaseAudioGenerator {
  /**
   * 使用Replicate API生成音频
   * @param request audio generation request
   * @returns audio generation response
   */
  async generate(request: AudioGenerationRequest): Promise<AudioGenerationResponse> {
    const url = `https://api.replicate.com/v1/models/${request.model}/predictions`;

    const headers = {
      Authorization: `Bearer ${process.env.REPLICATE_API_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'wait',
    };

    // switch text or prompt according to model type
    const isTextModel =
      request.model === 'minimax/speech-02-hd' || request.model === 'minimax/speech-02-turbo';

    const data = {
      input: {
        ...(isTextModel ? { text: request.prompt } : { prompt: request.prompt }),
      },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Replicate API error: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    const result = await response.json();

    if (!result.output) {
      const errorMessage = result.error ? `:${JSON.stringify(result.error)}` : '';
      throw new Error(`No URL${errorMessage}`);
    }

    return {
      output: Array.isArray(result.output) ? result.output[0] : result.output,
    };
  }
}
