import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

class WorkbenchBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) return <div className="editor-unavailable" style={{ height: '100%' }} role="alert"><h2>The workbench could not render</h2><p>{this.state.error.message || 'An unexpected interface error occurred.'}</p><p>Your files and task history remain on the local server.</p><button type="button" className="secondary-button" onClick={() => window.location.reload()}>Reload workbench</button></div>;
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(<StrictMode><WorkbenchBoundary><App /></WorkbenchBoundary></StrictMode>);
