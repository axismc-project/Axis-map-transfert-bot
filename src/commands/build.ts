import { 
  SlashCommandBuilder, 
  CommandInteraction, 
  PermissionFlagsBits,
  Message,
  ChatInputCommandInteraction
} from 'discord.js';
import { TransferService } from '../services/transfer.js';
import { EmbedGenerator } from '../utils/embed.js';
import { Logger } from '../utils/logger.js';
import { ServerConfig } from '../types/index.js';

export const data = new SlashCommandBuilder()
  .setName('build')
  .setDescription('Commandes de gestion du serveur de build')
  .addSubcommand(subcommand =>
    subcommand
      .setName('transfer')
      .setDescription('Transférer la map du serveur de build vers staging')
      .addStringOption(option =>
        option
          .setName('destination')
          .setDescription('Serveur de destination')
          .setRequired(true)
          .addChoices(
            { name: 'Staging', value: 'staging' }
          )
      )
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: CommandInteraction): Promise<void> {
  if (!interaction.isChatInputCommand()) return;

  const subcommand = interaction.options.getSubcommand();
  
  if (subcommand === 'transfer') {
    await handleTransferCommand(interaction);
  }
}

async function handleTransferCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const destination = interaction.options.getString('destination', true);
  
  if (destination !== 'staging') {
    await interaction.reply({
      embeds: [EmbedGenerator.createErrorEmbed(
        'Destination invalide',
        'Seule la destination "staging" est supportée actuellement.'
      )],
      ephemeral: true
    });
    return;
  }

  try {
    // Vérification des variables d'environnement
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

    // Réponse initiale
    const initialEmbed = EmbedGenerator.createInitialEmbed();
    await interaction.reply({ embeds: [initialEmbed] });

    // Créer le service de transfert
    const transferService = new TransferService(srv1Config, srv2Config);
    
    // Démarrer le transfert avec mise à jour en temps réel
    const message = await interaction.fetchReply() as Message;
    
    await transferService.executeTransfer((tracker) => {
      const embed = EmbedGenerator.createTransferEmbed(tracker);
      message.edit({ embeds: [embed] }).catch(error => {
        Logger.warning('Impossible de mettre à jour l\'embed', error);
      });
    });

    // Message final de succès
    const finalEmbed = EmbedGenerator.createSuccessEmbed(
      'Transfert terminé !',
      'La map a été transférée avec succès du serveur Build vers Staging !'
    );

    await message.edit({ embeds: [finalEmbed] });

    Logger.success(`Transfert terminé avec succès par ${interaction.user.tag}`);

  } catch (error: any) {
    Logger.error('Erreur lors du transfert', error);

    const errorEmbed = EmbedGenerator.createErrorEmbed(
      'Erreur lors du transfert',
      `Erreur: ${error.message}`
    );

    try {
      const message = await interaction.fetchReply() as Message;
      await message.edit({ embeds: [errorEmbed] });
    } catch (editError) {
      await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
    }
  }
}