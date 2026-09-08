/**
 * Registers the demo's custom search attributes against a running Temporal server.
 *
 * Not needed when the dev server is started via `npm run temporal` (the flags there register them
 * already), but handy for other Temporal deployments.
 */
import { Connection } from '@temporalio/client';
import { SEARCH_ATTRIBUTE_TYPES } from '@claims/shared';
import { apiConfig } from '../config';

const INDEXED_VALUE_TYPE = { Keyword: 2, Double: 4 } as const;

async function main(): Promise<void> {
  const connection = await Connection.connect({ address: apiConfig.temporalAddress });
  try {
    for (const [name, type] of Object.entries(SEARCH_ATTRIBUTE_TYPES)) {
      try {
        await connection.operatorService.addSearchAttributes({
          namespace: apiConfig.namespace,
          searchAttributes: { [name]: INDEXED_VALUE_TYPE[type] },
        });
        console.log(`registered ${name} (${type})`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/already exists/i.test(message)) {
          console.log(`ok       ${name} (already registered)`);
        } else {
          console.error(`failed   ${name}: ${message}`);
          process.exitCode = 1;
        }
      }
    }
  } finally {
    await connection.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
