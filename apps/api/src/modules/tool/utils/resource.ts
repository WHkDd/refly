/**
 * Resource management utilities
 * Handles file upload, download, and resource field extraction for tool responses
 */

import { Injectable, Logger } from '@nestjs/common';
import type {
  HandlerRequest,
  HandlerResponse,
  JsonSchema,
  ResponseSchema,
  SchemaProperty,
  ToolResourceType,
  UploadResult,
} from '@refly/openapi-schema';
import mime from 'mime';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

import { getCanvasId, getCurrentUser } from '../core/context/tool-context';
import type { ResourceResolver, ResourceUploader } from '../handlers/types';
import { DriveService } from '../../drive/drive.service';
import { MiscService } from '../../misc/misc.service';

/**
 * Process resources in data based on schema definitions
 * Traverses both schema and data simultaneously, processing fields marked with isResource
 *
 * @param schema - JSON schema with isResource markers
 * @param data - Data object to process
 * @param processor - Function to process each resource field
 * @returns Processed data
 */
export async function processResourcesInData(
  schema: JsonSchema,
  data: Record<string, unknown>,
  processor: (value: unknown, schema: SchemaProperty) => Promise<unknown>,
): Promise<Record<string, unknown>> {
  const result = { ...data };

  /**
   * Validate if a value is a valid fileId (must start with 'df-')
   */
  function isValidFileId(value: unknown): boolean {
    if (typeof value === 'string') {
      return value.startsWith('df-');
    }
    if (value && typeof value === 'object' && 'fileId' in value) {
      const fileId = (value as any).fileId;
      return typeof fileId === 'string' && fileId.startsWith('df-');
    }
    return false;
  }

  /**
   * Recursively traverse schema and data together
   */
  async function traverse(
    schemaProperty: SchemaProperty,
    dataValue: unknown,
    key: string,
    parent: Record<string, unknown>,
  ): Promise<void> {
    // Case 0: Handle oneOf/anyOf schemas
    // Check if any of the options has isResource=true
    const schemaWithOneOf = schemaProperty as SchemaProperty & {
      oneOf?: SchemaProperty[];
      anyOf?: SchemaProperty[];
    };

    if (schemaWithOneOf.oneOf || schemaWithOneOf.anyOf) {
      const options = schemaWithOneOf.oneOf || schemaWithOneOf.anyOf || [];

      // Find the resource option (the one with isResource: true)
      const resourceOption = options.find((opt: SchemaProperty) => opt.isResource);

      if (resourceOption && dataValue !== undefined && dataValue !== null) {
        // Check if the value looks like a fileId (starts with 'df-')
        if (isValidFileId(dataValue)) {
          // Process as resource using the resource option schema
          parent[key] = await processor(dataValue, resourceOption);
          return;
        }
      }

      // If not a fileId or no resource option found, keep original value
      parent[key] = dataValue;
      return;
    }

    // Case 1: This field is marked as a resource
    if (schemaProperty.isResource) {
      if (dataValue !== undefined && dataValue !== null) {
        // Validate fileId format - if invalid, skip processing and keep original value
        if (!isValidFileId(dataValue)) {
          // Not a valid fileId format, treat as regular value and skip resource processing
          parent[key] = dataValue;
          return;
        }
        parent[key] = await processor(dataValue, schemaProperty);
      }
      return;
    }

    // Case 2: Array type
    if (schemaProperty.type === 'array' && schemaProperty.items && Array.isArray(dataValue)) {
      // Check if array items are resources
      if (schemaProperty.items.isResource) {
        // Process each item - skip invalid fileIds
        const processed = await Promise.all(
          dataValue.map(async (item) => {
            // If item is not a valid fileId, keep original value without processing
            if (item === undefined || item === null || !isValidFileId(item)) {
              return item;
            }
            return await processor(item, schemaProperty.items!);
          }),
        );
        parent[key] = processed;
      } else if (schemaProperty.items.type === 'object' && schemaProperty.items.properties) {
        // Array of objects that might contain resources
        const processed = await Promise.all(
          dataValue.map(async (item) => {
            if (item && typeof item === 'object') {
              return await processResourcesInData(
                { type: 'object', properties: schemaProperty.items!.properties! } as JsonSchema,
                item as Record<string, unknown>,
                processor,
              );
            }
            return item;
          }),
        );
        parent[key] = processed;
      }
      return;
    }

    // Case 3: Object with nested properties
    if (
      schemaProperty.type === 'object' &&
      schemaProperty.properties &&
      dataValue &&
      typeof dataValue === 'object'
    ) {
      const nestedData = dataValue as Record<string, unknown>;
      const processedNested = { ...nestedData };

      await Promise.all(
        Object.entries(schemaProperty.properties).map(async ([nestedKey, nestedSchema]) => {
          const nestedValue = nestedData[nestedKey];
          if (nestedValue !== undefined) {
            await traverse(nestedSchema, nestedValue, nestedKey, processedNested);
          }
        }),
      );

      parent[key] = processedNested;
    }
  }

  // Process all root properties
  if (schema.properties) {
    await Promise.all(
      Object.entries(schema.properties).map(async ([key, schemaProperty]) => {
        const value = data[key];
        if (value !== undefined) {
          await traverse(schemaProperty, value, key, result);
        }
      }),
    );
  }

  return result;
}

