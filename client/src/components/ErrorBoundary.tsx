import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { reportError } from '../lib/telemetry';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError('react-error-boundary', error, { componentStack: info.componentStack });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
          <p className="text-5xl font-bold text-gradient">Oops</p>
          <h1 className="mt-3 text-xl font-semibold">เกิดข้อผิดพลาดในหน้านี้</h1>
          <p className="mt-2 max-w-md text-sm text-ink-500">{this.state.error.message}</p>
          <div className="mt-6 flex gap-3">
            <button type="button" onClick={() => window.location.reload()} className="btn-primary">
              โหลดหน้าใหม่
            </button>
            <button type="button" onClick={() => this.setState({ error: null })} className="btn-secondary">
              ลองอีกครั้ง
            </button>
          </div>
          <p className="mt-8 max-w-md text-xs text-ink-400">
            ข้อผิดพลาดถูกรายงานให้เราทราบแล้ว หากยังพบปัญหา กรุณาแจ้งพร้อมรหัสที่แสดงใน console
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}