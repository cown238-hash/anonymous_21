type Handler = (type: 'success' | 'error' | 'info', message: string) => void;

class ToastCenter {
  handlers: Handler[] = [];

  emit(type: 'success' | 'error' | 'info', message: string) {
    if (this.handlers.length === 0) return;
    for (const h of this.handlers) h(type, message);
  }

  success(message: string) {
    this.emit('success', message);
  }
  error(message: string) {
    this.emit('error', message);
  }
  info(message: string) {
    this.emit('info', message);
  }
}

export const toast = new ToastCenter();