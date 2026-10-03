import React from 'react';

export class CentralBotsBoundary extends React.Component<
  React.PropsWithChildren<{ onOpenCaptador: () => void }>,
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="p-6">
        <h2 className="font-bold">Central indisponível</h2>
        <p className="my-3 text-ink-secondary">
          O Captador operacional continua independente.
        </p>
        <button className="text-accent" onClick={this.props.onOpenCaptador}>
          Abrir Bot Captador
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
