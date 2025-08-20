import SftpClient from 'ssh2-sftp-client';
import { ServerConfig } from '../types/index.js';
import { Logger } from '../utils/logger.js';
import * as fs from 'fs-extra';
import * as path from 'path';
import { Readable } from 'stream';

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
        readyTimeout: 30000,
        retries: 3
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

  async downloadFile(remotePath: string, localPath: string, onProgress?: (progress: number) => void): Promise<void> {
    try {
      Logger.info(`Téléchargement: ${remotePath} → ${localPath}`);
      
      // Créer le dossier local si nécessaire
      await fs.ensureDir(path.dirname(localPath));
      
      // Téléchargement avec suivi de progression basique
      await this.client.fastGet(remotePath, localPath);
      
      if (onProgress) {
        onProgress(100); // Progression simplifiée
      }

      Logger.success(`Téléchargement terminé: ${localPath}`);
    } catch (error: any) {
      Logger.error(`Erreur lors du téléchargement`, error.message);
      throw new Error(`Impossible de télécharger ${remotePath}: ${error.message}`);
    }
  }

  async uploadFile(localPath: string, remotePath: string, onProgress?: (progress: number) => void): Promise<void> {
    try {
      Logger.info(`Upload: ${localPath} → ${remotePath}`);
      
      // Vérifier que le fichier local existe
      if (!await fs.pathExists(localPath)) {
        throw new Error(`Fichier local introuvable: ${localPath}`);
      }

      // Upload avec suivi de progression basique
      await this.client.fastPut(localPath, remotePath);
      
      if (onProgress) {
        onProgress(100); // Progression simplifiée
      }

      Logger.success(`Upload terminé: ${remotePath}`);
    } catch (error: any) {
      Logger.error(`Erreur lors de l'upload`, error.message);
      throw new Error(`Impossible d'uploader ${localPath}: ${error.message}`);
    }
  }

  async transferFileDirect(sourceService: SftpService, remotePath: string, destinationPath: string, onProgress?: (progress: number) => void): Promise<void> {
    try {
      Logger.info(`Transfert direct: ${remotePath} → ${destinationPath}`);
      
      // Créer un fichier temporaire local pour le transfert
      const tempDir = process.env.TEMP_CACHE_PATH || '/tmp';
      await fs.ensureDir(tempDir);
      const tempFile = path.join(tempDir, `transfer_${Date.now()}_${path.basename(remotePath)}`);
      
      try {
        // Télécharger depuis la source
        if (onProgress) onProgress(10);
        await sourceService.downloadFile(remotePath, tempFile, (progress) => {
          if (onProgress) onProgress(Math.round(10 + progress * 0.4)); // 10-50% pour le download
        });

        if (onProgress) onProgress(50);
        
        // Uploader vers la destination
        await this.uploadFile(tempFile, destinationPath, (progress) => {
          if (onProgress) onProgress(Math.round(50 + progress * 0.5)); // 50-100% pour l'upload
        });

        Logger.success(`Transfert direct terminé`);
      } finally {
        // Nettoyer le fichier temporaire
        try {
          await fs.remove(tempFile);
          Logger.debug(`Fichier temporaire supprimé: ${tempFile}`);
        } catch (cleanupError) {
          Logger.warning(`Impossible de supprimer le fichier temporaire`, cleanupError);
        }
      }
    } catch (error: any) {
      Logger.error(`Erreur lors du transfert direct`, error.message);
      throw new Error(`Transfert direct échoué: ${error.message}`);
    }
  }

  async downloadFolder(remotePath: string, localPath: string): Promise<void> {
    try {
      Logger.info(`Téléchargement du dossier: ${remotePath} → ${localPath}`);
      
      await fs.ensureDir(localPath);
      await this.client.downloadDir(remotePath, localPath);
      
      Logger.success(`Dossier téléchargé: ${localPath}`);
    } catch (error: any) {
      Logger.error(`Erreur lors du téléchargement du dossier`, error.message);
      throw new Error(`Impossible de télécharger le dossier ${remotePath}: ${error.message}`);
    }
  }

  async uploadFolder(localPath: string, remotePath: string): Promise<void> {
    try {
      Logger.info(`Upload du dossier: ${localPath} → ${remotePath}`);
      
      await this.client.uploadDir(localPath, remotePath);
      
      Logger.success(`Dossier uploadé: ${remotePath}`);
    } catch (error: any) {
      Logger.error(`Erreur lors de l'upload du dossier`, error.message);
      throw new Error(`Impossible d'uploader le dossier ${localPath}: ${error.message}`);
    }
  }

  async fileExists(remotePath: string): Promise<boolean> {
    try {
      await this.client.stat(remotePath);
      return true;
    } catch (error) {
      return false;
    }
  }

  async deleteFile(remotePath: string): Promise<void> {
    try {
      Logger.info(`Suppression SFTP: ${remotePath}`);
      await this.client.delete(remotePath);
      Logger.success(`Fichier supprimé via SFTP`);
    } catch (error: any) {
      Logger.error(`Erreur lors de la suppression SFTP`, error.message);
      throw new Error(`Impossible de supprimer via SFTP ${remotePath}: ${error.message}`);
    }
  }
}