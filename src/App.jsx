import { useState } from "react";

import UploadView from "./components/UploadView";
import DashboardView from "./components/DashboardView";
import ErrorBoundary, { ErrorFallback } from "./components/ErrorBoundary";
import { useResumeAnalysis } from "./hooks/useResumeAnalysis.js";
import { getSampleReport } from "./lib/sampleReport.js";

// Reads the sample report while rendering, inside the sample's error
// boundary, so a failure building it shows the sample's fallback.
function SampleReport({ onBack, onStartOwn }) {
  return (
    <DashboardView
      results={getSampleReport()}
      wasTextTruncated={false}
      isSample
      onBack={onBack}
      onStartOwn={onStartOwn}
    />
  );
}

function App() {
  const {
    view,
    loading,
    stage,
    error,
    results,
    wasTextTruncated,
    reportId,
    jobDescription,
    processFile,
    resetToUpload,
    clearError,
    setJobDescription,
    clearJobDescription,
    preloadPdfReader,
  } = useResumeAnalysis();
  const [isSampleOpen, setIsSampleOpen] = useState(false);
  // Where focus goes when the upload screen next appears: "file-input" after
  // the user leaves a report or asks to analyze their own resume,
  // "sample-button" after they leave the sample, null on first load, so
  // opening the app never moves focus. It only changes while the upload
  // screen is not shown.
  const [uploadInitialFocus, setUploadInitialFocus] = useState(null);

  const leaveReport = () => {
    setUploadInitialFocus("file-input");
    resetToUpload();
  };

  const openSample = () => {
    if (loading) return;
    // An upload error would be out of date when the user comes back.
    clearError();
    setIsSampleOpen(true);
  };

  const closeSample = () => {
    setUploadInitialFocus("sample-button");
    setIsSampleOpen(false);
  };

  const startOwn = () => {
    // The button is at the end of the long sample report; the upload screen
    // should open at its top.
    window.scrollTo(0, 0);
    setUploadInitialFocus("file-input");
    setIsSampleOpen(false);
  };

  if (isSampleOpen) {
    return (
      <ErrorBoundary
        key="sample"
        name="sample"
        fallback={
          <ErrorFallback
            title="The sample report couldn't be displayed"
            message="The sample report failed to render. Go back to the home page to upload your own resume."
            actionLabel="Back to home"
            onAction={closeSample}
          />
        }
      >
        <SampleReport onBack={closeSample} onStartOwn={startOwn} />
      </ErrorBoundary>
    );
  }

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
            onAction={leaveReport}
          />
        }
      >
        <DashboardView
          results={results}
          wasTextTruncated={wasTextTruncated}
          onBack={leaveReport}
        />
      </ErrorBoundary>
    );
  }

  return (
    <UploadView
      loading={loading}
      stage={stage}
      initialFocus={uploadInitialFocus}
      error={error}
      onFileSelected={processFile}
      onUploadIntent={preloadPdfReader}
      onOpenSample={openSample}
      jobDescription={jobDescription}
      onJobDescriptionChange={setJobDescription}
      onJobDescriptionClear={clearJobDescription}
    />
  );
}

export default App;
