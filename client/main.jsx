import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { I18nProvider, useT } from './i18n.jsx';
import './styles.css';

function WorkbenchFallback() {
  const t = useT();
  return <div className="editor-unavailable" style={{ height: '100%' }} role="alert">
    <h2>{t('errors.boundary')}</h2>
    <p>{t('errors.boundaryHint')}</p>
    <p>{t('errors.boundarySafe')}</p>
    <button type="button" className="secondary-button" onClick={() => window.location.reload()}>{t('errors.reload')}</button>
  </div>;
}

class WorkbenchBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) return <WorkbenchFallback message={this.state.error.message} />;
    return this.props.children;
  }
}

function FallbackWithMessage({ message }) {
  const t = useT();
  return <div className="editor-unavailable" style={{ height: '100%' }} role="alert">
    <h2>{t('errors.boundary')}</h2>
    <p>{message || t('errors.boundaryHint')}</p>
    <p>{t('errors.boundarySafe')}</p>
    <button type="button" className="secondary-button" onClick={() => window.location.reload()}>{t('errors.reload')}</button>
  </div>;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <I18nProvider>
      <WorkbenchBoundary><App /></WorkbenchBoundary>
    </I18nProvider>
  </StrictMode>,
);
