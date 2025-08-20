import axios, { AxiosInstance } from 'axios';
import { ServerConfig, PterodactylResponse, FileObject } from '../types/index.js';
import { Logger } from '../utils/logger.js';

export class PterodactylService {
  private client: AxiosInstance;
  private longOperationClient: AxiosInstance;
  private config: ServerConfig;

  constructor(config: ServerConfig) {
    this.config = config;
    
    // Client standard avec timeout de 60 secondes
    this.client = axios.create({
      baseURL: `${config.baseUrl}/api/client`,
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 60000 // 1 minute pour les opérations normales
    });

    // Client pour les opérations longues avec timeout de 10 minutes
    this.longOperationClient = axios.create({
      baseURL: `${config.baseUrl}/api/client`,
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 600000 // 10 minutes pour compression/extraction
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

  async waitForServerState(targetState: 'offline' | 'running', maxWaitTime: number = 45000): Promise<void> {
    Logger.info(`⏳ Attente de ${maxWaitTime/1000} secondes pour que le serveur ${this.config.serverId} atteigne l'état "${targetState}"...`);
    
    // Attendre le délai fixe
    await new Promise(resolve => setTimeout(resolve, maxWaitTime));
    
    Logger.success(`✅ Délai d'attente terminé pour le serveur ${this.config.serverId} (supposé ${targetState})`);
  }

  async compressFolder(folderPath: string): Promise<string> {
    try {
      Logger.info(`📦 Compression du dossier: ${folderPath} (timeout: 10 minutes)`);
      
      const startTime = Date.now();
      const response = await this.longOperationClient.post<PterodactylResponse<FileObject>>(`/servers/${this.config.serverId}/files/compress`, {
        root: '/',
        files: [folderPath]
      });

      const endTime = Date.now();
      const duration = Math.round((endTime - startTime) / 1000);

      // Récupérer le vrai nom du fichier depuis la réponse de l'API
      const archiveName = response.data.attributes.name;
      
      Logger.success(`✅ Compression terminée en ${duration}s: ${archiveName}`);
      Logger.info(`📊 Taille de l'archive: ${Math.round(response.data.attributes.size / 1024 / 1024)} MB`);
      
      return archiveName;
    } catch (error: any) {
      Logger.error(`❌ Erreur lors de la compression`, error.response?.data || error.message);
      
      if (error.code === 'ECONNABORTED' && error.message.includes('timeout')) {
        throw new Error(`Timeout lors de la compression de ${folderPath} - l'opération a pris plus de 10 minutes`);
      }
      
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
      Logger.info(`📂 Extraction de l'archive: ${archivePath} vers ${destination} (timeout: 10 minutes)`);
      
      const startTime = Date.now();
      await this.longOperationClient.post(`/servers/${this.config.serverId}/files/decompress`, {
        root: destination,
        file: archivePath
      });

      const endTime = Date.now();
      const duration = Math.round((endTime - startTime) / 1000);

      Logger.success(`✅ Archive extraite avec succès en ${duration}s`);
    } catch (error: any) {
      Logger.error(`❌ Erreur lors de l'extraction`, error.response?.data || error.message);
      
      if (error.code === 'ECONNABORTED' && error.message.includes('timeout')) {
        throw new Error(`Timeout lors de l'extraction de ${archivePath} - l'opération a pris plus de 10 minutes`);
      }
      
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

  // Méthode utilitaire pour obtenir les informations du serveur
  async getServerInfo(): Promise<any> {
    try {
      const response = await this.client.get(`/servers/${this.config.serverId}`);
      return response.data;
    } catch (error: any) {
      Logger.error(`❌ Erreur lors de la récupération des infos serveur`, error.response?.data || error.message);
      throw new Error(`Impossible de récupérer les infos du serveur: ${error.response?.data?.errors?.[0]?.detail || error.message}`);
    }
  }

  // Méthode utilitaire pour obtenir l'utilisation des ressources
  async getServerResources(): Promise<any> {
    try {
      const response = await this.client.get(`/servers/${this.config.serverId}/resources`);
      return response.data;
    } catch (error: any) {
      Logger.error(`❌ Erreur lors de la récupération des ressources`, error.response?.data || error.message);
      throw new Error(`Impossible de récupérer les ressources du serveur: ${error.response?.data?.errors?.[0]?.detail || error.message}`);
    }
  }
}