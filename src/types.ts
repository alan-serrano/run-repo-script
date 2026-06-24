export interface RunConfig {
  repoTarget: string;
  script?: string;
  runner?: string;
  dangerouslySkipConfirmation: boolean;
  help: boolean;
  forwardArgs: string[];
}

export interface DiscoveryResult {
  absolutePath: string;
  relativePath: string;
}

export interface ResolvedRepoTarget {
  owner: string;
  repo: string;
  ref?: string;
  cloneUrl: string;
}

export interface FetchResult {
  workspaceDir: string;
  resolvedTarget: ResolvedRepoTarget;
}

export type SupportedRunner = 'node' | 'bash' | 'zx';

export interface ExecuteOptions {
  repoRoot: string;
  script: DiscoveryResult;
  runnerOverride?: string;
  dangerouslySkipConfirmation: boolean;
  forwardArgs: string[];
}
