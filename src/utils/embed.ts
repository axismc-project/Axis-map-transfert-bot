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
    consoleContent += '  "transfer": "BUILD → STAGING v3.1",\n';
    consoleContent += '  "method": "NORMAL_MESSAGE_UPDATE",\n';
    consoleContent += '  "extraction": "ARRAY_SAFE_FIXED",\n';
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
        consoleContent += `,\n      "details": "${step.message.substring(0, 50)}..."`;
      }
      
      consoleContent += `\n    }${isLast ? '' : ','}\n`;
    });

    consoleContent += '  ],\n';
    
    // Status général
    let statusMessage = '';
    if (hasErrors) {
      statusMessage = 'ERROR: Transfert interrompu - Rollback en cours';
    } else if (isCompleted) {
      statusMessage = 'SUCCESS: Transfert terminé - Serveurs redémarrés';
    } else {
      const currentStepIndex = tracker.getCurrentStep();
      const currentStep = currentStepIndex >= 0 ? steps[currentStepIndex] : null;
      statusMessage = currentStep ? `RUNNING: ${currentStep.step}...` : 'INITIALIZING: Préparation...';
    }
    
    consoleContent += `  "message": "${statusMessage}",\n`;
    consoleContent += `  "last_update": "${new Date().toISOString()}"\n`;
    consoleContent += '}\n';
    consoleContent += '```';

    // Couleur de l'embed selon le status
    let color: number;
    if (hasErrors) color = 0xf04747; // Rouge
    else if (isCompleted) color = 0x43b581; // Vert
    else color = 0xfaa61a; // Orange

    const embed = new EmbedBuilder()
      .setTitle('🏗️ Transfert de Map Minecraft v3.1')
      .setDescription(consoleContent)
      .setColor(color)
      .setTimestamp();

    // Footer avec informations additionnelles
    if (isCompleted) {
      embed.setFooter({ text: '✅ Transfert v3.1 terminé ! Messages normaux + extraction corrigée' });
    } else if (hasErrors) {
      embed.setFooter({ text: '❌ Erreur v3.1 - Rollback automatique en cours' });
    } else {
      const currentStepIndex = tracker.getCurrentStep();
      const totalSteps = steps.length;
      embed.setFooter({ 
        text: `🔄 Étape ${currentStepIndex + 1}/${totalSteps} - Message normal mis à jour (5s)`
      });
    }

    return embed;
  }

  static createInitialEmbed(): EmbedBuilder {
    const consoleContent = '```yaml\n' +
      '# ========================================\n' +
      '# MINECRAFT MAP TRANSFER SYSTEM v3.1\n' +
      '# ========================================\n' +
      '\n' +
      'transfer_status: INITIALIZING\n' +
      'method: NORMAL_MESSAGE_UPDATE\n' +
      'extraction: ARRAY_SAFE_POLLING\n' +
      'progress: [░░░░░░░░░░░░░░░░░░░░] 0%\n' +
      '\n' +
      'current_step: "Préparation du transfert"\n' +
      'update_method: "Message normal (stable)"\n' +
      'update_interval: "5 secondes"\n' +
      '\n' +
      'details:\n' +
      '  - "✓ Vérification des configurations"\n' +
      '  - "✓ Initialisation des services"\n' +
      '  - "✓ Correction extraction (null checks)"\n' +
      '  - "⏳ Connexion aux serveurs..."\n' +
      '\n' +
      'servers:\n' +
      '  source: "BUILD SERVER"\n' +
      '  target: "STAGING SERVER"\n' +
      '  method: "SFTP_DIRECT_TRANSFER"\n' +
      '\n' +
      'fixes_v3_1:\n' +
      '  - "✅ Messages normaux (pas de webhooks)"\n' +
      '  - "✅ Extraction sécurisée (array checks)"\n' +
      '  - "✅ Polling robuste (error handling)"\n' +
      '  - "✅ Statut Discord stable (5 secondes)"\n' +
      '  - "✅ Embeds fiables (message normal)"\n' +
      '\n' +
      'status: "🔄 Initialisation v3.1 en cours..."\n' +
      '```';

    return new EmbedBuilder()
      .setTitle('🚀 Initialisation du Transfert v3.1')
      .setDescription(consoleContent)
      .setColor(0x0099ff)
      .setTimestamp()
      .setFooter({ text: '🔄 Préparation v3.1 - Message normal + extraction corrigée' });
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
    consoleContent += '- ERROR: TRANSFER FAILED v3.1\n';
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
    consoleContent += '+ • Check extraction process\n';
    consoleContent += '+ • Contact administrator if needed\n';
    consoleContent += '\n';
    consoleContent += '+ v3.1 FEATURES:\n';
    consoleContent += '+ • Normal messages (no webhook issues)\n';
    consoleContent += '+ • Fixed extraction (array safety)\n';
    consoleContent += '+ • Robust polling (error handling)\n';
    consoleContent += '```';

    return new EmbedBuilder()
      .setTitle(`❌ ${title}`)
      .setDescription(consoleContent)
      .setColor(0xf04747)
      .setTimestamp()
      .setFooter({ text: '❌ Erreur v3.1 - Message normal + rollback automatique' });
  }

  static createSuccessEmbed(title: string, description: string): EmbedBuilder {
    const consoleContent = '```diff\n' +
      '+ ========================================\n' +
      '+ SUCCESS: TRANSFER COMPLETED v3.1\n' +
      '+ ========================================\n' +
      '\n' +
      `+ ${description}\n` +
      '\n' +
      '+ SUMMARY:\n' +
      '+ • Map compressed and transferred ✅\n' +
      '+ • PlayerData preserved ✅\n' +
      '+ • Servers restarted ✅\n' +
      '+ • Files cleaned up ✅\n' +
      '+ • Extraction fixed ✅\n' +
      '+ • Messages stable ✅\n' +
      '\n' +
      '+ v3.1 IMPROVEMENTS:\n' +
      '+ • Normal messages (no webhook tokens)\n' +
      '+ • Safe array operations (null checks)\n' +
      '+ • Robust error handling (polling)\n' +
      '+ • Stable status updates (5 seconds)\n' +
      '+ • Reliable embed updates (message edit)\n' +
      '\n' +
      '+ 🎮 STAGING SERVER IS READY!\n' +
      '```';

    return new EmbedBuilder()
      .setTitle(`✅ ${title}`)
      .setDescription(consoleContent)
      .setColor(0x43b581)
      .setTimestamp()
      .setFooter({ text: '✅ Succès v3.1 - Transfert terminé avec améliorations' });
  }
}