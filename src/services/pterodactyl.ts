import axios, { AxiosInstance } from 'axios';
import { ServerConfig, PterodactylResponse, ServerStatus, FileObject } from '../types/index.js';
import { Logger } from '../utils/logger.js';

export class PterodactylService {
  private client: AxiosInstance;
  private config: ServerConfig;

  constructor(config: ServerConfig) {
    this.config = config;
    this.client = axios.create({
      baseURL: `${config.baseUrl}/api/client`,
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
  }

  async sendCommand(command: string): Promise<void> {
    try {
      Logger.info(`Envoi de commande vers ${this.config.serverId}: ${command}`);
      
      await this.client.post(`/servers/${this.config.serverId}/command`, {
        command: command
      });

      Logger.success(`Commande envoyée avec succès`);
    } catch (error: any) {
      Logger.error(`Erreur lors de l'envoi de commande`, error.response?.data || error.message);
      throw new Error(`Impossible d'envoyer la commande: ${error.response?.data?.errors?.[0]?.detail || error.message}`);
    }
  }

  async sendFormattedMessage(message: string): Promise<void> {
    const formattedCommand = `tellraw @a {"text":"${message}","color":"yellow","bold":true}`;
    await this.sendCommand(formattedCommand);
  }

  async sendTransferNotification(seconds: number = 10): Promise<void> {
    const message = `§6§l[TRANSFERT] §r§eTransfert de map en cours dans ${seconds} secondes...`;
    await this.sendFormattedMessage(message);
  }

  async setPowerState(action: 'start' | 'stop' | 'restart' | 'kill'): Promise<void> {
    try {
      Logger.info(`Changement d'état du serveur ${this.config.serverId}: ${action}`);
      
      await this.client.post(`/servers/${this.config.serverId}/power`, {
        signal: action
      });

      Logger.success(`Action ${action} effectuée avec succès`);
    } catch (error: any) {
      Logger.error(`Erreur lors du changement d'état`, error.response?.data || error.message);
      throw new Error(`Impossible de ${action} le serveur: ${error.response?.data?.errors?.[0]?.detail || error.message}`);
    }
  }

  async waitForServerState(targetState: 'offline' | 'running', maxWaitTime: number = 60000): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      try {
        const response = await this.client.get<PterodactylResponse<ServerStatus>>(`/servers/${this.config.serverId}`);
        const currentState = response.data.attributes.current_state;
        
        Logger.debug(`État actuel du serveur: ${currentState}, attendu: ${targetState}`);
        
        if (currentState === targetState) {
          Logger.success(`Serveur ${this.config.serverId} est maintenant ${targetState}`);
          return;
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error: any) {
        Logger.warning(`Erreur lors de la vérification d'état`, error.message);
      }
    }
    
    throw new Error(`Timeout: Le serveur n'a pas atteint l'état ${targetState} dans les ${maxWaitTime/1000}s`);
  }

  async compressFolder(folderPath: string): Promise<string> {
    try {
      Logger.info(`Compression du dossier: ${folderPath}`);
      
      await this.client.post(`/servers/${this.config.serverId}/files/compress`, {
        root: '/',
        files: [folderPath]
      });

      // L'API Pterodactyl retourne généralement le nom du fichier compressé
      const archiveName = `${folderPath.replace(/[/\\]/g, '_')}_${Date.now()}.tar.gz`;
      
      Logger.success(`Compression terminée: ${archiveName}`);
      return archiveName;
    } catch (error: any) {
      Logger.error(`Erreur lors de la compression`, error.response?.data || error.message);
      throw new Error(`Impossible de compresser ${folderPath}: ${error.response?.data?.errors?.[0]?.detail || error.message}`);
    }
  }

  async deleteFile(filePath: string): Promise<void> {
    try {
      Logger.info(`Suppression du fichier: ${filePath}`);
      
      await this.client.post(`/servers/${this.config.serverId}/files/delete`, {
        root: '/',
        files: [filePath]
      });

      Logger.success(`Fichier supprimé: ${filePath}`);
    } catch (error: any) {
      Logger.error(`Erreur lors de la suppression`, error.response?.data || error.message);
      throw new Error(`Impossible de supprimer ${filePath}: ${error.response?.data?.errors?.[0]?.detail || error.message}`);
    }
  }

  async deleteFolder(folderPath: string): Promise<void> {
    try {
      Logger.info(`Suppression du dossier: ${folderPath}`);
      
      await this.client.post(`/servers/${this.config.serverId}/files/delete`, {
        root: '/',
        files: [folderPath]
      });

      Logger.success(`Dossier supprimé: ${folderPath}`);
    } catch (error: any) {
      Logger.error(`Erreur lors de la suppression du dossier`, error.response?.data || error.message);
      throw new Error(`Impossible de supprimer ${folderPath}: ${error.response?.data?.errors?.[0]?.detail || error.message}`);
    }
  }

  async listFiles(path: string = '/'): Promise<FileObject[]> {
    try {
      const response = await this.client.get<PterodactylResponse<FileObject[]>>(`/servers/${this.config.serverId}/files/list`, {
        params: { directory: path }
      });

      return response.data.attributes;
    } catch (error: any) {
      Logger.error(`Erreur lors de la liste des fichiers`, error.response?.data || error.message);
      throw new Error(`Impossible de lister les fichiers: ${error.response?.data?.errors?.[0]?.detail || error.message}`);
    }
  }

  async extractArchive(archivePath: string, destination: string = '/'): Promise<void> {
    try {
      Logger.info(`Extraction de l'archive: ${archivePath} vers ${destination}`);
      
      await this.client.post(`/servers/${this.config.serverId}/files/decompress`, {
        root: destination,
        file: archivePath
      });

      Logger.success(`Archive extraite avec succès`);
    } catch (error: any) {
      Logger.error(`Erreur lors de l'extraction`, error.response?.data || error.message);
      throw new Error(`Impossible d'extraire ${archivePath}: ${error.response?.data?.errors?.[0]?.detail || error.message}`);
    }
  }

  async renameFile(oldName: string, newName: string): Promise<void> {
    try {
      Logger.info(`Renommage: ${oldName} → ${newName}`);
      
      await this.client.put(`/servers/${this.config.serverId}/files/rename`, {
        root: '/',
        files: [{
          from: oldName,
          to: newName
        }]
      });

      Logger.success(`Fichier renommé avec succès`);
    } catch (error: any) {
      Logger.error(`Erreur lors du renommage`, error.response?.data || error.message);
      throw new Error(`Impossible de renommer ${oldName}: ${error.response?.data?.errors?.[0]?.detail || error.message}`);
    }
  }
}