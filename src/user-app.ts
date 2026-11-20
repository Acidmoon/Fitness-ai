import { PostgresPlugin } from './plugins/postgres.ts';
import { UserDataProtectionPlugin } from './plugins/user-data-protection.ts';
import { UserDatabasePlugin } from './plugins/user-database.ts';
import { WorkoutHistoryPlugin } from './plugins/workout-history.ts';
import { WearablesPlugin } from './plugins/wearables.ts';
import { SkeletonPreviewPlugin } from './plugins/skeleton-preview.ts';

/** Independent backend capabilities; enable only after explicit provisioning. */
export const userDatabasePlugins = [
  UserDatabasePlugin, UserDataProtectionPlugin, PostgresPlugin, WorkoutHistoryPlugin, WearablesPlugin, SkeletonPreviewPlugin,
];
