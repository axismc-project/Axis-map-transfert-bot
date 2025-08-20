import axios, { AxiosInstance } from 'axios';
import { ServerConfig, PterodactylResponse, FileObject } from '../types/index.js';
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
      },
      timeout: 30000
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
    try {
      const formattedCommand = `tellraw @a {"text":"${message}","color":"yellow","bold":true}`;
      await this.sendCommand(formattedCommand);
    } catch (error) {
      Logger.warning(`Impossible d'envoyer la notification au serveur ${this.config.serverId}`, error);
      // Ne pas faire échouer le transfert si la notification échoue
    }
  }

  async sendTransferNotification(seconds: number = 10): Promise<void> {
    const message = `§6§l[TRANSFERT] §r§eTransfert de map en cours dans ${seconds} secondes...`;
    await this.sendFormattedMessage(message);
  }

  async setPowerState(action: 'start' | 'stop' | 'restart' | 'kill'): Promise<void> {
    try {
      Logger.info(`🔄 ${action.toUpperCase()} du serveur ${this.config.serverId}...`);
      
      await this.client.post(`/servers/${this.config.serverId}/power`, {
        signal: action
      });

      Logger.success(`✅ Commande ${action} envoyée avec succès`);
      
    } catch (error: any) {
      Logger.error(`❌ Erreur lors du ${action}`, error.response?.data || error.message);
      
      // Si c'est un conflit d'état (409), on ignore l'erreur
      if (error.response?.status === 409) {
        Logger.warning(`⚠️  Conflit d'état ignoré pour ${action} - le serveur est peut-être déjà dans l'état souhaité`);
        return;
      }
      
      throw new Error(`Impossible de ${action} le serveur: ${error.response?.data?.errors?.[0]?.detail || error.message}`);
    }
  }

  async waitForServerState(targetState: 'offline' | 'running', maxWaitTime: number = 30000): Promise<void> {
    Logger.info(`⏳ Attente de ${maxWaitTime/1000} secondes pour que le serveur ${this.config.serverId} atteigne l'état "${targetState}"...`);
    
    // Attendre simplement le délai fixe
    await new Promise(resolve => setTimeout(resolve, maxWaitTime));
    
    Logger.success(`✅ Délai d'attente terminé pour le serveur ${this.config.serverId} (supposé ${targetState})`);
  }

  async compressFolder(folderPath: string): Promise<string> {
    try {
      Logger.info(`📦 Compression du dossier: ${folderPath}`);
      
      const response = await this.client.post<PterodactylResponse<FileObject>>(`/servers/${this.config.serverId}/files/compress`, {
        root: '/',
        files: [folderPath]
      });

      // Récupérer le vrai nom du fichier depuis la réponse de l'API
      const archiveName = response.data.attributes.name;
      
      Logger.success(`✅ Compression terminée: ${archiveName}`);
      Logger.info(`📊 Taille de l'archive: ${Math.round(response.data.attributes.size / 1024 / 1024)} MB`);
      
      return archiveName;
    } catch (error: any) {
      Logger.error(`❌ Erreur lors de la compression`, error.response?.data || error.message);
      throw new Error(`Impossible de compresser ${folderPath}: ${error.response?.data?.errors?.[0]?.detail || error.message}`);
    }
  }

  async deleteFile(filePath: string): Promise<void> {
    try {
      Logger.info(`🗑️  Suppression du fichier: ${filePath}`);
      
      await this.client.post(`/servers/${this.config.serverId}/files/delete`, {
        root: '/',
        files: [filePath]
      });

      Logger.success(`✅ Fichier supprimé: ${filePath}`);
    } catch (error: any) {
      Logger.error(`❌ Erreur lors de la suppression`, error.response?.data || error.message);
      throw new Error(`Impossible de supprimer ${filePath}: ${error.response?.data?.errors?.[0]?.detail || error.message}`);
    }
  }

  async deleteFolder(folderPath: string): Promise<void> {
    try {
      Logger.info(`🗑️  Suppression du dossier: ${folderPath}`);
      
      await this.client.post(`/servers/${this.config.serverId}/files/delete`, {
        root: '/',
        files: [folderPath]
      });

      Logger.success(`✅ Dossier supprimé: ${folderPath}`);
    } catch (error: any) {
      Logger.error(`❌ Erreur lors de la suppression du dossier`, error.response?.data || error.message);
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
      Logger.error(`❌ Erreur lors de la liste des fichiers`, error.response?.data || error.message);
      throw new Error(`Impossible de lister les fichiers: ${error.response?.data?.errors?.[0]?.detail || error.message}`);
    }
  }

  async extractArchive(archivePath: string, destination: string = '/'): Promise<void> {
    try {
      Logger.info(`📂 Extraction de l'archive: ${archivePath} vers ${destination}`);
      
      await this.client.post(`/servers/${this.config.serverId}/files/decompress`, {
        root: destination,
        file: archivePath
      });

      Logger.success(`✅ Archive extraite avec succès`);
    } catch (error: any) {
      Logger.error(`❌ Erreur lors de l'extraction`, error.response?.data || error.message);
      throw new Error(`Impossible d'extraire ${archivePath}: ${error.response?.data?.errors?.[0]?.detail || error.message}`);
    }
  }

  async renameFile(oldName: string, newName: string): Promise<void> {
    try {
      Logger.info(`📝 Renommage: ${oldName} → ${newName}`);
      
      await this.client.put(`/servers/${this.config.serverId}/files/rename`, {
        root: '/',
        files: [{
          from: oldName,
          to: newName
        }]
      });

      Logger.success(`✅ Fichier renommé avec succès`);
    } catch (error: any) {
      Logger.error(`❌ Erreur lors du renommage`, error.response?.data || error.message);
      throw new Error(`Impossible de renommer ${oldName}: ${error.response?.data?.errors?.[0]?.detail || error.message}`);
    }
  }
}