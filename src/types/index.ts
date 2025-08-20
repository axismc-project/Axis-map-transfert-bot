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

// Interface pour les ressources du serveur (utilisée dans /resources)
export interface ServerResources {
  current_state: 'offline' | 'starting' | 'running' | 'stopping' | 'crashed';
  is_suspended: boolean;
  memory: {
    current: number;
    limit: number;
  };
  cpu: {
    current: number;
    cores: string[];
    limit: number;
  };
  disk: {
    current: number;
    limit: number;
  };
  network: {
    rx_bytes: number;
    tx_bytes: number;
  };
  uptime: number;
}

// Interface pour les détails du serveur (utilisée dans /)
export interface ServerDetails {
  current_state: 'offline' | 'starting' | 'running' | 'stopping' | 'crashed';
  server_owner: boolean;
  identifier: string;
  internal_id: number;
  uuid: string;
  name: string;
  description: string;
  limits: {
    memory: number;
    swap: number;
    disk: number;
    io: number;
    cpu: number;
    threads: string;
    oom_disabled: boolean;
  };
  invocation: string;
  docker_image: string;
  egg_features: string[];
  feature_limits: {
    databases: number;
    allocations: number;
    backups: number;
  };
  status: string | null;
  is_suspended: boolean;
  is_installing: boolean;
  is_transferring: boolean;
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