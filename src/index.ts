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
  ButtonInteraction,
  TextBasedChannel
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

// ✅ Type pour les canaux où on peut envoyer des messages
type SendableChannel = TextBasedChannel & {
  send: (options: any) => Promise<any>;
};

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
    }, 5000); // Statut Discord toutes les 5 secondes
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
        .setTitle('🚀 Minecraft Transfer Bot v3.1 - Messages Normaux!')
        .setDescription('```yaml\n' +
          '# ========================================\n' +
          '# MINECRAFT MAP TRANSFER SYSTEM v3.1\n' +
          '# ========================================\n' +
          '\n' +
          'status: ONLINE ✅\n' +
          'version: v3.1.0\n' +
          'uptime: Just started\n' +
          '\n' +
          'services:\n' +
          '  - discord_bot: READY\n' +
          '  - pterodactyl_api: ENHANCED\n' +
          '  - sftp_transfer: OPTIMIZED\n' +
          '  - extraction_polling: FIXED\n' +
          '\n' +
          'servers:\n' +
          '  source: BUILD_SERVER\n' +
          '  target: STAGING_SERVER\n' +
          '\n' +
          'features:\n' +
          '  - automatic_transfer: ENABLED\n' +
          '  - playerdata_backup: ENABLED\n' +
          '  - progress_tracking: REAL_TIME\n' +
          '  - rollback_protection: ENHANCED\n' +
          '  - message_updates: NORMAL_MESSAGES\n' +
          '  - embed_updates: 5 SECONDS\n' +
          '  - status_updates: 5 SECONDS\n' +
          '  - extraction_fix: ARRAY_SAFE\n' +
          '\n' +
          'optimizations:\n' +
          '  - no_webhook_tokens: TRUE\n' +
          '  - normal_messages: STABLE\n' +
          '  - smart_polling: 5s_intervals\n' +
          '  - extraction_safe: NULL_CHECKS\n' +
          '  - embed_refresh: 5s\n' +
          '  - status_refresh: 5s\n' +
          '\n' +
          'ready_for_transfer: true\n' +
          'access_level: PUBLIC\n' +
          '```')
        .setColor(0x00ff00)
        .setTimestamp()
        .setFooter({ 
          text: '🎮 v3.1 - Messages normaux - Extraction corrigée - Stable',
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
            name: '🔧 Nouveautés v3.1',
            value: '• **Messages normaux** (plus de webhooks)\n' +
                   '• **Extraction corrigée** (null checks)\n' +
                   '• **Polling sécurisé** avec gestion d\'erreurs\n' +
                   '• **Statut Discord** (5 secondes)\n' +
                   '• **Embeds stables** (5 secondes)\n' +
                   '• **Performance maximale** garantie',
            inline: true
          }
        );

      // Créer le bouton de transfert
      const transferButton = new ButtonBuilder()
        .setCustomId('start_transfer')
        .setLabel('🚀 Démarrer Transfert v3.1')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('⚡');

      const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(transferButton);

      // Envoyer le message
      await channel.send({
        embeds: [embed],
        components: [row]
      });

      Logger.success(`✅ Embed de démarrage v3.1 envoyé dans le canal ${channelId}`);

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

  // ✅ Helper function simplifiée pour vérifier si le canal peut envoyer des messages
  private isSendableChannel(channel: any): channel is SendableChannel {
    return channel && 
           typeof channel.send === 'function' && 
           channel.isTextBased && 
           channel.isTextBased();
  }

  private async handleTransferButton(interaction: ButtonInteraction): Promise<void> {
    try {
      Logger.info(`🚀 Transfert v3.1 demandé par ${interaction.user.tag} (${interaction.user.id})`);

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

      // ✅ RÉPONSE IMMÉDIATE À L'INTERACTION (évite timeout)
      await interaction.reply({
        content: '🚀 **Transfert v3.1 démarré !** Message de suivi envoyé ci-dessous...',
        ephemeral: false
      });

      // ✅ OBTENIR LE CANAL ET VÉRIFIER QU'IL PEUT ENVOYER DES MESSAGES
      const channel = interaction.channel;
      if (!this.isSendableChannel(channel)) {
        await interaction.followUp({ 
          content: '❌ Impossible d\'accéder au canal pour le suivi.',
          ephemeral: true 
        });
        return;
      }

      // Créer l'embed initial
      const initialEmbed = EmbedGenerator.createInitialEmbed();
      
      // ✅ ENVOYER UN MESSAGE NORMAL (pas d'interaction)
      const trackingMessage = await channel.send({
        embeds: [initialEmbed],
        content: `📊 **Suivi du transfert v3.1 demandé par ${interaction.user}**`
      });

      Logger.success(`✅ Message de suivi créé: ${trackingMessage.id}`);

      // Créer le service de transfert
      const transferService = new TransferService(srv1Config, srv2Config);
      
      // Configurer le callback de mise à jour du statut Discord
      transferService.setStatusUpdateCallback((status) => {
        this.updateTransferStatus(status);
      });

      // Démarrer les mises à jour du statut Discord
      this.startStatusUpdates();

      try {
        // ✅ TRANSFERT AVEC MISES À JOUR DU MESSAGE NORMAL
        let lastUpdateTime = 0;
        
        await transferService.executeTransfer((tracker) => {
          const now = Date.now();
          // Mettre à jour le message normal toutes les 5 secondes
          if (now - lastUpdateTime >= 5000) {
            const embed = EmbedGenerator.createTransferEmbed(tracker);
            
            // ✅ ÉDITER LE MESSAGE NORMAL (pas de webhook)
            trackingMessage.edit({ 
              embeds: [embed],
              content: `📊 **Suivi du transfert v3.1 demandé par ${interaction.user}** - 🔄 En cours...`
            }).catch((error: any) => {
              Logger.warning('Impossible de mettre à jour le message de suivi', error);
            });
            
            lastUpdateTime = now;
          }
        });

        // ✅ MESSAGE FINAL DE SUCCÈS
        const successEmbed = EmbedGenerator.createSuccessEmbed(
          'Transfert v3.1 terminé !',
          'La map a été transférée avec succès avec l\'extraction corrigée !'
        );

        await trackingMessage.edit({ 
          embeds: [successEmbed],
          content: `📊 **Transfert v3.1 demandé par ${interaction.user}** - ✅ **TERMINÉ AVEC SUCCÈS !**`
        });

        Logger.success(`✅ Transfert v3.1 terminé avec succès par ${interaction.user.tag} (via bouton)`);

      } finally {
        // Arrêter les mises à jour du statut
        this.stopStatusUpdates();
      }

    } catch (error: any) {
      Logger.error('❌ Erreur lors du transfert v3.1 via bouton', error);

      // Arrêter les mises à jour du statut en cas d'erreur
      this.stopStatusUpdates();

      try {
        // Essayer de mettre à jour le message de suivi avec l'erreur
        const errorEmbed = EmbedGenerator.createErrorEmbed(
          'Erreur lors du transfert v3.1',
          `Erreur: ${error.message}`
        );

        // Si on a accès au canal, chercher le message de suivi
        const channel = interaction.channel;
        if (this.isSendableChannel(channel)) {
          // Trouver le dernier message de suivi (envoyé par le bot)
          const messages = await channel.messages.fetch({ limit: 10 });
          const trackingMessage = messages.find(msg => 
            msg.author.id === this.client.user?.id && 
            msg.content.includes(`Suivi du transfert v3.1 demandé par ${interaction.user}`)
          );

          if (trackingMessage) {
            await trackingMessage.edit({ 
              embeds: [errorEmbed],
              content: `📊 **Transfert v3.1 demandé par ${interaction.user}** - ❌ **ERREUR**`
            });
          } else {
            // Fallback: envoyer un nouveau message d'erreur
            await channel.send({
              embeds: [errorEmbed],
              content: `❌ **Erreur du transfert v3.1 demandé par ${interaction.user}**`
            });
          }
        }

      } catch (editError) {
        Logger.error('❌ Impossible de mettre à jour le message d\'erreur', editError);
        
        // Fallback ultime: followUp sur l'interaction
        try {
          await interaction.followUp({ 
            content: `❌ **Erreur lors du transfert v3.1**: ${error.message}`,
            ephemeral: true 
          });
        } catch (followUpError) {
          Logger.error('❌ Impossible d\'envoyer le followUp d\'erreur', followUpError);
        }
      }
    }
  }

  async start(): Promise<void> {
    const token = process.env.DISCORD_TOKEN;
    
    if (!token) {
      throw new Error('DISCORD_TOKEN est requis dans les variables d\'environnement');
    }

    try {
      // Connecter le bot
      await this.client.login(token);
      
      Logger.success('🚀 Bot v3.1 démarré avec succès !');
      Logger.info('💡 Pour déployer les commandes, utilisez: npm run deploy');
      Logger.info('🔓 Mode accès libre activé - tous les utilisateurs peuvent lancer des transferts');
      Logger.info('📱 Statut Discord mis à jour toutes les 5 secondes pendant les transferts');
      Logger.info('📋 Embeds mis à jour toutes les 5 secondes (messages normaux)');
      Logger.info('🚫 Webhooks complètement supprimés');
      Logger.info('🔍 Extraction corrigée avec vérifications null/undefined');
      
    } catch (error) {
      Logger.error('Erreur lors du démarrage du bot v3.1', error);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    try {
      Logger.info('Fermeture du bot v3.1...');
      
      // Arrêter les mises à jour du statut
      this.stopStatusUpdates();
      
      this.client.destroy();
      Logger.success('Bot v3.1 fermé proprement');
      process.exit(0);
    } catch (error) {
      Logger.error('Erreur lors de la fermeture v3.1', error);
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

    Logger.info('🚀 Démarrage du Minecraft Transfer Bot v3.1...');
    Logger.info(`📍 Environnement: ${process.env.NODE_ENV || 'development'}`);
    Logger.info(`🐧 Plateforme: ${process.platform}`);
    Logger.info(`🟢 Node.js: ${process.version}`);
    Logger.info('🔓 Mode: Accès libre (tous les utilisateurs autorisés)');
    Logger.info('📱 Statut Discord: Mise à jour automatique (5 secondes)');
    Logger.info('📋 Embeds: Messages normaux (5 secondes)');
    Logger.info('🚫 Webhooks: Complètement supprimés');
    Logger.info('🔍 Extraction: Polling sécurisé avec null checks');

    const bot = new MinecraftTransferBot();
    await bot.start();

  } catch (error) {
    Logger.error('Erreur fatale lors du démarrage v3.1', error);
    process.exit(1);
  }
}

// Démarrer le bot si ce fichier est exécuté directement
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { MinecraftTransferBot };