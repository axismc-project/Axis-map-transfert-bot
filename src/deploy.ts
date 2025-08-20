import { REST, Routes } from 'discord.js';
import { config } from 'dotenv';
import { Logger } from './utils/logger.js';
import * as buildCommand from './commands/build.js';

// Charger les variables d'environnement
config();

async function deployCommands(): Promise<void> {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;
  const guildId = process.env.DISCORD_GUILD_ID; // Optionnel pour les commandes de guilde

  if (!token || !clientId) {
    Logger.error('DISCORD_TOKEN et DISCORD_CLIENT_ID sont requis');
    process.exit(1);
  }

  const commands = [
    buildCommand.data.toJSON()
  ];

  const rest = new REST().setToken(token);

  try {
    Logger.info(`🔄 Déploiement de ${commands.length} commande(s)...`);

    let data: any;

    if (guildId) {
      // Déploiement pour une guilde spécifique (plus rapide pour le développement)
      Logger.info(`📍 Déploiement sur la guilde: ${guildId}`);
      data = await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: commands }
      );
    } else {
      // Déploiement global (peut prendre jusqu'à 1 heure pour être disponible)
      Logger.info('🌍 Déploiement global des commandes');
      data = await rest.put(
        Routes.applicationCommands(clientId),
        { body: commands }
      );
    }

    Logger.success(`✅ ${(data as any[]).length} commande(s) déployée(s) avec succès !`);
    
    if (!guildId) {
      Logger.info('ℹ️  Les commandes globales peuvent prendre jusqu\'à 1 heure pour être disponibles');
    }

  } catch (error) {
    Logger.error('❌ Erreur lors du déploiement des commandes', error);
    process.exit(1);
  }
}

// Fonction pour supprimer toutes les commandes (utile pour le nettoyage)
async function clearCommands(): Promise<void> {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;
  const guildId = process.env.DISCORD_GUILD_ID;

  if (!token || !clientId) {
    Logger.error('DISCORD_TOKEN et DISCORD_CLIENT_ID sont requis');
    process.exit(1);
  }

  const rest = new REST().setToken(token);

  try {
    Logger.info('🗑️  Suppression de toutes les commandes...');

    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
      Logger.success('✅ Commandes de guilde supprimées');
    } else {
      await rest.put(Routes.applicationCommands(clientId), { body: [] });
      Logger.success('✅ Commandes globales supprimées');
    }

  } catch (error) {
    Logger.error('❌ Erreur lors de la suppression des commandes', error);
    process.exit(1);
  }
}

// Détecter l'action à effectuer
const action = process.argv[2];

switch (action) {
  case 'clear':
    clearCommands();
    break;
  case 'deploy':
  default:
    deployCommands();
    break;
}