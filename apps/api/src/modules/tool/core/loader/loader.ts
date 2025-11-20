/**
 * Configuration loader implementation
 * Loads tool configurations from database structure (Toolset + ToolMethod)
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma.service';
import type { ToolsetConfig } from '@refly/openapi-schema';
import type { IConfigLoader } from '../interfaces';

/**
 * Configuration loader service
 * Loads toolset configurations directly from database without caching
 * Version management is controlled by versionId in ToolMethod records
 */
@Injectable()
export class ConfigLoader implements IConfigLoader {
  private readonly logger = new Logger(ConfigLoader.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Mark initialization as complete (should be called after service startup)
   */
  setInitializationComplete(): void {
    this.logger.log('Configuration loader initialization complete');
  }

  /**
   * Load configuration by inventory key
   * Loads from ToolsetInventory and associated ToolMethods directly from database
   * @param inventoryKey - Toolset inventory key (e.g., 'fish_audio', 'heygen')
   */
  async loadConfig(inventoryKey: string): Promise<ToolsetConfig | null> {
    try {
      // Load from ToolsetInventory
      const inventory = await this.prisma.toolsetInventory.findFirst({
        where: {
          key: inventoryKey,
          enabled: true,
          deletedAt: null,
        },
        include: {
          methods: {
            where: {
              enabled: true,
              deletedAt: null,
            },
            orderBy: {
              versionId: 'desc',
            },
          },
        },
      });

      if (!inventory) {
        this.logger.warn(`No inventory found for key: ${inventoryKey}`);
        return null;
      }

      // Filter to keep only the latest version of each method (by name)
      const methodMap = new Map<string, (typeof inventory.methods)[0]>();
      for (const method of inventory.methods) {
        if (!methodMap.has(method.name)) {
          methodMap.set(method.name, method);
        }
      }
      const methods = Array.from(methodMap.values()).sort((a, b) => a.name.localeCompare(b.name));

      if (methods.length === 0) {
        this.logger.warn(`No methods found for inventory key: ${inventoryKey}`);
        return null;
      }

      // Load API key from inventory
      const apiKey = inventory.apiKey || '';

      // Build ToolsetConfig from inventory and methods
      const config: ToolsetConfig = {
        inventoryKey,
        domain: inventory.domain,
        name: inventory.name,
        credentials: apiKey ? { apiKey } : undefined,
        methods: methods.map((method) => {
          // Parse adapter config if present
          let adapterConfig: Record<string, unknown> = {};
          try {
            if (method.adapterConfig) {
              adapterConfig = JSON.parse(method.adapterConfig);
            }
          } catch (error) {
            this.logger.warn(
              `Failed to parse adapterConfig for method ${method.name}: ${(error as Error).message}`,
            );
          }

          return {
            name: method.name,
            version: Number(method.versionId),
            description: method.description,
            endpoint: method.endpoint,
            method: method.httpMethod as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
            schema: method.requestSchema,
            responseSchema: method.responseSchema,
            useSdk: method.adapterType === 'sdk',
            timeout: 30000, // Default timeout
            useFormData: adapterConfig.useFormData as boolean | undefined,
          };
        }),
      };

      this.logger.log(`Loaded config for ${inventoryKey}, methods: ${methods.length}`);
      return config;
    } catch (error) {
      this.logger.error(
        `Failed to load config for ${inventoryKey}: ${(error as Error).message}`,
        (error as Error).stack,
      );
      return null;
    }
  }

  /**
   * Load all active toolset configurations from inventory
   * @param type - Optional filter by authType (e.g., 'config_based')
   */
  async loadAllConfigs(type: string): Promise<ToolsetConfig[]> {
    try {
      // Load all enabled inventory items
      const inventoryItems = await this.prisma.toolsetInventory.findMany({
        where: {
          enabled: true,
          deletedAt: null,
          type: type || undefined,
        },
      });

      const configs: ToolsetConfig[] = [];

      for (const inventory of inventoryItems) {
        try {
          const config = await this.loadConfig(inventory.key);
          if (config) {
            configs.push(config);
          }
        } catch (error) {
          this.logger.error(
            `Failed to load config for ${inventory.key}: ${(error as Error).message}`,
          );
        }
      }

      this.logger.log(
        `Loaded ${configs.length} toolset configurations from inventory${type ? ` with type=${type}` : ''}`,
      );
      return configs;
    } catch (error) {
      this.logger.error(
        `Failed to load all configs: ${(error as Error).message}`,
        (error as Error).stack,
      );
      return [];
    }
  }

  /**
   * Reload configuration (load fresh from database)
   * @param inventoryKey - Toolset inventory key
   */
  async reloadConfig(inventoryKey: string): Promise<ToolsetConfig | null> {
    this.logger.log(`Reloading config for ${inventoryKey}`);
    return this.loadConfig(inventoryKey);
  }

  /**
   * Clear all cached configurations (no-op since we don't use cache)
   */
  clearCache(): void {
    this.logger.log('Clear cache called (no-op without caching)');
  }
}
