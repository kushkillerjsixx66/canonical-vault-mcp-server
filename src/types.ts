export enum ResponseFormat {
  MARKDOWN = "markdown",
  JSON = "json",
}

export interface GitHubContentItem {
  name: string;
  path: string;
  sha: string;
  size: number;
  type: "file" | "dir" | "symlink" | "submodule";
  html_url: string | null;
}

export interface GitHubFileContent extends GitHubContentItem {
  content?: string;
  encoding?: string;
}

export interface GitHubCommitSummary {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: { name: string; email: string; date: string } | null;
  };
  author: { login: string } | null;
}

export interface GitHubCommitDetail extends GitHubCommitSummary {
  stats?: { additions: number; deletions: number; total: number };
  files?: Array<{
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    changes: number;
    patch?: string;
  }>;
}

export interface GitHubContentPutResponse {
  content: GitHubFileContent | null;
  commit: {
    sha: string;
    html_url: string;
    message: string;
  };
}

export interface GitHubPullRequest {
  number: number;
  html_url: string;
  title: string;
  state: string;
  head: { ref: string };
  base: { ref: string };
}

export interface GitHubCodeSearchResult {
  total_count: number;
  incomplete_results: boolean;
  items: Array<{
    name: string;
    path: string;
    sha: string;
    html_url: string;
    repository: { full_name: string };
  }>;
}
