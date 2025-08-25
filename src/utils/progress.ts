import { TransferProgress } from '../types/index.js';

export class ProgressTracker {
  private steps: TransferProgress[] = [];
  
  constructor() {
    this.initializeSteps();
  }

  private initializeSteps(): void {
    const stepsList = [
      'Préparation du transfert',
      'Arrêt srv1 & srv2',
      'Compression /world srv1',
      'Sauvegarde playerdata srv2',
      'Transfert SFTP srv1 → srv2',
      'Auto-restart serveur Build', // 🆕 NOUVELLE ÉTAPE
      'Suppression ancien /world srv2',
      'Décompression nouvelle map', // Avec polling étendu 2h
      'Nettoyage fichiers',
      'Restauration playerdata srv2',
      'Redémarrage serveur Staging'
    ];

    this.steps = stepsList.map((step) => ({
      step,
      progress: 0,
      status: 'pending' as const,
      message: 'En attente...',
      timestamp: new Date()
    }));
  }

  updateStep(stepIndex: number, status: TransferProgress['status'], message: string, progress: number = 0): void {
    if (this.steps[stepIndex]) {
      this.steps[stepIndex] = {
        ...this.steps[stepIndex],
        status,
        message,
        progress,
        timestamp: new Date()
      };
    }
  }

  getCurrentStep(): number {
    return this.steps.findIndex(step => step.status === 'running');
  }

  getOverallProgress(): number {
    const completedSteps = this.steps.filter(step => step.status === 'completed').length;
    const currentStep = this.getCurrentStep();
    const currentProgress = currentStep >= 0 ? this.steps[currentStep].progress : 0;
    
    return Math.round(((completedSteps + currentProgress / 100) / this.steps.length) * 100);
  }

  getSteps(): TransferProgress[] {
    return this.steps;
  }

  hasErrors(): boolean {
    return this.steps.some(step => step.status === 'error');
  }

  isCompleted(): boolean {
    return this.steps.every(step => step.status === 'completed');
  }
}