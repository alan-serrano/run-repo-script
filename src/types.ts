export interface RunConfig {
  repoTarget: string;
  script?: string;
  runner?: string;
  yes: boolean;
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
