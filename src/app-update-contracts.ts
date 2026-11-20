import type {} from 'cordis';

/**
 * Android in-app update discovery contract.
 *
 * Publishes latest APK release metadata from a server-managed JSON manifest
 * (`FITNESS_APP_RELEASES_FILE`). Only HTTPS `apkUrl` destinations are accepted.
 */

export interface AndroidReleaseInfo {
  readonly schemaVersion: '1.0';
  readonly versionCode: number;
  readonly versionName: string;
  readonly minSupportedVersionCode: number;
  readonly apkUrl: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly releaseNotes: readonly string[];
  readonly publishedAt: string;
  readonly mandatory: boolean;
  /** Present only when caller supplies `currentVersionCode`. */
  readonly updateAvailable?: boolean;
}

export interface FitnessAppUpdates {
  latestAndroid(currentVersionCode?: number): Promise<AndroidReleaseInfo>;
}

declare module 'cordis' {
  interface Context {
    fitnessAppUpdates: FitnessAppUpdates;
  }
}
