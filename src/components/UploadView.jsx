function UploadView({ loading, error, handleFileUpload }) {
  return (
    <div className="upload-container">
      <h1 className="glow-title">AI Resume Analyzer</h1>
      <p className="upload-subtitle">
        Upload your PDF resume and get instant AI feedback
      </p>

      {loading ? (
        <div className="loading-container animate-slide-up">
          <div className="spinner-ring"></div>
          <h2
            style={{
              fontSize: "1.5rem",
              fontWeight: 600,
              marginBottom: "0.5rem",
            }}
          >
            Analyzing Your Resume
          </h2>
          <p style={{ color: "var(--text-muted)" }}>
            Please wait while AI reviews your resume...
          </p>
        </div>
      ) : (
        <div className="dropzone-wrapper">
          <div className="dropzone-inner">
            <svg
              className="doc-icon"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M14 2H6C4.89543 2 4 2.89543 4 4V20C4 21.1046 4.89543 22 6 22H18C19.1046 22 20 21.1046 20 20V8L14 2Z"
                fill="#E2E8F0"
              />
              <path d="M14 2V8H20" fill="#CBD5E1" />
              <path
                d="M8 13H16M8 17H16M8 9H10"
                stroke="#94A3B8"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <h2>Upload Your Resume</h2>
            <p>PDF files only • Get instant analysis</p>

            <label className="gradient-btn">
              Choose PDF File
              <input
                type="file"
                accept=".pdf"
                onChange={handleFileUpload}
                style={{ display: "none" }}
                disabled={loading}
              />
            </label>
          </div>
        </div>
      )}

      {error && (
        <div className="card mt-8" style={{ borderColor: "var(--danger)" }}>
          <p style={{ color: "var(--danger)" }}>{error}</p>
        </div>
      )}
    </div>
  );
}

export default UploadView;
