const SOURCE_CODE_URL = "https://github.com/Ra-jj/AI-Resume-Analyzer";

/** Home page footer: what the app is built with, and its source code. */
function SiteFooter() {
  return (
    <footer className="page-width site-footer">
      <div className="site-footer-inner">
        <p>AI Resume Analyzer. Built with React, pdf.js and Puter.js.</p>
        {/* A new tab, so a job description typed on this page isn't lost. */}
        <a
          className="site-footer-link"
          href={SOURCE_CODE_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          Source code
          <span className="visually-hidden"> (opens in a new tab)</span>
        </a>
      </div>
    </footer>
  );
}

export default SiteFooter;
