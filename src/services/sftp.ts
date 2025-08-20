import SftpClient from 'ssh2-sftp-client';
import { ServerConfig } from '../types/index.js';
import { Logger } from '../utils/logger.js';
import * as fs from 'fs-extra';
import * as path from 'path';

interface TransferProgress {
  bytesTransferred: number;
  totalBytes: number;
  percentage: number;
  speed: number; // MB/s
  eta: number; // secondes restantes
}

export class SftpService {
  private client: SftpClient;
  private config: ServerConfig;

  constructor(config: ServerConfig) {
    this.config = config;
    this.client = new SftpClient();
  }

  async connect(): Promise<void> {
    try {
      Logger.info(`Connexion SFTP à ${this.config.sftpHost}:${this.config.sftpPort}`);
      
      await this.client.connect({
        host: this.config.sftpHost,
        port: this.config.sftpPort,
        username: this.config.sftpUser,
        password: this.config.sftpPassword,
        readyTimeout: 30000
      });

      Logger.success(`Connexion SFTP établie`);
    } catch (error: any) {
      Logger.error(`Erreur de connexion SFTP`, error.message);
      throw new Error(`Impossible de se connecter via SFTP: ${error.message}`);
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.client.end();
      Logger.success(`Connexion SFTP fermée`);
    } catch (error: any) {
      Logger.warning(`Erreur lors de la fermeture SFTP`, error.message);
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  private formatSpeed(bytesPerSecond: number): string {
    const mbps = bytesPerSecond / (1024 * 1024);
    return `${mbps.toFixed(2)} MB/s`;
  }

  private formatTime(seconds: number): string {
    if (seconds === Infinity || isNaN(seconds)) return '∞';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  async downloadFileWithProgress(
    remotePath: string, 
    localPath: string, 
    onProgress?: (progress: TransferProgress) => void
  ): Promise<void> {
    try {
      const fullRemotePath = `${this.config.sftpRoot}/${remotePath}`;
      Logger.info(`📥 Téléchargement: ${fullRemotePath} → ${localPath}`);
      
      // Obtenir la taille du fichier
      const stat = await this.client.stat(fullRemotePath);
      const totalBytes = stat.size;
      Logger.info(`📊 Taille du fichier: ${this.formatBytes(totalBytes)}`);
      
      // Créer le dossier local si nécessaire
      await fs.ensureDir(path.dirname(localPath));
      
      let lastTime = Date.now();
      let lastBytes = 0;
      const startTime = Date.now();
      
      // Configuration du transfert avec callback de progression
      await this.client.fastGet(fullRemotePath, localPath, {
        step: (totalTransferred: number, _chunk: number, total: number) => {
          const now = Date.now();
          const timeDiff = (now - lastTime) / 1000; // secondes
          const bytesDiff = totalTransferred - lastBytes;
          
          if (timeDiff >= 0.5) { // Mise à jour toutes les 500ms
            const speed = timeDiff > 0 ? bytesDiff / timeDiff : 0;
            const percentage = Math.round((totalTransferred / total) * 100);
            const eta = speed > 0 ? (total - totalTransferred) / speed : Infinity;
            
            const progress: TransferProgress = {
              bytesTransferred: totalTransferred,
              totalBytes: total,
              percentage: percentage,
              speed: speed,
              eta: eta
            };
            
            Logger.info(`📥 ${percentage}% - ${this.formatBytes(totalTransferred)}/${this.formatBytes(total)} - ${this.formatSpeed(speed)} - ETA: ${this.formatTime(eta)}`);
            
            if (onProgress) {
              onProgress(progress);
            }
            
            lastTime = now;
            lastBytes = totalTransferred;
          }
        }
      });

      const totalTime = (Date.now() - startTime) / 1000;
      const avgSpeed = totalBytes / totalTime;
      Logger.success(`✅ Téléchargement terminé en ${this.formatTime(totalTime)} (moy: ${this.formatSpeed(avgSpeed)})`);
      
    } catch (error: any) {
      Logger.error(`❌ Erreur lors du téléchargement`, error.message);
      throw new Error(`Impossible de télécharger ${remotePath}: ${error.message}`);
    }
  }

  async uploadFileWithProgress(
    localPath: string, 
    remotePath: string, 
    onProgress?: (progress: TransferProgress) => void
  ): Promise<void> {
    try {
      const fullRemotePath = `${this.config.sftpRoot}/${remotePath}`;
      Logger.info(`📤 Upload: ${localPath} → ${fullRemotePath}`);
      
      // Vérifier que le fichier local existe et obtenir sa taille
      if (!await fs.pathExists(localPath)) {
        throw new Error(`Fichier local introuvable: ${localPath}`);
      }
      
      const stat = await fs.stat(localPath);
      const totalBytes = stat.size;
      Logger.info(`📊 Taille du fichier: ${this.formatBytes(totalBytes)}`);
      
      let lastTime = Date.now();
      let lastBytes = 0;
      const startTime = Date.now();
      
      // Configuration du transfert avec callback de progression
      await this.client.fastPut(localPath, fullRemotePath, {
        step: (totalTransferred: number, _chunk: number, total: number) => {
          const now = Date.now();
          const timeDiff = (now - lastTime) / 1000; // secondes
          const bytesDiff = totalTransferred - lastBytes;
          
          if (timeDiff >= 0.5) { // Mise à jour toutes les 500ms
            const speed = timeDiff > 0 ? bytesDiff / timeDiff : 0;
            const percentage = Math.round((totalTransferred / total) * 100);
            const eta = speed > 0 ? (total - totalTransferred) / speed : Infinity;
            
            const progress: TransferProgress = {
              bytesTransferred: totalTransferred,
              totalBytes: total,
              percentage: percentage,
              speed: speed,
              eta: eta
            };
            
            Logger.info(`📤 ${percentage}% - ${this.formatBytes(totalTransferred)}/${this.formatBytes(total)} - ${this.formatSpeed(speed)} - ETA: ${this.formatTime(eta)}`);
            
            if (onProgress) {
              onProgress(progress);
            }
            
            lastTime = now;
            lastBytes = totalTransferred;
          }
        }
      });

      const totalTime = (Date.now() - startTime) / 1000;
      const avgSpeed = totalBytes / totalTime;
      Logger.success(`✅ Upload terminé en ${this.formatTime(totalTime)} (moy: ${this.formatSpeed(avgSpeed)})`);
      
    } catch (error: any) {
      Logger.error(`❌ Erreur lors de l'upload`, error.message);
      throw new Error(`Impossible d'uploader ${localPath}: ${error.message}`);
    }
  }

  async transferFileDirect(
    sourceService: SftpService, 
    remotePath: string, 
    destinationPath: string, 
    onProgress?: (progress: { phase: 'download' | 'upload', data: TransferProgress }) => void
  ): Promise<void> {
    try {
      const sourceFullPath = `${sourceService.config.sftpRoot}/${remotePath}`;
      const destFullPath = `${this.config.sftpRoot}/${destinationPath}`;
      
      Logger.info(`🔄 Transfert direct: ${sourceFullPath} → ${destFullPath}`);
      
      // Vérifier que le fichier source existe
      const stat = await sourceService.client.stat(sourceFullPath);
      const fileSize = stat.size;
      Logger.info(`📊 Taille du fichier: ${this.formatBytes(fileSize)}`);
      
      // Créer un fichier temporaire local pour le transfert
      const tempDir = process.env.TEMP_CACHE_PATH || '/tmp';
      await fs.ensureDir(tempDir);
      const tempFile = path.join(tempDir, `transfer_${Date.now()}_${path.basename(remotePath)}`);
      
      try {
        // Phase 1: Téléchargement depuis la source
        Logger.info(`📥 Phase 1/2: Téléchargement depuis le serveur source`);
        await sourceService.downloadFileWithProgress(remotePath, tempFile, (progress) => {
          if (onProgress) {
            onProgress({ phase: 'download', data: progress });
          }
        });
        
        // Phase 2: Upload vers la destination
        Logger.info(`📤 Phase 2/2: Upload vers le serveur destination`);
        await this.uploadFileWithProgress(tempFile, destinationPath, (progress) => {
          if (onProgress) {
            onProgress({ phase: 'upload', data: progress });
          }
        });

        Logger.success(`✅ Transfert direct terminé avec succès`);
      } finally {
        // Nettoyer le fichier temporaire
        try {
          await fs.remove(tempFile);
          Logger.debug(`🗑️ Fichier temporaire supprimé: ${tempFile}`);
        } catch (cleanupError) {
          Logger.warning(`⚠️ Impossible de supprimer le fichier temporaire`, cleanupError);
        }
      }
    } catch (error: any) {
      Logger.error(`❌ Erreur lors du transfert direct`, error.message);
      throw new Error(`Transfert direct échoué: ${error.message}`);
    }
  }

  // Méthodes de compatibilité (utilisent les versions avec progress en interne)
  async downloadFile(remotePath: string, localPath: string, onProgress?: (progress: number) => void): Promise<void> {
    await this.downloadFileWithProgress(remotePath, localPath, (progress) => {
      if (onProgress) {
        onProgress(progress.percentage);
      }
    });
  }

  async uploadFile(localPath: string, remotePath: string, onProgress?: (progress: number) => void): Promise<void> {
    await this.uploadFileWithProgress(localPath, remotePath, (progress) => {
      if (onProgress) {
        onProgress(progress.percentage);
      }
    });
  }

  async downloadFolder(remotePath: string, localPath: string): Promise<void> {
    try {
      const fullRemotePath = `${this.config.sftpRoot}/${remotePath}`;
      Logger.info(`📁 Téléchargement du dossier: ${fullRemotePath} → ${localPath}`);
      
      await fs.ensureDir(localPath);
      
      // Lister les fichiers du dossier distant
      const fileList = await this.client.list(fullRemotePath);
      
      for (const file of fileList) {
        if (file.type === 'd') {
          // Récursif pour les sous-dossiers
          const subRemotePath = `${remotePath}/${file.name}`;
          const subLocalPath = path.join(localPath, file.name);
          await this.downloadFolder(subRemotePath, subLocalPath);
        } else {
          // Télécharger le fichier
          const fileRemotePath = `${remotePath}/${file.name}`;
          const fileLocalPath = path.join(localPath, file.name);
          await this.downloadFile(fileRemotePath, fileLocalPath);
        }
      }
      
      Logger.success(`✅ Dossier téléchargé: ${localPath}`);
    } catch (error: any) {
      Logger.error(`❌ Erreur lors du téléchargement du dossier`, error.message);
      throw new Error(`Impossible de télécharger le dossier ${remotePath}: ${error.message}`);
    }
  }

  async uploadFolder(localPath: string, remotePath: string): Promise<void> {
    try {
      const fullRemotePath = `${this.config.sftpRoot}/${remotePath}`;
      Logger.info(`📁 Upload du dossier: ${localPath} → ${fullRemotePath}`);
      
      // Créer le dossier distant
      try {
        await this.client.mkdir(fullRemotePath, true);
      } catch (error) {
        // Le dossier existe peut-être déjà
      }
      
      // Lister les fichiers locaux
      const files = await fs.readdir(localPath);
      
      for (const file of files) {
        const localFilePath = path.join(localPath, file);
        const remoteFilePath = `${remotePath}/${file}`;
        const stats = await fs.stat(localFilePath);
        
        if (stats.isDirectory()) {
          // Récursif pour les sous-dossiers
          await this.uploadFolder(localFilePath, remoteFilePath);
        } else {
          // Uploader le fichier
          await this.uploadFile(localFilePath, remoteFilePath);
        }
      }
      
      Logger.success(`✅ Dossier uploadé: ${fullRemotePath}`);
    } catch (error: any) {
      Logger.error(`❌ Erreur lors de l'upload du dossier`, error.message);
      throw new Error(`Impossible d'uploader le dossier ${localPath}: ${error.message}`);
    }
  }

  async fileExists(remotePath: string): Promise<boolean> {
    try {
      const fullRemotePath = `${this.config.sftpRoot}/${remotePath}`;
      await this.client.stat(fullRemotePath);
      return true;
    } catch (error) {
      return false;
    }
  }

  async deleteFile(remotePath: string): Promise<void> {
    try {
      const fullRemotePath = `${this.config.sftpRoot}/${remotePath}`;
      Logger.info(`🗑️ Suppression SFTP: ${fullRemotePath}`);
      await this.client.delete(fullRemotePath);
      Logger.success(`✅ Fichier supprimé via SFTP`);
    } catch (error: any) {
      Logger.error(`❌ Erreur lors de la suppression SFTP`, error.message);
      throw new Error(`Impossible de supprimer via SFTP ${remotePath}: ${error.message}`);
    }
  }
}