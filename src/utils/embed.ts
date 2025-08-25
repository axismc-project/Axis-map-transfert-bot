import { EmbedBuilder } from 'discord.js';
import { ProgressTracker, TransferProgress } from '../types/index.js';

export class EmbedGenerator {
  
  static createTransferEmbed(tracker: ProgressTracker): EmbedBuilder {
    const steps = tracker.getSteps();
    const overallProgress = tracker.getOverallProgress();
    const hasErrors = tracker.hasErrors();
    const isCompleted = tracker.isCompleted();

    // Construction de la console avec formatage JSON pour les couleurs
    let consoleContent = '```json\n';
    
    // Header avec style JSON
    consoleContent += '{\n';
    consoleContent += '  "transfer": "BUILD → STAGING v3.2",\n';
    consoleContent += '  "method": "AUTO_REFRESH_EMBED",\n';
    consoleContent += '  "extraction": "EXTENDED_POLLING_2H",\n';
    consoleContent += '  "auto_restart": "SRV1_AFTER_TRANSFER",\n';
    consoleContent += '  "status": "' + (hasErrors ? 'ERROR' : isCompleted ? 'COMPLETED' : 'RUNNING') + '",\n';
    consoleContent += `  "progress": "${this.generateProgressBar(overallProgress)} ${overallProgress}%",\n`;
    consoleContent += '  "steps": [\n';

    // Étapes avec formatage et icônes
    steps.forEach((step, index) => {
      const icon = this.getStepIcon(step.status);
      const statusText = step.status.toUpperCase();
      const isLast = index === steps.length - 1;
      
      consoleContent += `    {\n`;
      consoleContent += `      "id": ${index + 1},\n`;
      consoleContent += `      "name": "${step.step}",\n`;
      consoleContent += `      "status": "${statusText}",\n`;
      consoleContent += `      "icon": "${icon}"`;
      
      // Afficher le message détaillé pour l'étape en cours
      if (step.status === 'running' && step.message && step.message !== 'En cours...') {
        const truncatedMessage = step.message.length > 50 
          ? step.message.substring(0, 50) + '...' 
          : step.message;
        consoleContent += `,\n      "details": "${truncatedMessage}"`;
      }
      
      consoleContent += `\n    }${isLast ? '' : ','}\n`;
    });

    consoleContent += '  ],\n';
    
    // Status général
    let statusMessage = '';
    if (hasErrors) {
      statusMessage = 'ERROR: Transfert interrompu - Rollback en cours';
    } else if (isCompleted) {
      statusMessage = 'SUCCESS: Transfert terminé - Auto-restart effectué';
    } else {
      const currentStepIndex = tracker.getCurrentStep();
      const currentStep = currentStepIndex >= 0 ? steps[currentStepIndex] : null;
      statusMessage = currentStep ? `RUNNING: ${currentStep.step}...` : 'INITIALIZING: Préparation...';
    }
    
    consoleContent += `  "message": "${statusMessage}",\n`;
    consoleContent += `  "embed_refresh": "15min_auto_recreation",\n`;
    consoleContent += `  "extraction_timeout": "2h_with_5min_polling",\n`;
    consoleContent += `  "last_update": "${new Date().toISOString()}"\n`;
    consoleContent += '}\n';
    consoleContent += '```';

    // Couleur de l'embed selon le status
    let color: number;
    if (hasErrors) color = 0xf04747; // Rouge
    else if (isCompleted) color = 0x43b581; // Vert
    else color = 0xfaa61a; // Orange

    const embed = new EmbedBuilder()
      .setTitle('🏗️ Transfert de Map Minecraft v3.2')
      .setDescription(consoleContent)
      .setColor(color)
      .setTimestamp();

    // Footer avec informations additionnelles
    if (isCompleted) {
      embed.setFooter({ text: '✅ Transfert v3.2 terminé ! Auto-refresh + Auto-restart + Polling étendu' });
    } else if (hasErrors) {
      embed.setFooter({ text: '❌ Erreur v3.2 - Rollback automatique en cours' });
    } else {
      const currentStepIndex = tracker.getCurrentStep();
      const totalSteps = steps.length;
      embed.setFooter({ 
        text: `🔄 Étape ${currentStepIndex + 1}/${totalSteps} - Auto-refresh (15min) + Polling étendu (5min)`
      });
    }

    return embed;
  }

