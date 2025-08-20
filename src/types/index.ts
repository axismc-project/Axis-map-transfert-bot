export interface ServerConfig {
  baseUrl: string;
  apiKey: string;
  serverId: string;
  sftpHost: string;
  sftpPort: number;
  sftpUser: string;
  sftpPassword: string;
  worldPath: string;
}

export interface TransferProgress {
  step: string;
  progress: number;
  status: 'pending' | 'running' | 'completed' | 'error';
  message: string;
  timestamp: Date;
}

export interface PterodactylResponse<T = any> {
  object: string;
  attributes: T;
}

export interface ServerStatus {
  current_state: 'offline' | 'starting' | 'running' | 'stopping';
}

export interface FileObject {
  name: string;
  size: number;
  is_file: boolean;
  mimetype: string;
  modified_at: string;
}

// Export de ProgressTracker depuis progress.ts
export { ProgressTracker } from '../utils/progress.js';