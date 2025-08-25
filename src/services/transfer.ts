import { PterodactylService } from './pterodactyl.js';
import { SftpService } from './sftp.js';
import { ProgressTracker } from '../utils/progress.js';
import { Logger } from '../utils/logger.js';
import { ServerConfig } from '../types/index.js';
import fs from 'fs-extra';
import * as path from 'path';

interface TransferStatusUpdate {
  phase: 'download' | 'upload';
  percentage: number;
  speed: number;
  eta: number;
}

export class TransferService {
  private srv1Ptero: PterodactylService;
  private srv2Ptero: PterodactylService;
  private srv1Sftp: SftpService;
  private srv2Sftp: SftpService;
  private tracker: ProgressTracker;
  private tempCachePath: string;
  private statusUpdateCallback?: (status: TransferStatusUpdate) => void;
  private archiveName: string = '';

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

  setStatusUpdateCallback(callback: (status: TransferStatusUpdate) => void): void {
    this.statusUpdateCallback = callback;
  }

  async executeTransfer(progressCallback?: (tracker: ProgressTracker) => void): Promise<void> {
    let srv1Connected = false;
    let srv2Connected = false;

    try {
      Logger.info('🚀 Début du transfert de map Build → Staging v3.2 (Auto-refresh + Auto-restart)');

      // Étape 1: Préparation
      await this.executeStep(0, 'Préparation du transfert', async () => {
        this.tracker.updateStep(0, 'running', 'Initialisation...', 50);
        progressCallback?.(this.tracker);

        await new Promise(resolve => setTimeout(resolve, 2000));

        this.tracker.updateStep(0, 'running', 'Préparation terminée', 100);
        progressCallback?.(this.tracker);
      });

      // Étape 2: Arrêt des serveurs
      await this.executeStep(1, 'Arrêt srv1 & srv2', async () => {
        this.tracker.updateStep(1, 'running', 'Arrêt du serveur Build...', 25);
        progressCallback?.(this.tracker);
        await this.srv1Ptero.setPowerState('stop');

        this.tracker.updateStep(1, 'running', 'Arrêt du serveur Staging...', 50);
        progressCallback?.(this.tracker);
        await this.srv2Ptero.setPowerState('stop');

        this.tracker.updateStep(1, 'running', 'Attente arrêt complet (45s)...', 75);
        progressCallback?.(this.tracker);
        await Promise.all([
          this.srv1Ptero.waitForServerState('offline', 45000),
          this.srv2Ptero.waitForServerState('offline', 45000)
        ]);
      });

      // Connexions SFTP
      this.tracker.updateStep(2, 'running', 'Connexion SFTP aux serveurs...', 0);
      progressCallback?.(this.tracker);
      
      await this.srv1Sftp.connect();
      srv1Connected = true;
      Logger.success('✅ Connexion SFTP srv1 établie');
      
      await this.srv2Sftp.connect();
      srv2Connected = true;
      Logger.success('✅ Connexion SFTP srv2 établie');

      // Étape 3: Compression de la map srv1
      await this.executeStep(2, 'Compression /world srv1', async () => {
        this.tracker.updateStep(2, 'running', 'Compression en cours...', 50);
        progressCallback?.(this.tracker);
        this.archiveName = await this.srv1Ptero.compressFolder('world');
        Logger.info(`📦 Archive créée: ${this.archiveName}`);
      });

      // Étape 4: Sauvegarde playerdata srv2
      await this.executeStep(3, 'Sauvegarde playerdata srv2', async () => {
        await this.backupPlayerData(progressCallback);
      });

      // Étape 5: Transfert SFTP srv1 → srv2
      await this.executeStep(4, 'Transfert SFTP srv1 → srv2', async () => {
        await this.srv2Sftp.transferFileDirect(
          this.srv1Sftp,
          this.archiveName,
          this.archiveName,
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

            // Callback pour la mise à jour du statut Discord
            if (this.statusUpdateCallback) {
              this.statusUpdateCallback({
                phase,
                percentage: data.percentage,
                speed: data.speed / (1024 * 1024), // Convert to MB/s
                eta: data.eta
              });
            }
          }
        );
        Logger.success('✅ Transfert SFTP terminé');
      });

      // 🔄 NOUVEAU : Auto-restart du serveur 1 dès que le transfert est terminé
      await this.executeStep(5, 'Auto-restart serveur Build', async () => {
        this.tracker.updateStep(5, 'running', 'Redémarrage automatique du serveur Build...', 50);
        progressCallback?.(this.tracker);
        
        try {
          await this.srv1Ptero.setPowerState('start');
          Logger.success('✅ Serveur Build redémarré automatiquement après transfert');
          
          this.tracker.updateStep(5, 'running', 'Serveur Build redémarré', 100);
          progressCallback?.(this.tracker);
        } catch (error) {
          Logger.warning('⚠️ Impossible de redémarrer automatiquement le serveur Build', error);
          this.tracker.updateStep(5, 'running', 'Redémarrage manuel requis pour srv1', 100);
          progressCallback?.(this.tracker);
        }
      });

      // Étape 6: Suppression ancien /world srv2 (ancienne étape 5)
      await this.executeStep(6, 'Suppression ancien /world srv2', async () => {
        this.tracker.updateStep(6, 'running', 'Suppression de l\'ancienne map...', 50);
        progressCallback?.(this.tracker);
        
        try {
          await this.srv2Ptero.deleteFolder('world');
          Logger.success('✅ Ancienne map supprimée');
        } catch (error) {
          Logger.warning('⚠️ Aucune ancienne map à supprimer');
        }
      });

      // Étape 7: Décompression nouvelle map (avec polling étendu 2h) (ancienne étape 6)
      await this.executeStep(7, 'Décompression nouvelle map', async () => {
        this.tracker.updateStep(7, 'running', 'Extraction en cours (polling 5min, timeout 2h)...', 10);
        progressCallback?.(this.tracker);
        
        Logger.info('⏰ Démarrage extraction avec timeout étendu (2h max, vérification toutes les 5min)');
        
        // Méthode avec polling étendu modifiée
        await this.srv2Ptero.extractArchive(this.archiveName, '/');
        
        this.tracker.updateStep(7, 'running', 'Extraction terminée', 100);
        progressCallback?.(this.tracker);
        Logger.success('✅ Nouvelle map extraite (polling étendu)');
      });

      // Étape 8: Nettoyage des fichiers (ancienne étape 7)
      await this.executeStep(8, 'Nettoyage fichiers', async () => {
        // Suppression de l'archive sur les deux serveurs
        this.tracker.updateStep(8, 'running', 'Suppression archive srv1...', 20);
        progressCallback?.(this.tracker);
        
        try {
          await this.srv1Ptero.deleteFile(this.archiveName);
          Logger.success('✅ Archive supprimée sur srv1');
        } catch (error) {
          Logger.warning('⚠️ Archive non trouvée sur srv1');
        }

        this.tracker.updateStep(8, 'running', 'Suppression archive srv2...', 40);
        progressCallback?.(this.tracker);
        
        try {
          await this.srv2Ptero.deleteFile(this.archiveName);
          Logger.success('✅ Archive supprimée sur srv2');
        } catch (error) {
          Logger.warning('⚠️ Archive non trouvée sur srv2');
        }

        // Suppression des fichiers indésirables dans world
        this.tracker.updateStep(8, 'running', 'Nettoyage /world/stats...', 60);
        progressCallback?.(this.tracker);
        
        try {
          await this.srv2Ptero.deleteFolder('world/stats');
          Logger.success('✅ Dossier stats supprimé');
        } catch (error) {
          Logger.warning('⚠️ Dossier stats non trouvé');
        }

        this.tracker.updateStep(8, 'running', 'Suppression icon.png...', 80);
        progressCallback?.(this.tracker);
        
        try {
          await this.srv2Ptero.deleteFile('world/icon.png');
          Logger.success('✅ Fichier icon.png supprimé');
        } catch (error) {
          Logger.warning('⚠️ Fichier icon.png non trouvé');
        }
      });

      // Étape 9: Restauration playerdata srv2 (ancienne étape 8)
      await this.executeStep(9, 'Restauration playerdata srv2', async () => {
        await this.restorePlayerData(progressCallback);
      });

      // Étape 10: Redémarrage serveur Staging seulement (ancienne étape 9 modifiée)
      await this.executeStep(10, 'Redémarrage serveur Staging', async () => {
        // Le serveur Build est déjà redémarré à l'étape 5
        this.tracker.updateStep(10, 'running', 'Démarrage du serveur Staging...', 50);
        progressCallback?.(this.tracker);
        await this.srv2Ptero.setPowerState('start');
        Logger.success('✅ Serveur Staging redémarré');

        this.tracker.updateStep(10, 'running', 'Attente démarrage complet Staging (45s)...', 75);
        progressCallback?.(this.tracker);
        await this.srv2Ptero.waitForServerState('running', 45000);
        Logger.success('✅ Serveur Staging démarré');
        
        this.tracker.updateStep(10, 'running', 'Les deux serveurs sont opérationnels', 100);
        progressCallback?.(this.tracker);
      });

      Logger.success('🎉 Transfert de map v3.2 terminé avec succès (auto-refresh + auto-restart) !');
      Logger.info('🔄 Serveur Build : Redémarré automatiquement après transfert');
      Logger.info('🎯 Serveur Staging : Redémarré avec la nouvelle map');

    } catch (error: any) {
      Logger.error('❌ Erreur lors du transfert v3.2', error);

      // Marquer l'étape actuelle comme erreur
      const currentStep = this.tracker.getCurrentStep();
      if (currentStep >= 0) {
        this.tracker.updateStep(currentStep, 'error', `Erreur: ${error.message}`, 0);
        progressCallback?.(this.tracker);
      }

      // Tentative de rollback complet
      await this.handleRollback();
      throw error;

    } finally {
      // Nettoyage des connexions
      await this.cleanup(srv1Connected, srv2Connected);
      
      // Réinitialiser le callback de statut
      this.statusUpdateCallback = undefined;
    }
  }

  private async executeStep(stepIndex: number, stepName: string, operation: () => Promise<void>): Promise<void> {
    try {
      Logger.info(`🔄 Étape ${stepIndex + 1}/11: ${stepName}`);
      this.tracker.updateStep(stepIndex, 'running', 'En cours...', 0);

      const startTime = Date.now();
      await operation();
      const duration = Date.now() - startTime;

      this.tracker.updateStep(stepIndex, 'completed', `Terminé (${Math.round(duration/1000)}s)`, 100);
      Logger.success(`✅ Étape ${stepIndex + 1}/11 terminée en ${Math.round(duration/1000)}s: ${stepName}`);
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
        Logger.info(`📁 Cache temporaire créé: ${this.tempCachePath}`);

        // Télécharger le dossier playerdata
        await this.srv2Sftp.downloadFolder(
          'world/playerdata',
          path.join(this.tempCachePath, 'playerdata')
        );

        this.tracker.updateStep(3, 'running', 'Sauvegarde terminée', 100);
        progressCallback?.(this.tracker);

        Logger.success('✅ PlayerData sauvegardé dans le cache temporaire');
      } else {
        this.tracker.updateStep(3, 'running', 'Création dossier playerdata vide...', 75);
        progressCallback?.(this.tracker);
        
        Logger.warning('⚠️ Aucun dossier playerdata trouvé sur srv2, création d\'un dossier vide');
        await fs.ensureDir(path.join(this.tempCachePath, 'playerdata'));
       
       this.tracker.updateStep(3, 'running', 'Dossier vide créé', 100);
       progressCallback?.(this.tracker);
     }
   } catch (error: any) {
     Logger.error('❌ Erreur lors de la sauvegarde playerdata', error);
     throw new Error(`Impossible de sauvegarder playerdata: ${error.message}`);
   }
 }

 private async restorePlayerData(progressCallback?: (tracker: ProgressTracker) => void): Promise<void> {
   try {
     this.tracker.updateStep(9, 'running', 'Suppression playerdata srv1...', 25);
     progressCallback?.(this.tracker);

     // Supprimer le playerdata de la map srv1 (nouvelle map)
     try {
       await this.srv2Ptero.deleteFolder('world/playerdata');
       Logger.success('✅ PlayerData de srv1 supprimé');
     } catch (error) {
       Logger.warning('⚠️ Aucun playerdata srv1 à supprimer');
     }

     this.tracker.updateStep(9, 'running', 'Restauration playerdata srv2...', 50);
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

       this.tracker.updateStep(9, 'running', 'Restauration terminée', 100);
       progressCallback?.(this.tracker);

       Logger.success('✅ PlayerData de srv2 restauré');
     } else {
       this.tracker.updateStep(9, 'running', 'Aucune sauvegarde trouvée', 90);
       progressCallback?.(this.tracker);
       Logger.warning('⚠️ Aucune sauvegarde playerdata trouvée');
     }

     // Nettoyer le cache temporaire
     this.tracker.updateStep(9, 'running', 'Nettoyage cache temporaire...', 95);
     progressCallback?.(this.tracker);
     
     try {
       await fs.remove(this.tempCachePath);
       Logger.success('✅ Cache temporaire nettoyé');
     } catch (cleanupError) {
       Logger.warning('⚠️ Impossible de nettoyer le cache temporaire', cleanupError);
     }

   } catch (error: any) {
     Logger.error('❌ Erreur lors de la restauration playerdata', error);
     throw new Error(`Impossible de restaurer playerdata: ${error.message}`);
   }
 }

 private async handleRollback(): Promise<void> {
   try {
     Logger.warning('🔄 Début du rollback complet v3.2...');

     // 1. Nettoyer le cache temporaire
     try {
       if (await fs.pathExists(this.tempCachePath)) {
         await fs.remove(this.tempCachePath);
         Logger.success('✅ Cache temporaire supprimé lors du rollback');
       }
     } catch (cleanupError) {
       Logger.error('❌ Erreur lors du nettoyage du cache temporaire', cleanupError);
     }

     // 2. Supprimer le fichier compressé sur srv1 si il existe
     if (this.archiveName) {
       try {
         await this.srv1Ptero.deleteFile(this.archiveName);
         Logger.success(`✅ Archive ${this.archiveName} supprimée sur srv1 lors du rollback`);
       } catch (archiveError) {
         Logger.warning(`⚠️ Impossible de supprimer l'archive ${this.archiveName} sur srv1`, archiveError);
       }

       // 3. Supprimer le fichier compressé sur srv2 si il existe
       try {
         await this.srv2Ptero.deleteFile(this.archiveName);
         Logger.success(`✅ Archive ${this.archiveName} supprimée sur srv2 lors du rollback`);
       } catch (archiveError) {
         Logger.warning(`⚠️ Impossible de supprimer l'archive ${this.archiveName} sur srv2`, archiveError);
       }
     }

     // 4. Redémarrer les serveurs s'ils sont arrêtés (les deux serveurs)
     try {
       Logger.info('🔄 Redémarrage des serveurs lors du rollback...');
       await Promise.all([
         this.srv1Ptero.setPowerState('start').catch(error => {
           Logger.warning('⚠️ Impossible de redémarrer srv1', error);
         }),
         this.srv2Ptero.setPowerState('start').catch(error => {
           Logger.warning('⚠️ Impossible de redémarrer srv2', error);
         })
       ]);
       Logger.success('✅ Serveurs redémarrés lors du rollback');
     } catch (rollbackError) {
       Logger.error('❌ Erreur lors du redémarrage des serveurs', rollbackError);
     }

     // 5. Nettoyer les fichiers temporaires système
     const systemTempDir = process.env.TEMP_CACHE_PATH || '/tmp';
     try {
       const tempFiles = await fs.readdir(systemTempDir);
       const transferFiles = tempFiles.filter(file => file.startsWith('transfer_'));
       
       for (const file of transferFiles) {
         try {
           const filePath = path.join(systemTempDir, file);
           const stats = await fs.stat(filePath);
           const ageInMinutes = (Date.now() - stats.mtime.getTime()) / (1000 * 60);
           
           // Supprimer les fichiers de transfert de plus de 5 minutes
           if (ageInMinutes > 5) {
             await fs.remove(filePath);
             Logger.success(`✅ Fichier temporaire supprimé: ${file}`);
           }
         } catch (fileError) {
           Logger.warning(`⚠️ Impossible de supprimer le fichier temporaire ${file}`, fileError);
         }
       }
     } catch (tempCleanupError) {
       Logger.warning('⚠️ Erreur lors du nettoyage des fichiers temporaires système', tempCleanupError);
     }

     Logger.success('✅ Rollback complet v3.2 terminé');

   } catch (error) {
     Logger.error('❌ Erreur critique lors du rollback v3.2', error);
   }
 }

 private async cleanup(srv1Connected: boolean, srv2Connected: boolean): Promise<void> {
   try {
     Logger.info('🔄 Nettoyage des connexions v3.2...');
     
     if (srv1Connected) {
       try {
         await this.srv1Sftp.disconnect();
         Logger.success('✅ Connexion SFTP srv1 fermée');
       } catch (error) {
         Logger.warning('⚠️ Erreur lors de la fermeture SFTP srv1', error);
       }
     }
     
     if (srv2Connected) {
       try {
         await this.srv2Sftp.disconnect();
         Logger.success('✅ Connexion SFTP srv2 fermée');
       } catch (error) {
         Logger.warning('⚠️ Erreur lors de la fermeture SFTP srv2', error);
       }
     }
     
     Logger.success('✅ Nettoyage v3.2 terminé');
   } catch (error) {
     Logger.error('❌ Erreur lors du nettoyage v3.2', error);
   }
 }

 getTracker(): ProgressTracker {
   return this.tracker;
 }

 getCurrentArchiveName(): string {
   return this.archiveName;
 }

 getTempCachePath(): string {
   return this.tempCachePath;
 }
}