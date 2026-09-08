import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { Client, Connection } from '@temporalio/client';
import { SEARCH_ATTRIBUTE_TYPES } from '@claims/shared';
import { apiConfig } from '../config';

/**
 * Owns the Temporal client connection.
 *
 * Everything the API knows about a claim comes from Temporal through this client — there is no
 * database and no in-memory claim registry.
 */
@Injectable()
export class TemporalService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(TemporalService.name);
  private connection?: Connection;
  private clientInstance?: Client;

  get client(): Client {
    if (!this.clientInstance) {
      throw new Error('Temporal client is not connected yet');
    }
    return this.clientInstance;
  }

  async onModuleInit(): Promise<void> {
    this.connection = await this.connectWithRetry();
    this.clientInstance = new Client({
      connection: this.connection,
      namespace: apiConfig.namespace,
    });
    this.logger.log(
      `Connected to Temporal at ${apiConfig.temporalAddress} (namespace "${apiConfig.namespace}")`,
    );
    await this.ensureSearchAttributes();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.connection?.close().catch(() => undefined);
  }

  /**
   * Registers the demo's custom search attributes. Safe to call repeatedly: attributes that
   * already exist (e.g. registered by `temporal server start-dev --search-attribute ...`) are
   * simply skipped.
   */
  async ensureSearchAttributes(): Promise<{ created: string[]; existing: string[] }> {
    const created: string[] = [];
    const existing: string[] = [];
    const indexedValueType = { Keyword: 2, Double: 4 } as const;
    for (const [name, type] of Object.entries(SEARCH_ATTRIBUTE_TYPES)) {
      try {
        await this.connection!.operatorService.addSearchAttributes({
          namespace: apiConfig.namespace,
          searchAttributes: { [name]: indexedValueType[type] },
        });
        created.push(name);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/already exists/i.test(message)) {
          existing.push(name);
        } else {
          this.logger.warn(`Could not register search attribute ${name}: ${message}`);
        }
      }
    }
    if (created.length > 0) {
      this.logger.log(`Registered search attributes: ${created.join(', ')}`);
    }
    return { created, existing };
  }

  private async connectWithRetry(attempts = 30, delayMs = 2_000): Promise<Connection> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await Connection.connect({
          address: apiConfig.temporalAddress,
          connectTimeout: '5s',
        });
      } catch (error) {
        lastError = error;
        this.logger.warn(
          `Temporal not reachable at ${apiConfig.temporalAddress} (attempt ${attempt}/${attempts}) — retrying`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    throw new Error(`Unable to connect to Temporal at ${apiConfig.temporalAddress}: ${lastError}`);
  }
}