/**
 * Create a ResourceResolver instance using DriveService
 * Note: getCurrentUser is obtained from context, not passed as dependency
 *
 * @param driveService - DriveService instance
 * @param prisma - Prisma client instance
 * @param logger - Logger instance
 * @returns ResourceResolver instance
 */
export function createResourceResolver(driveService: any, logger: Logger): ResourceResolver {
  return {
    resolveDriveFile: async (fileId: string, format: 'base64' | 'url' | 'binary' | 'text') => {
      try {
        const user = getCurrentUser();
        if (!user) {
          throw new Error('User context is required for drive file resolution');
        }

        // Get drive file details
        const driveFile = await driveService.getDriveFileDetail(user, fileId);
        if (!driveFile) {
          throw new Error(`Drive file not found: ${fileId}`);
        }

        // Handle different output formats
        switch (format) {
          case 'url': {
            // Generate signed URL for the drive file
            const urls = await driveService.generateDriveFileUrls(user, [driveFile]);
            if (!urls || urls.length === 0) {
              throw new Error(`Failed to generate URL for drive file: ${fileId}`);
            }
            return urls[0];
          }

          case 'base64': {
            // Get file stream and convert to base64
            const result = await driveService.getDriveFileStream(user, fileId);
            const base64 = result.data.toString('base64');
            return `data:${result.contentType};base64,${base64}`;
          }

          case 'binary': {
            // binary (OpenAPI standard)
            const result = await driveService.getDriveFileStream(user, fileId);
            return result.data;
          }

          default: {
            // Default to text format
            const result = await driveService.getDriveFileStream(user, fileId);
            return result.data.toString('utf-8');
          }
        }
      } catch (error) {
        logger.error(
          `Failed to resolve drive file ${fileId} (format: ${format}): ${(error as Error).message}`,
        );
        throw error;
      }
    },
  };
}

/**
 * Create a ResourceUploader instance using DriveService
 * Note: getCurrentUser and getCanvasId are obtained from context, not passed as dependencies
 *
 * @param driveService - DriveService instance
 * @param logger - Logger instance
 * @returns ResourceUploader instance
 */
