import { 
  Client, 
  GatewayIntentBits, 
  Collection, 
  REST, 
  Routes,
  CommandInteraction,
  ActivityType
} from 'discord.js';
import { config } from 'dotenv';
import { Logger } from './utils/logger.js';
import * as buildCommand from './commands/build.js';

// Charger les variables d'environnement
config();

// Interface pour les commandes
interface Command {
  data: any;
  execute: (interaction: CommandInteraction) => Promise<void>;
}

class MinecraftTransferBot {
  private client: Client;
  private commands: Collection<string, Command>;

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
    this.client.once('ready', () => {
      if (!this.client.user) return;
      
      Logger.success(`🤖 Bot connecté en tant que ${this.client.user.tag}`);
      Logger.info(`📊 Présent sur ${this.client.guilds.cache.size} serveur(s)`);
      
      // Définir l'activité du bot
      this.client.user.setActivity('Transferts Minecraft', { 
        type: ActivityType.Watching 
      });
    });

    // Event: Interaction créée (slash commands)
    this.client.on('interactionCreate', async (interaction) => {
      if (!interaction.isChatInputCommand()) return;

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
    });

    // Event: Erreur non gérée
    this.client.on('error', (error) => {
      Logger.error('Erreur Discord.js', error);
    });

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

  async deployCommands(): Promise<void> {
    const token = process.env.DISCORD_TOKEN;
    const clientId = process.env.DISCORD_CLIENT_ID;

    if (!token || !clientId) {
      throw new Error('DISCORD_TOKEN et DISCORD_CLIENT_ID sont requis');
    }

    const rest = new REST().setToken(token);
    const commandsData = Array.from(this.commands.values()).map(command => command.data.toJSON());

    try {
      Logger.info(`🔄 Déploiement de ${commandsData.length} commande(s)...`);

      const data = await rest.put(
        Routes.applicationCommands(clientId),
        { body: commandsData }
      ) as any[];

      Logger.success(`✅ ${data.length} commande(s) déployée(s) avec succès !`);
    } catch (error) {
      Logger.error('Erreur lors du déploiement des commandes', error);
      throw error;
    }
  }

  async start(): Promise<void> {
    const token = process.env.DISCORD_TOKEN;
    
    if (!token) {
      throw new Error('DISCORD_TOKEN est requis dans les variables d\'environnement');
    }

    try {
      // Déployer les commandes
      await this.deployCommands();
      
      // Connecter le bot
      await this.client.login(token);
      
      Logger.success('🚀 Bot démarré avec succès !');
    } catch (error) {
      Logger.error('Erreur lors du démarrage du bot', error);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    try {
      Logger.info('Fermeture du bot...');
      this.client.destroy();
      Logger.success('Bot fermé proprement');
      process.exit(0);
    } catch (error) {
      Logger.error('Erreur lors de la fermeture', error);
      process.exit(1);
    }
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
      process.exit(1);
    }

    Logger.info('🚀 Démarrage du Minecraft Transfer Bot...');
    Logger.info(`📍 Environnement: ${process.env.NODE_ENV || 'development'}`);
    Logger.info(`🐧 Plateforme: ${process.platform}`);
    Logger.info(`🟢 Node.js: ${process.version}`);

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