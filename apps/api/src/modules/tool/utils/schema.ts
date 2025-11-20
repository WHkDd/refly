/**
 * Schema utilities
 * Handles JSON schema parsing, validation, and conversion to Zod schemas
 */

import { JSONSchemaToZod } from '@dmitryrechkin/json-schema-to-zod';
import type { JsonSchema } from '@refly/openapi-schema';
import type { z } from 'zod';

/**
 * Convert JSON schema to Zod schema
 * Uses @dmitryrechkin/json-schema-to-zod for runtime conversion
 * @param schema - JSON schema object
 * @returns Zod schema for validation
 */
export function jsonSchemaToZod(schema: JsonSchema): z.ZodTypeAny {
  if (schema.type !== 'object') {
    throw new Error('Root schema must be of type "object"');
  }

  try {
    return JSONSchemaToZod.convert(schema);
  } catch (error) {
    throw new Error(`Failed to convert JSON schema to Zod: ${(error as Error).message}`);
  }
}

/**
 * Parse JSON schema string to object
 * @param schemaJson - JSON schema as string
 * @returns Parsed JSON schema object
 */
export function parseJsonSchema(schemaJson: string): JsonSchema {
  try {
    const schema = JSON.parse(schemaJson);

    if (typeof schema !== 'object' || schema === null) {
      throw new Error('Schema must be an object');
    }

    // Don't enforce object type here - let the caller decide validation
    return schema as JsonSchema;
  } catch (error) {
    throw new Error(`Invalid JSON schema: ${(error as Error).message}`);
  }
}

/**
 * Validate JSON schema structure
 * @param schema - JSON schema to validate
 * @returns True if valid
 * @throws Error if invalid
 */
export function validateJsonSchema(schema: JsonSchema): boolean {
  if (schema.type !== 'object') {
    throw new Error('Root schema must be of type "object"');
  }

  if (!schema.properties || typeof schema.properties !== 'object') {
    throw new Error('Schema must have properties field');
  }

  // Basic validation - detailed validation is handled by the converter
  return true;
}

/**
 * Build Zod schema from JSON schema string
 * Combines parsing, validation, and conversion in one function
 * @param schemaJson - JSON schema as string
 * @returns Zod schema for validation
 * @throws Error if schema is invalid or conversion fails
 */
export function buildSchema(schemaJson: string): z.ZodTypeAny {
  // Parse JSON schema
  const jsonSchema = parseJsonSchema(schemaJson);

  // Validate schema structure
  validateJsonSchema(jsonSchema);

  // Convert to Zod schema
  return jsonSchemaToZod(jsonSchema);
}