export function createResourceUploader(driveService: any, logger: Logger): ResourceUploader {
  return {
    uploadFile: async (localPath: string, metadata: any) => {
      try {
        const user = getCurrentUser();
        if (!user) {
          throw new Error('User context is required for file upload');
        }

        // Read file from local path
        const buffer = await readFile(localPath);
        const filename = basename(localPath);

        // Determine MIME type
        const mimetype = metadata.mimeType || mime.getType(filename) || 'application/octet-stream';

        // Use 'agent' as source for tool-generated files
        const source = 'agent' as const;

        // Get canvas ID from request context
        const canvasId = getCanvasId();
        if (!canvasId) {
          throw new Error('Canvas ID is required in request context for file upload');
        }

        // Create drive file using DriveService
        const driveFile = await driveService.createDriveFile(user, {
          canvasId,
          name: filename,
          type: mimetype,
          source,
          content: buffer.toString('base64'),
        });

        logger.debug(`Uploaded file ${filename} to drive with fileId: ${driveFile.fileId}`);

        return {
          fileId: driveFile.fileId,
          resourceType: metadata.type,
          metadata: {
            size: buffer.length,
            mimeType: mimetype,
          },
        };
      } catch (error) {
        logger.error(
          `Failed to upload file ${localPath}: ${(error as Error).message}`,
          (error as Error).stack,
        );
        throw error;
      }
    },

    uploadBuffer: async (buffer: Buffer, filename: string, metadata: any) => {
      try {
        const user = getCurrentUser();
        if (!user) {
          throw new Error('User context is required for buffer upload');
        }

        // Determine MIME type
        const mimetype = metadata.mimeType || mime.getType(filename) || 'application/octet-stream';

        // Use 'agent' as source for tool-generated files
        const source = 'agent' as const;

        // Get canvas ID from request context
        const canvasId = getCanvasId();
        if (!canvasId) {
          throw new Error('Canvas ID is required in request context for buffer upload');
        }

        // Create drive file using DriveService
        const driveFile = await driveService.createDriveFile(user, {
          canvasId,
          name: filename,
          type: mimetype,
          source,
          content: buffer.toString('base64'),
        });

        logger.debug(`Uploaded buffer as ${filename} to drive with fileId: ${driveFile.fileId}`);

        return {
          fileId: driveFile.fileId,
          resourceType: metadata.type,
          metadata: {
            size: buffer.length,
            mimeType: mimetype,
          },
        };
      } catch (error) {
        logger.error(
          `Failed to upload buffer ${filename}: ${(error as Error).message}`,
          (error as Error).stack,
        );
        throw error;
      }
    },

    uploadFromUrl: async (url: string, filename: string, metadata: any) => {
      try {
        const user = getCurrentUser();
        if (!user) {
          throw new Error('User context is required for URL upload');
        }

        // Determine MIME type
        const mimetype = metadata.mimeType || mime.getType(filename) || 'application/octet-stream';

        // Use 'agent' as source for tool-generated files
        const source = 'agent' as const;

        // Get canvas ID from request context
        const canvasId = getCanvasId();
        if (!canvasId) {
          throw new Error('Canvas ID is required in request context for URL upload');
        }

        // Create drive file using DriveService with external URL
        const driveFile = await driveService.createDriveFile(user, {
          canvasId,
          name: filename,
          type: mimetype,
          source,
          externalUrl: url,
        });

        logger.debug(`Uploaded file from URL ${url} to drive with fileId: ${driveFile.fileId}`);

        return {
          fileId: driveFile.fileId,
          resourceType: metadata.type,
          metadata: {
            size: Number(driveFile.size),
            mimeType: mimetype,
          },
        };
      } catch (error) {
        logger.error(
          `Failed to upload from URL ${url}: ${(error as Error).message}`,
          (error as Error).stack,
        );
        throw error;
      }
    },
  };
}

/**
 * ============================================================================
 * ResourceHandler Class
 * Encapsulates all resource preprocessing and postprocessing logic
 * ============================================================================
 */

@Injectable()
export class ResourceHandler {
  private readonly logger = new Logger(ResourceHandler.name);

  constructor(
    private readonly driveService: DriveService,
    private readonly miscService: MiscService,
  ) {}

  /**
   * Preprocess input resources by traversing schema and data together
   * Automatically resolves all fields marked with isResource: true
   *
   * @param request - Handler request containing params with fileIds
   * @param schema - JSON schema with isResource markers
   * @returns Processed request with fileIds replaced by actual content
   */
  async preprocessInputResources(
    request: HandlerRequest,
    schema: JsonSchema,
  ): Promise<HandlerRequest> {
    if (!schema?.properties) {
      this.logger.debug('No schema properties to process');
      return request;
    }

    const processedParams = await processResourcesInData(
      schema,
      request.params as Record<string, unknown>,
      async (value, schemaProperty) => {
        return await this.resolveFileIdToFormat(value, schemaProperty.format || 'text');
      },
    );

    return {
      ...request,
      params: processedParams,
    };
  }

