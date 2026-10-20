import { PostgresPlugin } from './plugins/postgres.ts';
import { UserDataProtectionPlugin } from './plugins/user-data-protection.ts';
import { UserDatabasePlugin } from './plugins/user-database.ts';

/** Independent backend capabilities; enable only after explicit provisioning. */
export const userDatabasePlugins = [UserDatabasePlugin, UserDataProtectionPlugin, PostgresPlugin];
