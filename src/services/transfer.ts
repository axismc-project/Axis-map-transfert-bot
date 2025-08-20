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
    private srv2Config: ServerConfig
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

        this.tracker.updateStep(1, 'running', 'Attente arrêt complet...', 75);
        progressCallback?.(this.tracker);
        await Promise.all([
          this.srv1Ptero.waitForServerState('offline', 60000),
          this.srv2Ptero.waitForServerState('offline', 60000)
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
      await this.executeStep(4, 'Transfert SFTP srv1 → srv2', async () => {
        const sourceArchivePath = `/${archiveName}`;
        const destArchivePath = `/${archiveName}`;

        await this.srv2Sftp.transferFileDirect(
          this.srv1Sftp,
          sourceArchivePath,
          destArchivePath,
          (progress) => {
            this.tracker.updateStep(4, 'running', `Transfert en cours... ${progress}%`, progress);
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

        this.tracker.updateStep(9, 'running', 'Attente démarrage complet...', 75);
        progressCallback?.(this.tracker);
        await Promise.all([
          this.srv1Ptero.waitForServerState('running', 120000),
          this.srv2Ptero.waitForServerState('running', 120000)
        ]);
      });

      Logger.success('🎉 Transfert de map terminé avec succès !');