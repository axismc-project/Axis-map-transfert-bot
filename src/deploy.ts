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

  } catch (error: any) {
    Logger.error('❌ Erreur lors du déploiement des commandes', error);
    
    if (error.code === 50001) {
      Logger.error('❌ Permissions insuffisantes. Vérifiez que le bot a le scope "applications.commands"');
    }
    if (error.code === 50035) {
      Logger.error('❌ Données de commande invalides. Vérifiez la structure de vos commandes');
    }
    
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
    }
    
    // Toujours nettoyer les commandes globales aussi
    await rest.put(Routes.applicationCommands(clientId), { body: [] });
    Logger.success('✅ Commandes globales supprimées');

  } catch (error: any) {
    Logger.error('❌ Erreur lors de la suppression des commandes', error);
    process.exit(1);
  }
}

// Fonction pour lister les commandes existantes
async function listCommands(): Promise<void> {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;
  const guildId = process.env.DISCORD_GUILD_ID;

  if (!token || !clientId) {
    Logger.error('DISCORD_TOKEN et DISCORD_CLIENT_ID sont requis');
    process.exit(1);
  }

  const rest = new REST().setToken(token);

  try {
    Logger.info('📋 Liste des commandes existantes...');

    if (guildId) {
      const guildCommands = await rest.get(Routes.applicationGuildCommands(clientId, guildId)) as any[];
      Logger.info(`🏠 Commandes de guilde (${guildCommands.length}) :`);
      guildCommands.forEach(cmd => Logger.info(`  - ${cmd.name}: ${cmd.description}`));
    }

    const globalCommands = await rest.get(Routes.applicationCommands(clientId)) as any[];
    Logger.info(`🌍 Commandes globales (${globalCommands.length}) :`);
    globalCommands.forEach(cmd => Logger.info(`  - ${cmd.name}: ${cmd.description}`));

  } catch (error: any) {
    Logger.error('❌ Erreur lors de la liste des commandes', error);
    process.exit(1);
  }
}

// Détecter l'action à effectuer
const action = process.argv[2];

switch (action) {
  case 'clear':
    clearCommands();
    break;
  case 'list':
    listCommands();
    break;
  case 'guild':
    // Force le déploiement en guilde même si DISCORD_GUILD_ID n'est pas défini
    if (!process.env.DISCORD_GUILD_ID) {
      Logger.error('DISCORD_GUILD_ID est requis pour le déploiement en guilde');
      process.exit(1);
    }
    deployCommands();
    break;
  case 'deploy':
  default:
    deployCommands();
    break;
}