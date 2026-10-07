import UploadView from "./components/UploadView";
import DashboardView from "./components/DashboardView";
import ErrorBoundary, { ErrorFallback } from "./components/ErrorBoundary";
import { useResumeAnalysis } from "./hooks/useResumeAnalysis.js";

function App() {
  const {
    view,
    loading,
    stage,
    hasReturnedFromReport,
    error,
    results,
    wasTextTruncated,
    reportId,
    jobDescription,
    processFile,
    resetToUpload,
    setJobDescription,
    clearJobDescription,
    preloadPdfReader,
  } = useResumeAnalysis();

  if (view === "dashboard" && results) {
    return (
      <ErrorBoundary
        key={reportId}
        name="dashboard"
        fallback={
          <ErrorFallback
            title="The report couldn't be displayed"
            message="The analysis finished, but its report failed to render. Upload a resume to try again."
            actionLabel="Analyze another resume"
            onAction={resetToUpload}
          />
        }
      >
        <DashboardView
          results={results}
          wasTextTruncated={wasTextTruncated}
          onBack={resetToUpload}
        />
      </ErrorBoundary>
    );
  }

  return (
    <UploadView
      loading={loading}
      stage={stage}
      focusFileInputOnMount={hasReturnedFromReport}
      error={error}
      onFileSelected={processFile}
      onUploadIntent={preloadPdfReader}
      jobDescription={jobDescription}
      onJobDescriptionChange={setJobDescription}
      onJobDescriptionClear={clearJobDescription}
    />
  );
}

export default App;
