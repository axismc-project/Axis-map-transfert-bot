import { PterodactylService } from './pterodactyl.js';
import { SftpService } from './sftp.js';
import { ProgressTracker } from '../utils/progress.js';
import { Logger } from '../utils/logger.js';
import { ServerConfig } from '../types/index.js';
import * as fs from 'fs-extra';
import * as path from 'path';

export class TransferService {
  private srv1Ptero: PterodactylService;
  private srv2Ptero: PterodactylService;
  private srv1Sftp: SftpService;
  private srv2Sftp: SftpService;
  private tracker: ProgressTracker;
  private tempCachePath: string;

  constructor(
    srv1Config: ServerConfig,
    srv2Config: ServerConfig
  ) {
    this.srv1Ptero = new PterodactylService(srv1Config);
    this.srv2Ptero = new PterodactylService(srv2Config);
    this.srv1Sftp = new SftpService(srv1Config);
    this.srv2Sftp = new SftpService(srv2Config);
    this.tracker = new ProgressTracker();
    this.tempCachePath = process.env.TEMP_CACHE_PATH || '/tmp/playerdata_backup';
  }

  async executeTransfer(progressCallback?: (tracker: ProgressTracker) => void): Promise<void> {
    let srv1Connected = false;
    let srv2Connected = false;
    let archiveName = '';

    try {
      Logger.info('🚀 Début du transfert de map Build → Staging');

      // Étape 1: Notification des serveurs
      await this.executeStep(0, 'Notification des serveurs', async () => {
        this.tracker.updateStep(0, 'running', 'Envoi des notifications...', 0);
        progressCallback?.(this.tracker);

        await Promise.all([
          this.srv1Ptero.sendTransferNotification(10),
          this.srv2Ptero.sendTransferNotification(10)
        ]);

        // Attendre 10 secondes comme annoncé
        for (let i = 10; i > 0; i--) {
          this.tracker.updateStep(0, 'running', `Démarrage dans ${i}s...`, ((10 - i) / 10) * 100);
          progressCallback?.(this.tracker);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      });

      // Étape 2: Arrêt des serveurs
      await this.executeStep(1, 'Arrêt srv1 & srv2', async () => {
        this.tracker.updateStep(1, 'running', 'Arrêt du serveur Build...', 25);
        progressCallback?.(this.tracker);
        await this.srv1Ptero.setPowerState('stop');

        this.tracker.updateStep(1, 'running', 'Arrêt du serveur Staging...', 50);
        progressCallback?.(this.tracker);
        await this.srv2Ptero.setPowerState('stop');

        this.tracker.updateStep(1, 'running', 'Attente arrêt complet (30s)...', 75);
        progressCallback?.(this.tracker);
        await Promise.all([
          this.srv1Ptero.waitForServerState('offline', 30000),
          this.srv2Ptero.waitForServerState('offline', 30000)
        ]);
      });

      // Connexions SFTP
      this.tracker.updateStep(2, 'running', 'Connexion SFTP aux serveurs...', 0);
      progressCallback?.(this.tracker);
      await this.srv1Sftp.connect();
      srv1Connected = true;
      await this.srv2Sftp.connect();
      srv2Connected = true;

      // Étape 3: Compression de la map srv1
      await this.executeStep(2, 'Compression /world srv1', async () => {
        this.tracker.updateStep(2, 'running', 'Compression en cours...', 50);
        progressCallback?.(this.tracker);
        archiveName = await this.srv1Ptero.compressFolder('world');
      });

      // Étape 4: Sauvegarde playerdata srv2
      await this.executeStep(3, 'Sauvegarde playerdata srv2', async () => {
        await this.backupPlayerData(progressCallback);
      });

      // Étape 5: Transfert SFTP srv1 → srv2
      // Dans la méthode executeTransfer, remplacez l'étape 5 par :

      // Remplacez l'étape 5 dans la méthode executeTransfer par :

      // Étape 5: Transfert SFTP srv1 → srv2
      await this.executeStep(4, 'Transfert SFTP srv1 → srv2', async () => {
        await this.srv2Sftp.transferFileDirect(
          this.srv1Sftp,
          archiveName,
          archiveName,
          ({ phase, data }) => {
            const phaseText = phase === 'download' ? 'Téléchargement' : 'Upload';
            const speedText = data.speed > 0 ? ` - ${(data.speed / (1024 * 1024)).toFixed(2)} MB/s` : '';
            const etaText = data.eta !== Infinity ? ` - ETA: ${Math.ceil(data.eta)}s` : '';

            this.tracker.updateStep(
              4,
              'running',
              `${phaseText}: ${data.percentage}%${speedText}${etaText}`,
              data.percentage
            );
            progressCallback?.(this.tracker);
          }
        );
      });

      // Étape 6: Suppression ancien /world srv2
      await this.executeStep(5, 'Suppression ancien /world srv2', async () => {
        this.tracker.updateStep(5, 'running', 'Suppression de l\'ancienne map...', 50);
        progressCallback?.(this.tracker);
        await this.srv2Ptero.deleteFolder('world');
      });

      // Étape 7: Décompression nouvelle map
      await this.executeStep(6, 'Décompression nouvelle map', async () => {
        this.tracker.updateStep(6, 'running', 'Extraction en cours...', 50);
        progressCallback?.(this.tracker);
        await this.srv2Ptero.extractArchive(archiveName, '/');
      });

      // Étape 8: Nettoyage des fichiers
      await this.executeStep(7, 'Nettoyage fichiers', async () => {
        // Suppression de l'archive
        this.tracker.updateStep(7, 'running', 'Suppression archive...', 20);
        progressCallback?.(this.tracker);
        await Promise.all([
          this.srv1Ptero.deleteFile(archiveName),
          this.srv2Ptero.deleteFile(archiveName)
        ]);

        // Suppression des fichiers indésirables dans world
        this.tracker.updateStep(7, 'running', 'Nettoyage /world/stats...', 50);
        progressCallback?.(this.tracker);
        try {
          await this.srv2Ptero.deleteFolder('world/stats');
        } catch (error) {
          Logger.warning('Dossier stats non trouvé, ignoré');
        }

        this.tracker.updateStep(7, 'running', 'Suppression icon.png...', 80);
        progressCallback?.(this.tracker);
        try {
          await this.srv2Ptero.deleteFile('world/icon.png');
        } catch (error) {
          Logger.warning('Fichier icon.png non trouvé, ignoré');
        }
      });

      // Étape 9: Restauration playerdata srv2
      await this.executeStep(8, 'Restauration playerdata srv2', async () => {
        await this.restorePlayerData(progressCallback);
      });

      // Étape 10: Redémarrage des serveurs
      await this.executeStep(9, 'Redémarrage serveurs', async () => {
        this.tracker.updateStep(9, 'running', 'Démarrage du serveur Build...', 25);
        progressCallback?.(this.tracker);
        await this.srv1Ptero.setPowerState('start');

        this.tracker.updateStep(9, 'running', 'Démarrage du serveur Staging...', 50);
        progressCallback?.(this.tracker);
        await this.srv2Ptero.setPowerState('start');

        this.tracker.updateStep(9, 'running', 'Attente démarrage complet (30s)...', 75);
        progressCallback?.(this.tracker);
        await Promise.all([
          this.srv1Ptero.waitForServerState('running', 30000),
          this.srv2Ptero.waitForServerState('running', 30000)
        ]);
      });

      Logger.success('🎉 Transfert de map terminé avec succès !');
    } catch (error: any) {
      Logger.error('❌ Erreur lors du transfert', error);

      // Marquer l'étape actuelle comme erreur
      const currentStep = this.tracker.getCurrentStep();
      if (currentStep >= 0) {
        this.tracker.updateStep(currentStep, 'error', `Erreur: ${error.message}`, 0);
        progressCallback?.(this.tracker);
      }

      // Tentative de rollback
      await this.handleRollback();
      throw error;

    } finally {
      // Nettoyage des connexions
      await this.cleanup(srv1Connected, srv2Connected);
    }
  }

  private async executeStep(stepIndex: number, stepName: string, operation: () => Promise<void>): Promise<void> {
    try {
      Logger.info(`🔄 Étape ${stepIndex + 1}: ${stepName}`);
      this.tracker.updateStep(stepIndex, 'running', 'En cours...', 0);

      await operation();

      this.tracker.updateStep(stepIndex, 'completed', 'Terminé', 100);
      Logger.success(`✅ Étape ${stepIndex + 1} terminée: ${stepName}`);
    } catch (error) {
      this.tracker.updateStep(stepIndex, 'error', `Erreur: ${error instanceof Error ? error.message : 'Erreur inconnue'}`, 0);
      throw error;
    }
  }

  private async backupPlayerData(progressCallback?: (tracker: ProgressTracker) => void): Promise<void> {
    try {
      this.tracker.updateStep(3, 'running', 'Vérification playerdata...', 25);
      progressCallback?.(this.tracker);

      // Vérifier si le dossier playerdata existe
      const playerdataExists = await this.srv2Sftp.fileExists('world/playerdata');

      if (playerdataExists) {
        this.tracker.updateStep(3, 'running', 'Sauvegarde playerdata...', 50);
        progressCallback?.(this.tracker);

        // Créer le dossier de cache temporaire
        await fs.ensureDir(this.tempCachePath);

        // Télécharger le dossier playerdata
        await this.srv2Sftp.downloadFolder(
          'world/playerdata',
          path.join(this.tempCachePath, 'playerdata')
        );

        this.tracker.updateStep(3, 'running', 'Sauvegarde terminée', 100);
        progressCallback?.(this.tracker);

        Logger.success('PlayerData sauvegardé dans le cache temporaire');
      } else {
        Logger.warning('Aucun dossier playerdata trouvé sur srv2, création d\'un dossier vide');
        await fs.ensureDir(path.join(this.tempCachePath, 'playerdata'));
      }
    } catch (error: any) {
      Logger.error('Erreur lors de la sauvegarde playerdata', error);
      throw new Error(`Impossible de sauvegarder playerdata: ${error.message}`);
    }
  }

  private async restorePlayerData(progressCallback?: (tracker: ProgressTracker) => void): Promise<void> {
    try {
      this.tracker.updateStep(8, 'running', 'Suppression playerdata srv1...', 25);
      progressCallback?.(this.tracker);

      // Supprimer le playerdata de la map srv1 (nouvelle map)
      try {
        await this.srv2Ptero.deleteFolder('world/playerdata');
        Logger.success('PlayerData de srv1 supprimé');
      } catch (error) {
        Logger.warning('Aucun playerdata srv1 à supprimer');
      }

      this.tracker.updateStep(8, 'running', 'Restauration playerdata srv2...', 50);
      progressCallback?.(this.tracker);

      // Vérifier si nous avons une sauvegarde
      const backupPath = path.join(this.tempCachePath, 'playerdata');
      const backupExists = await fs.pathExists(backupPath);

      if (backupExists) {
        // Restaurer le playerdata sauvegardé
        await this.srv2Sftp.uploadFolder(
          backupPath,
          'world/playerdata'
        );

        this.tracker.updateStep(8, 'running', 'Restauration terminée', 100);
        progressCallback?.(this.tracker);

        Logger.success('PlayerData de srv2 restauré');
      } else {
        Logger.warning('Aucune sauvegarde playerdata trouvée');
      }

      // Nettoyer le cache temporaire
      try {
        await fs.remove(this.tempCachePath);
        Logger.debug('Cache temporaire nettoyé');
      } catch (cleanupError) {
        Logger.warning('Impossible de nettoyer le cache temporaire', cleanupError);
      }

    } catch (error: any) {
      Logger.error('Erreur lors de la restauration playerdata', error);
      throw new Error(`Impossible de restaurer playerdata: ${error.message}`);
    }
  }

  private async handleRollback(): Promise<void> {
    try {
      Logger.warning('🔄 Tentative de rollback...');

      // Redémarrer les serveurs s'ils sont arrêtés
      try {
        await Promise.all([
          this.srv1Ptero.setPowerState('start'),
          this.srv2Ptero.setPowerState('start')
        ]);
        Logger.info('Serveurs redémarrés après erreur');
      } catch (rollbackError) {
        Logger.error('Impossible de redémarrer les serveurs', rollbackError);
      }

      // Nettoyer le cache temporaire
      try {
        await fs.remove(this.tempCachePath);
        Logger.debug('Cache temporaire nettoyé après erreur');
      } catch (cleanupError) {
        Logger.warning('Impossible de nettoyer le cache après erreur', cleanupError);
      }

    } catch (error) {
      Logger.error('Erreur lors du rollback', error);
    }
  }

  private async cleanup(srv1Connected: boolean, srv2Connected: boolean): Promise<void> {
    try {
      if (srv1Connected) {
        await this.srv1Sftp.disconnect();
      }
      if (srv2Connected) {
        await this.srv2Sftp.disconnect();
      }
      Logger.success('Connexions SFTP fermées');
    } catch (error) {
      Logger.warning('Erreur lors de la fermeture des connexions', error);
    }
  }

  getTracker(): ProgressTracker {
    return this.tracker;
  }
}