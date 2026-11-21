export default function App() {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Saltar para o conteúdo
      </a>

      <header className="topbar">
        <a className="brand" href="/" aria-label="SpendWise, início">
          <span className="brand-mark" aria-hidden="true">
            S
          </span>
          <span>SpendWise</span>
        </a>
        <span className="environment-label">Ambiente local</span>
      </header>

      <main id="main-content" className="main-content">
        <section className="intro" aria-labelledby="page-title">
          <p className="eyebrow">Fundação do MVP</p>
          <h1 id="page-title">A base do SpendWise está pronta para crescer.</h1>
          <p className="intro-copy">
            Este scaffold confirma a estrutura técnica. Os fluxos de conta,
            poupanças, partilha e depósitos serão implementados depois de
            fecharmos as respetivas regras de produto.
          </p>
        </section>

        <section className="status-card" aria-labelledby="status-title">
          <div className="status-icon" aria-hidden="true">
            ✓
          </div>
          <div>
            <h2 id="status-title">Aplicação inicializada</h2>
            <p>
              React, TypeScript e Vite estão configurados. Não são carregados
              dados pessoais nem existe ligação a serviços externos.
            </p>
          </div>
        </section>
      </main>

      <footer className="footer">
        <span>SpendWise</span>
        <span>Desenvolvimento local · dados sintéticos</span>
      </footer>
    </div>
  );
}
