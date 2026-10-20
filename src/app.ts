import { userDatabasePlugins } from './user-app.ts';
import { ExerciseLibraryPlugin } from './plugins/exercise-library.ts';
import { CliPlugin } from './plugins/cli.ts';
import * as JsonReportPlugin from './plugins/json-report.ts';
import { AssessmentPlugin } from './plugins/assessment.ts';
import { RuleAdvicePlugin } from './plugins/rule-advice.ts';
import { RuleScoringPlugin } from './plugins/rule-scoring.ts';
import { WorkoutInputPlugin } from './plugins/workout-input.ts';
import { LocalFilePlugin } from './plugins/local-file.ts';
import { MoveNetPlugin } from './plugins/movenet.ts';
import { JointMotionPlugin } from './plugins/joint-motion.ts';
import { JsonArtifactsPlugin } from './plugins/json-artifacts.ts';
import { VideoAssessmentPlugin } from './plugins/video-assessment.ts';

/** Consumers may be listed before their providers; Cordis resolves dependencies. */
export const plugins = [
  CliPlugin,
  JsonReportPlugin,
  AssessmentPlugin,
  VideoAssessmentPlugin,
  RuleAdvicePlugin,
  RuleScoringPlugin,
  WorkoutInputPlugin,
  JointMotionPlugin,
  MoveNetPlugin,
  LocalFilePlugin,
  JsonArtifactsPlugin,
  ExerciseLibraryPlugin,
  ...(process.env.FITNESS_USERS_ENABLED === 'true' ? userDatabasePlugins : []),
];