  static createInitialEmbed(): EmbedBuilder {
    const consoleContent = '```yaml\n' +
      '# ========================================\n' +
      '# MINECRAFT MAP TRANSFER SYSTEM v3.2\n' +
      '# ========================================\n' +
      '\n' +
      'transfer_status: INITIALIZING\n' +
      'method: AUTO_REFRESH_EMBED\n' +
      'extraction: EXTENDED_POLLING_2H\n' +
      'auto_restart: SRV1_AFTER_TRANSFER\n' +
      'progress: [░░░░░░░░░░░░░░░░░░░░] 0%\n' +
      '\n' +
      'current_step: "Préparation du transfert"\n' +
      'update_method: "Message normal (auto-refresh)"\n' +
      'update_interval: "5 secondes + 15min recreation"\n' +
      '\n' +
      'details:\n' +
      '  - "✓ Vérification des configurations"\n' +
      '  - "✓ Initialisation des services"\n' +
      '  - "✓ Auto-refresh embed (15 minutes)"\n' +
      '  - "✓ Extraction étendue (2h timeout)"\n' +
      '  - "✓ Auto-restart srv1 après transfert"\n' +
      '  - "⏳ Connexion aux serveurs..."\n' +
      '\n' +
      'servers:\n' +
      '  source: "BUILD SERVER (auto-restart)"\n' +
      '  target: "STAGING SERVER"\n' +
      '  method: "SFTP_DIRECT_TRANSFER"\n' +
      '\n' +
      'improvements_v3_2:\n' +
      '  - "🔄 Embed auto-refresh (15 minutes)"\n' +
      '  - "⏰ Extraction timeout étendu (2 heures)"\n' +
      '  - "🔍 Polling robuste (5 minutes)"\n' +
      '  - "🚀 Auto-restart srv1 après transfert"\n' +
      '  - "📋 Messages stables et persistants"\n' +
      '  - "🎯 11 étapes optimisées"\n' +
      '\n' +
      'status: "🔄 Initialisation v3.2 en cours..."\n' +
      '```';

    return new EmbedBuilder()
      .setTitle('🚀 Initialisation du Transfert v3.2')
      .setDescription(consoleContent)
      .setColor(0x0099ff)
      .setTimestamp()
      .setFooter({ text: '🔄 Préparation v3.2 - Auto-refresh + Polling étendu + Auto-restart' });
  }

  private static generateProgressBar(progress: number): string {
    const totalBars = 20;
    const filledBars = Math.floor((progress / 100) * totalBars);
    const emptyBars = totalBars - filledBars;
    
    return `[${'█'.repeat(filledBars)}${'░'.repeat(emptyBars)}]`;
  }

  private static getStepIcon(status: TransferProgress['status']): string {
    switch (status) {
      case 'completed': return '✅';
      case 'running': return '🔄';
      case 'error': return '❌';
      default: return '⏳';
    }
  }

  static createErrorEmbed(title: string, description: string, error?: any): EmbedBuilder {
    let consoleContent = '```diff\n';
    consoleContent += '- ========================================\n';
    consoleContent += '- ERROR: TRANSFER FAILED v3.2\n';
    consoleContent += '- ========================================\n';
    consoleContent += '\n';
    consoleContent += `! ${description}\n`;
    
    if (error && process.env.NODE_ENV === 'development') {
      consoleContent += '\n';
      consoleContent += '- DEBUG INFORMATION:\n';
      consoleContent += `! ${error.toString().substring(0, 200)}...\n`;
    }
    
    consoleContent += '\n';
    consoleContent += '+ SUGGESTED ACTIONS:\n';
    consoleContent += '+ • Check server connectivity\n';
    consoleContent += '+ • Verify SFTP credentials\n';
    consoleContent += '+ • Review server logs\n';
    consoleContent += '+ • Try again with the button\n';
    consoleContent += '+ • Check extraction process (2h timeout)\n';
    consoleContent += '+ • Contact administrator if needed\n';
    consoleContent += '\n';
    consoleContent += '+ v3.2 FEATURES:\n';
    consoleContent += '+ • Auto-refresh embed (15 minutes)\n';
    consoleContent += '+ • Extended extraction (2h timeout)\n' +
    consoleContent += '+ • Robust polling (5min intervals)\n';
    consoleContent += '+ • Auto-restart srv1 after transfer\n';
    consoleContent += '```';

    return new EmbedBuilder()
      .setTitle(`❌ ${title}`)
      .setDescription(consoleContent)
      .setColor(0xf04747)
      .setTimestamp()
      .setFooter({ text: '❌ Erreur v3.2 - Auto-refresh + rollback automatique' });
  }

  static createSuccessEmbed(title: string, description: string): EmbedBuilder {
    const consoleContent = '```diff\n' +
      '+ ========================================\n' +
      '+ SUCCESS: TRANSFER COMPLETED v3.2\n' +
      '+ ========================================\n' +
      '\n' +
      `+ ${description}\n` +
      '\n' +
      '+ SUMMARY:\n' +
      '+ • Map compressed and transferred ✅\n' +
      '+ • PlayerData preserved ✅\n' +
      '+ • Servers restarted (srv1 auto) ✅\n' +
      '+ • Files cleaned up ✅\n' +
      '+ • Extraction completed (extended polling) ✅\n' +
      '+ • Embed auto-refreshed ✅\n' +
      '\n' +
      '+ v3.2 IMPROVEMENTS:\n' +
      '+ • Auto-refresh embed (recreation 15min)\n' +
      '+ • Extended extraction (2h timeout, 5min polling)\n' +
      '+ • Auto-restart srv1 (immediate after transfer)\n' +
      '+ • Enhanced stability (message persistence)\n' +
      '+ • Robust error handling (11 steps)\n' +
      '+ • Optimized user experience (real-time)\n' +
      '\n' +
      '+ 🎮 BOTH SERVERS ARE READY!\n' +
      '+ 🏗️ BUILD SERVER: Auto-restarted\n' +
      '+ 🎯 STAGING SERVER: Ready with new map\n' +
      '```';

    return new EmbedBuilder()
      .setTitle(`✅ ${title}`)
      .setDescription(consoleContent)
      .setColor(0x43b581)
      .setTimestamp()
      .setFooter({ text: '✅ Succès v3.2 - Auto-refresh + Auto-restart + Polling étendu' });
  }
}