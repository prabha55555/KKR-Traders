import { Component } from 'react';
import { Button, ErrorState } from '@/ui';

/** Catches render errors so one broken page never blanks the whole app. */
export class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Page crashed:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto max-w-md p-6">
        <ErrorState message={this.state.error.message || 'This page hit an unexpected error.'} />
        <div className="flex justify-center gap-2">
          <Button variant="outline" onClick={() => this.setState({ error: null })}>
            Try again
          </Button>
          <Button onClick={() => window.location.assign('/')}>Go to dashboard</Button>
        </div>
      </div>
    );
  }
}
