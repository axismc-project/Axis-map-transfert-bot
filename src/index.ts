import { 
  Client, 
  GatewayIntentBits, 
  Collection, 
  CommandInteraction,
  ActivityType,
  TextChannel,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction
} from 'discord.js';
import { config } from 'dotenv';
import { Logger } from './utils/logger.js';
import { TransferService } from './services/transfer.js';
import { EmbedGenerator } from './utils/embed.js';
import { ServerConfig } from './types/index.js';
import * as buildCommand from './commands/build.js';

// Charger les variables d'environnement
config();

// Interface pour les commandes
interface Command {
  data: any;
  execute: (interaction: CommandInteraction) => Promise<void>;
}

interface TransferStatusUpdate {
  phase: 'download' | 'upload';
  percentage: number;
  speed: number;
  eta: number;
}

class MinecraftTransferBot {
  private client: Client;
  private commands: Collection<string, Command>;
  private statusUpdateInterval?: NodeJS.Timeout;
  private currentTransferStatus?: TransferStatusUpdate;

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
      ]
    });

    this.commands = new Collection();
    this.setupCommands();
    this.setupEventHandlers();
  }

  private setupCommands(): void {
    // Enregistrer les commandes
    this.commands.set(buildCommand.data.name, buildCommand);
    Logger.info(`Commande chargée: ${buildCommand.data.name}`);
  }

  private setupEventHandlers(): void {
    // Event: Bot prêt
    this.client.once('ready', async () => {
      if (!this.client.user) return;
      
      Logger.success(`🤖 Bot connecté en tant que ${this.client.user.tag}`);
      Logger.info(`📊 Présent sur ${this.client.guilds.cache.size} serveur(s)`);
      
      // Définir l'activité initiale du bot
      this.client.user.setActivity('Transferts Minecraft', { 
        type: ActivityType.Watching 
      });

      // Afficher les commandes disponibles
      Logger.info(`📋 Commandes disponibles: ${Array.from(this.commands.keys()).join(', ')}`);

      // Envoyer l'embed de démarrage avec le bouton
      await this.sendStartupEmbed();
    });

    // Event: Interaction créée (slash commands ET boutons)
    this.client.on('interactionCreate', async (interaction) => {
      if (interaction.isChatInputCommand()) {
        await this.handleSlashCommand(interaction);
      } else if (interaction.isButton()) {
        await this.handleButtonInteraction(interaction);
      }
    });

    // Event: Erreur non gérée
    this.client.on('error', (error) => {
      Logger.error('Erreur Discord.js', error);
    });

    // Event: Debug (optionnel, pour le développement)
    if (process.env.NODE_ENV === 'development') {
      this.client.on('debug', (info) => {
        if (info.includes('Heartbeat')) return; // Ignorer les heartbeats
        Logger.debug(`Discord Debug: ${info}`);
      });
    }

    // Gestion des erreurs non capturées
    process.on('unhandledRejection', (reason, promise) => {
      Logger.error('Promesse rejetée non gérée', { reason, promise });
    });

    process.on('uncaughtException', (error) => {
      Logger.error('Exception non capturée', error);
      process.exit(1);
    });

    // Gestion propre de l'arrêt
    process.on('SIGINT', () => {
      Logger.info('Signal SIGINT reçu, arrêt du bot...');
      this.shutdown();
    });

    process.on('SIGTERM', () => {
      Logger.info('Signal SIGTERM reçu, arrêt du bot...');
      this.shutdown();
    });
  }

  private startStatusUpdates(): void {
    this.statusUpdateInterval = setInterval(() => {
      if (this.currentTransferStatus && this.client.user) {
        const { phase, percentage, speed, eta } = this.currentTransferStatus;
        const phaseIcon = phase === 'download' ? '📥' : '📤';
        const speedText = speed > 0 ? `${speed.toFixed(1)}MB/s` : '';
        const etaText = eta !== Infinity && !isNaN(eta) ? `ETA:${Math.ceil(eta)}s` : '';
        
        let statusText = `${phaseIcon} ${percentage}%`;
        if (speedText) statusText += ` ${speedText}`;
        if (etaText) statusText += ` ${etaText}`;

        this.client.user.setActivity(statusText, { 
          type: ActivityType.Custom 
        });
      }
    }, 5000); // Mise à jour toutes les 5 secondes
  }

  private stopStatusUpdates(): void {
    if (this.statusUpdateInterval) {
      clearInterval(this.statusUpdateInterval);
      this.statusUpdateInterval = undefined;
    }
    this.currentTransferStatus = undefined;
    
    // Remettre le statut par défaut
    if (this.client.user) {
      this.client.user.setActivity('Transferts Minecraft', { 
        type: ActivityType.Watching 
      });
    }
  }

  private updateTransferStatus(status: TransferStatusUpdate): void {
    this.currentTransferStatus = status;
  }

  private async sendStartupEmbed(): Promise<void> {
    try {
      const channelId = '1406532712285732944';
      const channel = await this.client.channels.fetch(channelId) as TextChannel;
      
      if (!channel || !channel.isTextBased()) {
        Logger.error(`Canal ${channelId} introuvable ou non-textuel`);
        return;
      }

      // Créer l'embed de démarrage
      const embed = new EmbedBuilder()
        .setTitle('🚀 Minecraft Transfer Bot - Démarré !')
        .setDescription('```yaml\n' +
          '# ========================================\n' +
          '# MINECRAFT MAP TRANSFER SYSTEM\n' +
          '# ========================================\n' +
          '\n' +
          'status: ONLINE ✅\n' +
          'version: v1.0.0\n' +
          'uptime: Just started\n' +
          '\n' +
          'services:\n' +
          '  - discord_bot: READY\n' +
          '  - pterodactyl_api: STANDBY\n' +
          '  - sftp_transfer: STANDBY\n' +
          '\n' +
          'servers:\n' +
          '  source: BUILD_SERVER\n' +
          '  target: STAGING_SERVER\n' +
          '\n' +
          'features:\n' +
          '  - automatic_transfer: ENABLED\n' +
          '  - playerdata_backup: ENABLED\n' +
          '  - progress_tracking: ENABLED\n' +
          '  - rollback_protection: ENABLED\n' +
          '  - status_updates: ENABLED (5s)\n' +
          '\n' +
          'ready_for_transfer: true\n' +
          'access_level: PUBLIC (tous les utilisateurs)\n' +
          '```')
        .setColor(0x00ff00)
        .setTimestamp()
        .setFooter({ 
          text: '🎮 Prêt pour les transferts de maps Minecraft - Accès libre',
          iconURL: this.client.user?.displayAvatarURL()
        })
        .addFields(
          {
            name: '📊 Statistiques',
            value: `\`\`\`\n` +
                   `Serveurs Discord: ${this.client.guilds.cache.size}\n` +
                   `Utilisateurs: ${this.client.users.cache.size}\n` +
                   `Commandes: ${this.commands.size}\n` +
                   `Ping: ${this.client.ws.ping}ms\n` +
                   `\`\`\``,
            inline: true
          },
          {
            name: '🔧 Actions disponibles',
            value: '• Cliquez sur le bouton ci-dessous pour démarrer un transfert\n' +
                   '• Utilisez `/build transfer destination:staging`\n' +
                   '• Surveillez les logs en temps réel\n' +
                   '• ✨ **Tous les utilisateurs peuvent lancer un transfert**\n' +
                   '• 📱 **Statut Discord mis à jour toutes les 5s**',
            inline: true
          }
        );

      // Créer le bouton de transfert
      const transferButton = new ButtonBuilder()
        .setCustomId('start_transfer')
        .setLabel('🚀 Démarrer le Transfert')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🏗️');

      const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(transferButton);

      // Envoyer le message
      await channel.send({
        embeds: [embed],
        components: [row]
      });

      Logger.success(`✅ Embed de démarrage envoyé dans le canal ${channelId}`);

    } catch (error: any) {
      Logger.error('Erreur lors de l\'envoi de l\'embed de démarrage', error);
    }
  }

  private async handleSlashCommand(interaction: CommandInteraction): Promise<void> {
    const command = this.commands.get(interaction.commandName);
    if (!command) {
      Logger.warning(`Commande inconnue: ${interaction.commandName}`);
      return;
    }

    try {
      Logger.info(`Exécution de /${interaction.commandName} par ${interaction.user.tag} sur ${interaction.guild?.name}`);
      await command.execute(interaction);
    } catch (error: any) {
      Logger.error(`Erreur lors de l'exécution de /${interaction.commandName}`, error);
      
      const errorMessage = {
        content: `❌ Une erreur est survenue lors de l'exécution de cette commande.\n\`\`\`${error.message}\`\`\``,
        ephemeral: true
      };

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorMessage);
      } else {
        await interaction.reply(errorMessage);
      }
    }
  }

  private async handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
    if (interaction.customId === 'start_transfer') {
      await this.handleTransferButton(interaction);
    }
  }

  private async handleTransferButton(interaction: ButtonInteraction): Promise<void> {
    try {
      // Log de l'utilisateur qui démarre le transfert (sans vérification de permissions)
      Logger.info(`🚀 Transfert demandé par ${interaction.user.tag} (${interaction.user.id})`);

      // Vérifier les variables d'environnement
      const requiredEnvVars = [
        'SRV1_BASE_URL', 'SRV1_API_KEY', 'SRV1_SERVER_ID',
        'SRV2_BASE_URL', 'SRV2_API_KEY', 'SRV2_SERVER_ID',
        'SRV1_SFTP_HOST', 'SRV1_SFTP_USER', 'SRV1_SFTP_PASSWORD', 'SRV1_SFTP_ROOT',
        'SRV2_SFTP_HOST', 'SRV2_SFTP_USER', 'SRV2_SFTP_PASSWORD', 'SRV2_SFTP_ROOT'
      ];

      const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
      
      if (missingVars.length > 0) {
        await interaction.reply({
          embeds: [EmbedGenerator.createErrorEmbed(
            'Configuration manquante',
            `Variables d'environnement manquantes: ${missingVars.join(', ')}`
          )],
          ephemeral: true
        });
        return;
      }

      // Configuration des serveurs
      const srv1Config: ServerConfig = {
        baseUrl: process.env.SRV1_BASE_URL!,
        apiKey: process.env.SRV1_API_KEY!,
        serverId: process.env.SRV1_SERVER_ID!,
        sftpHost: process.env.SRV1_SFTP_HOST!,
        sftpPort: parseInt(process.env.SRV1_SFTP_PORT || '2022'),
        sftpUser: process.env.SRV1_SFTP_USER!,
        sftpPassword: process.env.SRV1_SFTP_PASSWORD!,
        sftpRoot: process.env.SRV1_SFTP_ROOT!
      };

      const srv2Config: ServerConfig = {
        baseUrl: process.env.SRV2_BASE_URL!,
        apiKey: process.env.SRV2_API_KEY!,
        serverId: process.env.SRV2_SERVER_ID!,
        sftpHost: process.env.SRV2_SFTP_HOST!,
        sftpPort: parseInt(process.env.SRV2_SFTP_PORT || '2022'),
        sftpUser: process.env.SRV2_SFTP_USER!,
        sftpPassword: process.env.SRV2_SFTP_PASSWORD!,
        sftpRoot: process.env.SRV2_SFTP_ROOT!
      };

      // Désactiver le bouton pendant le transfert
      const disabledButton = new ButtonBuilder()
        .setCustomId('start_transfer')
        .setLabel('🔄 Transfert en cours...')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('⏳')
        .setDisabled(true);

      const disabledRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(disabledButton);

      // Réponse initiale
      const initialEmbed = EmbedGenerator.createInitialEmbed();
      await interaction.reply({ 
        embeds: [initialEmbed],
        components: [disabledRow]
      });

      // Créer le service de transfert
      const transferService = new TransferService(srv1Config, srv2Config);
      
      // Configurer le callback de mise à jour du statut
      transferService.setStatusUpdateCallback((status) => {
        this.updateTransferStatus(status);
      });

      // Démarrer les mises à jour du statut Discord
      this.startStatusUpdates();

      try {
        // Démarrer le transfert avec mise à jour en temps réel
        await transferService.executeTransfer((tracker) => {
          const embed = EmbedGenerator.createTransferEmbed(tracker);
          interaction.editReply({ 
            embeds: [embed],
            components: [disabledRow]
          }).catch(error => {
            Logger.warning('Impossible de mettre à jour l\'embed', error);
          });
        });

        // Message final de succès avec bouton réactivé
        const successEmbed = EmbedGenerator.createSuccessEmbed(
          'Transfert terminé !',
          'La map a été transférée avec succès du serveur Build vers Staging !'
        );

        const enabledButton = new ButtonBuilder()
          .setCustomId('start_transfer')
          .setLabel('🚀 Démarrer un nouveau Transfert')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🏗️');

        const enabledRow = new ActionRowBuilder<ButtonBuilder>()
          .addComponents(enabledButton);

        await interaction.editReply({ 
          embeds: [successEmbed],
          components: [enabledRow]
        });

        Logger.success(`✅ Transfert terminé avec succès par ${interaction.user.tag} (via bouton)`);

      } finally {
        // Arrêter les mises à jour du statut
        this.stopStatusUpdates();
      }

    } catch (error: any) {
      Logger.error('❌ Erreur lors du transfert via bouton', error);

      // Arrêter les mises à jour du statut en cas d'erreur
      this.stopStatusUpdates();

      const errorEmbed = EmbedGenerator.createErrorEmbed(
        'Erreur lors du transfert',
        `Erreur: ${error.message}`
      );

      // Réactiver le bouton en cas d'erreur
      const enabledButton = new ButtonBuilder()
        .setCustomId('start_transfer')
        .setLabel('🚀 Réessayer le Transfert')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🔄');

      const enabledRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(enabledButton);

      try {
        await interaction.editReply({ 
          embeds: [errorEmbed],
          components: [enabledRow]
        });
      } catch (editError) {
        await interaction.followUp({ 
          embeds: [errorEmbed], 
          ephemeral: true 
        });
      }
    }
  }

  async start(): Promise<void> {
    const token = process.env.DISCORD_TOKEN;
    
    if (!token) {
      throw new Error('DISCORD_TOKEN est requis dans les variables d\'environnement');
    }

    try {
      // Connecter le bot (les commandes doivent être déployées séparément)
      await this.client.login(token);
      
      Logger.success('🚀 Bot démarré avec succès !');
      Logger.info('💡 Pour déployer les commandes, utilisez: npm run deploy');
      Logger.info('🔓 Mode accès libre activé - tous les utilisateurs peuvent lancer des transferts');
      Logger.info('📱 Statut Discord mis à jour toutes les 5 secondes pendant les transferts');
      
    } catch (error) {
      Logger.error('Erreur lors du démarrage du bot', error);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    try {
      Logger.info('Fermeture du bot...');
      
      // Arrêter les mises à jour du statut
      this.stopStatusUpdates();
      
      this.client.destroy();
      Logger.success('Bot fermé proprement');
      process.exit(0);
    } catch (error) {
      Logger.error('Erreur lors de la fermeture', error);
      process.exit(1);
    }
  }

  // Méthode utilitaire pour obtenir des statistiques
  getStats() {
    return {
      guilds: this.client.guilds.cache.size,
      users: this.client.users.cache.size,
      commands: this.commands.size,
      uptime: this.client.uptime,
      ping: this.client.ws.ping
    };
  }
}

// Fonction principale
async function main(): Promise<void> {
  try {
    // Vérifier les variables d'environnement critiques
    const requiredEnv = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID'];
    const missingEnv = requiredEnv.filter(env => !process.env[env]);
    
    if (missingEnv.length > 0) {
      Logger.error(`Variables d'environnement manquantes: ${missingEnv.join(', ')}`);
      Logger.info('💡 Créez un fichier .env avec les variables requises');
      process.exit(1);
    }

    Logger.info('🚀 Démarrage du Minecraft Transfer Bot...');
    Logger.info(`📍 Environnement: ${process.env.NODE_ENV || 'development'}`);
    Logger.info(`🐧 Plateforme: ${process.platform}`);
    Logger.info(`🟢 Node.js: ${process.version}`);
    Logger.info('🔓 Mode: Accès libre (tous les utilisateurs autorisés)');
    Logger.info('📱 Statut: Mise à jour automatique du statut Discord activée');

    const bot = new MinecraftTransferBot();
    await bot.start();

  } catch (error) {
    Logger.error('Erreur fatale lors du démarrage', error);
    process.exit(1);
  }
}

// Démarrer le bot si ce fichier est exécuté directement
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { MinecraftTransferBot };