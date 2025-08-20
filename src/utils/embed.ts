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
    consoleContent += '  "transfer": "BUILD → STAGING",\n';
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
      consoleContent += `      "icon": "${icon}"\n`;
      
      // Afficher le message détaillé pour l'étape en cours
      if (step.status === 'running' && step.message && step.message !== 'En cours...') {
        consoleContent += `      "details": "${step.message}",\n`;
      }
      
      consoleContent += `    }${isLast ? '' : ','}\n`;
    });

    consoleContent += '  ],\n';
    
    // Status général
    let statusMessage = '';
    if (hasErrors) {
      statusMessage = 'ERROR: Transfert interrompu';
    } else if (isCompleted) {
      statusMessage = 'SUCCESS: Transfert terminé avec succès';
    } else {
      const currentStepIndex = tracker.getCurrentStep();
      const currentStep = currentStepIndex >= 0 ? steps[currentStepIndex] : null;
      statusMessage = currentStep ? `RUNNING: ${currentStep.step}...` : 'INITIALIZING: Préparation...';
    }
    
    consoleContent += `  "message": "${statusMessage}",\n`;
    consoleContent += `  "timestamp": "${new Date().toISOString()}"\n`;
    consoleContent += '}\n';
    consoleContent += '```';

    // Couleur de l'embed selon le status
    let color: number;
    if (hasErrors) color = 0xf04747;
    else if (isCompleted) color = 0x43b581;
    else color = 0xfaa61a;

    const embed = new EmbedBuilder()
      .setTitle('🏗️ Transfert de Map Minecraft')
      .setDescription(consoleContent)
      .setColor(color)
      .setTimestamp();

    // Footer avec informations additionnelles
    if (isCompleted) {
      embed.setFooter({ text: '✅ Transfert terminé avec succès !' });
    } else if (hasErrors) {
      embed.setFooter({ text: '❌ Erreur lors du transfert' });
    } else {
      const currentStepIndex = tracker.getCurrentStep();
      const totalSteps = steps.length;
      embed.setFooter({ 
        text: `🔄 Étape ${currentStepIndex + 1}/${totalSteps} en cours...`
      });
    }

    return embed;
  }

  static createInitialEmbed(): EmbedBuilder {
    const consoleContent = '```yaml\n' +
      '# ========================================\n' +
      '# MINECRAFT MAP TRANSFER SYSTEM\n' +
      '# ========================================\n' +
      '\n' +
      'transfer_status: INITIALIZING\n' +
      'progress: [░░░░░░░░░░░░░░░░░░░░] 0%\n' +
      '\n' +
      'current_step: "Préparation du transfert"\n' +
      'details:\n' +
      '  - "✓ Vérification des configurations"\n' +
      '  - "✓ Initialisation des services"\n' +
      '  - "⏳ Connexion aux serveurs..."\n' +
      '\n' +
      'servers:\n' +
      '  source: "BUILD SERVER"\n' +
      '  target: "STAGING SERVER"\n' +
      '  method: "SFTP_DIRECT_TRANSFER"\n' +
      '\n' +
      'status: "🔄 Initialisation en cours..."\n' +
      '```';

    return new EmbedBuilder()
      .setTitle('🚀 Initialisation du Transfert')
      .setDescription(consoleContent)
      .setColor(0x0099ff)
      .setTimestamp()
      .setFooter({ text: '🔄 Préparation en cours...' });
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
    consoleContent += '- ERROR: TRANSFER FAILED\n';
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
    consoleContent += '+ • Contact administrator if needed\n';
    consoleContent += '```';

    return new EmbedBuilder()
      .setTitle(`❌ ${title}`)
      .setDescription(consoleContent)
      .setColor(0xf04747)
      .setTimestamp();
  }

  static createSuccessEmbed(title: string, description: string): EmbedBuilder {
    const consoleContent = '```diff\n' +
      '+ ========================================\n' +
      '+ SUCCESS: TRANSFER COMPLETED\n' +
      '+ ========================================\n' +
      '\n' +
      `+ ${description}\n` +
      '\n' +
      '+ SUMMARY:\n' +
      '+ • Map compressed and transferred ✅\n' +
      '+ • PlayerData preserved ✅\n' +
      '+ • Servers restarted ✅\n' +
      '+ • Files cleaned up ✅\n' +
      '\n' +
      '+ 🎮 STAGING SERVER IS READY!\n' +
      '```';

    return new EmbedBuilder()
      .setTitle(`✅ ${title}`)
      .setDescription(consoleContent)
      .setColor(0x43b581)
      .setTimestamp();
  }
}