  /**
   * Postprocess output resources by traversing schema and data together
   * Upload generated resources to DriveService and replace with fileIds
   *
   * Handles two cases:
   * 1. Direct binary response: response.data is { buffer, filename, mimetype }
   * 2. Structured response: response.data contains fields marked with isResource in schema
   *
   * @param response - Handler response containing resource content
   * @param request - Original handler request (for metadata)
   * @param schema - Response schema with isResource markers
   * @returns Processed response with content replaced by fileIds
   */
  async postprocessOutputResources(
    response: HandlerResponse,
    request: HandlerRequest,
    schema: ResponseSchema,
  ): Promise<HandlerResponse> {
    if (!response.success || !response.data) {
      return response;
    }
    // Case 1: Direct binary response from HTTP adapter
    // Response data is { buffer: Buffer, filename: string, mimetype: string }
    if (this.isDirectBinaryResponse(response.data)) {
      const uploadResult = await this.uploadResource(response.data, request);
      if (uploadResult) {
        return {
          ...response,
          data: { fileId: uploadResult.fileId },
          fileId: uploadResult.fileId,
        };
      }
      // If upload failed, return original response
      return response;
    }

    // Case 2: Structured response with schema-based resource fields
    if (!schema?.properties) {
      this.logger.debug('No schema properties to process');
      return response;
    }

    const processedData = await processResourcesInData(
      schema as JsonSchema,
      response.data as Record<string, unknown>,
      async (value) => {
        // Upload the resource and return fileId reference
        const result = await this.uploadResource(value, request);
        return result ? { fileId: result.fileId } : value;
      },
    );

    return {
      ...response,
      data: processedData,
    };
  }

  /**
   * Check if response data is a direct binary response from HTTP adapter
   * Binary responses have the shape: { buffer: Buffer, filename: string, mimetype: string }
   */
  private isDirectBinaryResponse(data: unknown): boolean {
    return (
      typeof data === 'object' &&
      data !== null &&
      'buffer' in data &&
      'filename' in data &&
      'mimetype' in data &&
      Buffer.isBuffer((data as any).buffer)
    );
  }

