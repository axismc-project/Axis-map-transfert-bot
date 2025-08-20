import axios, { AxiosInstance } from 'axios';
import { ServerConfig, PterodactylResponse, ServerResources, ServerDetails, FileObject } from '../types/index.js';
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
      timeout: 30000 // 30 secondes de timeout
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
    try {
      const message = `§6§l[TRANSFERT] §r§eTransfert de map en cours dans ${seconds} secondes...`;
      await this.sendFormattedMessage(message);
    } catch (error) {
      Logger.warning(`Impossible d'envoyer la notification au serveur ${this.config.serverId}`, error);
      // Ne pas faire échouer le transfert si la notification échoue
    }
  }

  async setPowerState(action: 'start' | 'stop' | 'restart' | 'kill'): Promise<void> {
    try {
      Logger.info(`🔄 Changement d'état du serveur ${this.config.serverId}: ${action}`);
      
      // Vérifier d'abord l'état actuel
      let currentState = 'unknown';
      try {
        const statusResponse = await this.client.get<PterodactylResponse<ServerResources>>(`/servers/${this.config.serverId}/resources`);
        currentState = statusResponse.data.attributes.current_state;
        Logger.info(`État actuel du serveur: ${currentState}`);
      } catch (statusError) {
        Logger.warning(`Impossible de vérifier l'état actuel du serveur`);
      }

      // Si on essaie d'arrêter un serveur déjà arrêté, ignorer
      if (action === 'stop' && (currentState === 'offline' || currentState === 'stopping')) {
        Logger.info(`Serveur ${this.config.serverId} déjà arrêté ou en cours d'arrêt`);
        return;
      }

      // Si on essaie de démarrer un serveur déjà démarré, ignorer
      if (action === 'start' && (currentState === 'running' || currentState === 'starting')) {
        Logger.info(`Serveur ${this.config.serverId} déjà démarré ou en cours de démarrage`);
        return;
      }

      const response = await this.client.post(`/servers/${this.config.serverId}/power`, {
        signal: action
      });

      Logger.success(`✅ Action ${action} envoyée avec succès (Status: ${response.status})`);
      
      // Attendre un peu pour que l'action soit prise en compte
      await new Promise(resolve => setTimeout(resolve, 2000));

    } catch (error: any) {
      Logger.error(`❌ Erreur lors du changement d'état (${action})`, {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message
      });

      if (error.response?.status === 409) {
        Logger.warning(`Conflit lors de l'action ${action} - le serveur est peut-être déjà dans l'état souhaité`);
        return; // Ne pas faire échouer si c'est juste un conflit d'état
      }

      throw new Error(`Impossible de ${action} le serveur: ${error.response?.data?.errors?.[0]?.detail || error.message}`);
    }
  }

  async waitForServerState(targetState: 'offline' | 'running', maxWaitTime: number = 90000): Promise<void> {
    const startTime = Date.now();
    let lastState = 'unknown';
    let attempts = 0;
    const maxAttempts = Math.floor(maxWaitTime / 3000);
    
    Logger.info(`⏳ Attente de l'état "${targetState}" pour le serveur ${this.config.serverId} (max ${maxWaitTime/1000}s)`);
    
    while (Date.now() - startTime < maxWaitTime && attempts < maxAttempts) {
      attempts++;
      
      try {
        // Essayer plusieurs endpoints
        let currentState = 'unknown';
        let apiWorked = false;

        // Essayer l'endpoint resources
        try {
          const response = await this.client.get<PterodactylResponse<ServerResources>>(`/servers/${this.config.serverId}/resources`);
          if (response.data?.attributes?.current_state) {
            currentState = response.data.attributes.current_state;
            apiWorked = true;
          }
        } catch (resourceError) {
          // Essayer l'endpoint principal
          try {
            const response = await this.client.get<PterodactylResponse<ServerDetails>>(`/servers/${this.config.serverId}`);
            if (response.data?.attributes?.current_state) {
              currentState = response.data.attributes.current_state;
              apiWorked = true;
            }
          } catch (mainError) {
            Logger.debug(`Tentative ${attempts}: Impossible de récupérer l'état du serveur`);
          }
        }

        // Log seulement si l'état change
        if (currentState !== lastState) {
          Logger.info(`🔄 Serveur ${this.config.serverId}: ${lastState} → ${currentState} (tentative ${attempts}/${maxAttempts})`);
          lastState = currentState;
        }
        
        // Vérifier l'état cible
        if (currentState === targetState) {
          Logger.success(`✅ Serveur ${this.config.serverId} est maintenant ${targetState} (en ${Math.round((Date.now() - startTime)/1000)}s)`);
          return;
        }

        // Si l'API ne fonctionne pas et qu'on attend "offline", supposer que c'est ok après un certain temps
        if (!apiWorked && targetState === 'offline' && attempts > 5) {
          Logger.info(`✅ API inaccessible depuis ${attempts} tentatives, supposer que le serveur est offline`);
          return;
        }
        
      } catch (error: any) {
        const status = error.response?.status;
        
        // Si on attend "offline" et qu'on a certaines erreurs, c'est probablement bon
        if (targetState === 'offline') {
          if (status === 409 || status === 502 || status === 503 || status === 500) {
            Logger.info(`✅ Serveur ${this.config.serverId} semble être offline (erreur ${status})`);
            return;
          }
        }
        
        Logger.debug(`Tentative ${attempts}: Erreur ${status} lors de la vérification d'état`);
      }
      
      // Attendre avant la prochaine vérification
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    // Si on arrive ici, c'est un timeout
    Logger.error(`❌ Timeout: Le serveur ${this.config.serverId} n'a pas atteint l'état ${targetState} dans les ${maxWaitTime/1000}s`);
    Logger.info(`Dernier état connu: ${lastState}`);
    
    // Pour l'offline, être plus permissif
    if (targetState === 'offline' && attempts >= 10) {
      Logger.warning(`⚠️  Supposer que le serveur est offline après ${attempts} tentatives`);
      return;
    }
    
    throw new Error(`Timeout: Le serveur ${this.config.serverId} n'a pas atteint l'état ${targetState} dans les ${maxWaitTime/1000}s (dernier état: ${lastState})`);
  }

  async getServerStatus(): Promise<string> {
    try {
      const response = await this.client.get<PterodactylResponse<ServerResources>>(`/servers/${this.config.serverId}/resources`);
      return response.data.attributes.current_state;
    } catch (error) {
      try {
        const response = await this.client.get<PterodactylResponse<ServerDetails>>(`/servers/${this.config.serverId}`);
        return response.data.attributes.current_state;
      } catch (error2) {
        return 'unknown';
      }
    }
  }

  async compressFolder(folderPath: string): Promise<string> {
    try {
      Logger.info(`📦 Compression du dossier: ${folderPath}`);
      
      await this.client.post(`/servers/${this.config.serverId}/files/compress`, {
        root: '/',
        files: [folderPath]
      });

      // L'API Pterodactyl retourne généralement le nom du fichier compressé
      const archiveName = `${folderPath.replace(/[/\\]/g, '_')}_${Date.now()}.tar.gz`;
      
      Logger.success(`✅ Compression terminée: ${archiveName}`);
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