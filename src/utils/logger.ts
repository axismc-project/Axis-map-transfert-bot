export class Logger {
  private static formatTimestamp(): string {
    return new Date().toISOString().replace('T', ' ').substring(0, 19);
  }

  static info(message: string, data?: any): void {
    console.log(`[${this.formatTimestamp()}] ℹ️  ${message}`, data ? data : '');
  }

  static success(message: string, data?: any): void {
    console.log(`[${this.formatTimestamp()}] ✅ ${message}`, data ? data : '');
  }

  static warning(message: string, data?: any): void {
    console.warn(`[${this.formatTimestamp()}] ⚠️  ${message}`, data ? data : '');
  }

  static error(message: string, error?: any): void {
    console.error(`[${this.formatTimestamp()}] ❌ ${message}`, error ? error : '');
  }

  static debug(message: string, data?: any): void {
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[${this.formatTimestamp()}] 🐛 ${message}`, data ? data : '');
    }
  }
}