  /**
   * Infer resource type from MIME type
   */
  private inferResourceType(mimeType: string): ToolResourceType {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('text/') || mimeType.includes('json') || mimeType.includes('xml')) {
      return 'document';
    }
    if (mimeType.includes('pdf') || mimeType.includes('word') || mimeType.includes('document')) {
      return 'document';
    }
    return 'document'; // Default fallback
  }

  /**
   * Upload a resource value to DriveService
   * @param value - Resource content (Buffer, base64, URL, etc.)
   * @param _request - Original handler request for metadata (unused but kept for signature compatibility)
   * @returns Upload result with fileId
   */
  private async uploadResource(
    value: unknown,
    _request: HandlerRequest,
  ): Promise<UploadResult | null> {
    try {
      const user = getCurrentUser();
      const canvasId = getCanvasId();
      // Handle different value types
      if (Buffer.isBuffer(value)) {
        // Step 1: Upload buffer to object storage via MiscService
        const uploadResult = await this.miscService.uploadFile(user, {
          file: {
            buffer: value,
            mimetype: 'application/octet-stream',
            originalname: `resource-${Date.now()}.bin`,
          },
          visibility: 'private',
        });

        // Step 2: Create DriveFile with the storageKey
        const driveFile = await this.driveService.createDriveFile(user, {
          canvasId,
          name: `resource-${Date.now()}.bin`,
          storageKey: uploadResult.storageKey,
          source: 'agent',
        });

        return {
          fileId: driveFile.fileId,
          resourceType: this.inferResourceType(driveFile.type),
          metadata: {
            size: Number(driveFile.size),
            mimeType: driveFile.type,
          },
        };
      }

      if (typeof value === 'string') {
        // Could be base64, URL, or file path
        if (value.startsWith('data:')) {
          // Base64 data URL
          const matches = value.match(/^data:([^;]+);base64,(.+)$/);
          if (matches) {
            const [, mimeType, base64Data] = matches;
            const driveFile = await this.driveService.createDriveFile(user, {
              canvasId,
              name: `resource-${Date.now()}.${mime.getExtension(mimeType) || 'bin'}`,
              type: mimeType,
              content: base64Data,
              source: 'agent',
            });
            return {
              fileId: driveFile.fileId,
              resourceType: this.inferResourceType(driveFile.type),
              metadata: {
                size: Number(driveFile.size),
                mimeType: driveFile.type,
              },
            };
          }
        } else if (value.startsWith('http://') || value.startsWith('https://')) {
          // External URL
          const driveFile = await this.driveService.createDriveFile(user, {
            canvasId,
            name: `resource-${Date.now()}.bin`,
            externalUrl: value,
            source: 'agent',
          });
          return {
            fileId: driveFile.fileId,
            resourceType: this.inferResourceType(driveFile.type),
            metadata: {
              size: Number(driveFile.size),
              mimeType: driveFile.type,
            },
          };
        }
      }

      // Handle object with buffer property
      if (value && typeof value === 'object') {
        const obj = value as any;
        if (obj.buffer && Buffer.isBuffer(obj.buffer)) {
          const mimeType = obj.mimetype;
          const filename = obj.filename;
          try {
            // Step 1: Upload buffer to object storage via MiscService
            const uploadResult = await this.miscService.uploadFile(user, {
              file: {
                buffer: obj.buffer,
                mimetype: mimeType,
                originalname: filename,
              },
              visibility: 'private',
            });

            this.logger.log(`[DEBUG] Uploaded to storage, storageKey: ${uploadResult.storageKey}`);

            // Step 2: Create DriveFile with the storageKey
            const driveFile = await this.driveService.createDriveFile(user, {
              canvasId,
              name: filename,
              storageKey: uploadResult.storageKey,
              source: 'agent',
            });

            this.logger.log(
              `[DEBUG] Created DriveFile, fileId: ${driveFile.fileId}, size: ${driveFile.size}, type: ${driveFile.type}`,
            );

            return {
              fileId: driveFile.fileId,
              resourceType: this.inferResourceType(driveFile.type),
              metadata: {
                size: Number(driveFile.size),
                mimeType: driveFile.type,
              },
            };
          } catch (debugError) {
            this.logger.error(
              `[DEBUG] Error during upload process: ${(debugError as Error).message}`,
            );
            throw debugError;
          }
        }
      }
      return null;
    } catch (error) {
      this.logger.error(`Failed to upload resource: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Resolve fileId to specified format
   * @param value - String fileId or object with fileId property
   * @param format - Output format (base64/url/binary/text, or legacy 'buffer')
   * @param fieldPath - Field path for logging
   * @returns Resolved content in specified format
   */
  private async resolveFileIdToFormat(value: unknown, format: string): Promise<string | Buffer> {
    // Extract fileId from value
    const fileId = typeof value === 'string' ? value : (value as any)?.fileId;
    if (!fileId) {
      throw new Error('Invalid resource value: missing fileId');
    }

    // Get user context
    const user = getCurrentUser();
    if (!user) {
      throw new Error('User context is required for file resolution');
    }

    this.logger.debug(`Resolving fileId ${fileId} to format: ${format}`);

    // Get drive file details
    const driveFile = await this.driveService.getDriveFileDetail(user, fileId);
    if (!driveFile) {
      throw new Error(`Drive file not found: ${fileId}`);
    }

    // Convert to specified format
    switch (format) {
      case 'url': {
        const urls = await this.driveService.generateDriveFileUrls(user, [driveFile]);
        if (!urls || urls.length === 0) {
          throw new Error(`Failed to generate URL for drive file: ${fileId}`);
        }
        return urls[0];
      }

      case 'base64': {
        const result = await this.driveService.getDriveFileStream(user, fileId);
        const base64 = result.data.toString('base64');
        return `data:${result.contentType};base64,${base64}`;
      }

      case 'text': {
        const result = await this.driveService.getDriveFileStream(user, fileId);
        return result.data.toString('utf-8');
      }

      case 'binary':
      case 'buffer': {
        // binary (OpenAPI standard) or buffer (legacy, kept for backward compatibility)
        const result = await this.driveService.getDriveFileStream(user, fileId);
        return result.data;
      }

      default: {
        // Default to binary format
        const result = await this.driveService.getDriveFileStream(user, fileId);
        return result.data;
      }
    }
  }
}
