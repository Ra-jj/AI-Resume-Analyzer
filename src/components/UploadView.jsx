import { useEffect, useRef, useState } from "react";
import { AlertTriangle, FileUp } from "lucide-react";

import { isFileDrag } from "../lib/files.js";
import { MAX_FILE_SIZE_MB, MAX_PAGES } from "../lib/limits.js";
import AnalysisProgress, { AnalysisStatus } from "./AnalysisProgress.jsx";
import JobDescriptionInput from "./JobDescriptionInput.jsx";
import HowItWorks from "./home/HowItWorks.jsx";
import PrivacySection from "./home/PrivacySection.jsx";
import ReportMarks from "./home/ReportMarks.jsx";
import SiteFooter from "./home/SiteFooter.jsx";

// onUploadIntent runs when the user looks about to choose a file (a file is
// dragged in, or the pointer or keyboard focus reaches the button), so the
// PDF reader can start loading early. It must be safe to call repeatedly.
// initialFocus is where focus goes when this screen appears: "file-input"
// when the user has come back from a report or asked to analyze their own
// resume (choosing a file is what they asked to do), "sample-button" when
// they have left the sample report, and null on first load, when nothing
// takes focus.
function UploadView({
  loading,
  stage,
  initialFocus,
  error,
  onFileSelected,
  onUploadIntent,
  onOpenSample,
  jobDescription,
  onJobDescriptionChange,
  onJobDescriptionClear,
}) {
  const [isDragActive, setIsDragActive] = useState(false);
  // dragenter/dragleave also fire when the pointer crosses the dropzone's own
  // children. Counting enters minus leaves keeps the highlight from
  // flickering off while a file is dragged over the icon or text.
  const dragDepthRef = useRef(0);
  const errorRef = useRef(null);
  const fileInputRef = useRef(null);
  const sampleButtonRef = useRef(null);
  // A too-short job description is shown on the field itself; every other
  // error goes in the slip under the upload sheet.
  const jobDescriptionError = error?.code === "JD_TOO_SHORT" ? error : null;
  const generalError = jobDescriptionError ? null : error;

  useEffect(() => {
    // In effect this runs once, on mount: App only changes initialFocus
    // while another screen is showing.
    if (initialFocus === "file-input") fileInputRef.current?.focus();
    if (initialFocus === "sample-button") sampleButtonRef.current?.focus();
  }, [initialFocus]);

  useEffect(() => {
    // On phones the error slip renders below the fold, under the sheet.
    // Scroll just far enough to show it so a rejected file isn't silent.
    if (generalError) errorRef.current?.scrollIntoView({ block: "nearest" });
  }, [generalError]);

  const handleDragEnter = (event) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    onUploadIntent();
    dragDepthRef.current += 1;
    setIsDragActive(true);
  };

  const handleDragOver = (event) => {
    if (!isFileDrag(event)) return;
    // Cancelling dragover is what allows the drop to happen here.
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  const handleDragLeave = (event) => {
    if (!isFileDrag(event)) return;
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragActive(false);
  };

  const handleDrop = (event) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    dragDepthRef.current = 0;
    setIsDragActive(false);
    if (loading) return;
    // Only one resume is analyzed at a time; extra dropped files are ignored.
    const file = event.dataTransfer.files?.[0];
    if (file) onFileSelected(file);
  };

  const handleInputChange = (event) => {
    const file = event.target.files?.[0];
    // Clearing the value lets the same file be chosen again (e.g. after an
    // error) — otherwise the browser sees no change and fires no event.
    event.target.value = "";
    if (loading || !file) return;
    onFileSelected(file);
  };

  return (
    <>
      <header className="page-width site-header">
        <p className="wordmark">AI Resume Analyzer</p>
      </header>

      <main className="upload-container">
        <div className="page-width home-hero">
          <div className="home-intro">
            {/* Two spans with a space between: the lines break where
                written, and the heading's name still reads as one phrase. */}
            <h1 className="home-title">
              <span className="home-title-line">Your resume,</span>{" "}
              <span className="home-title-line">reviewed.</span>
            </h1>
            <p className="upload-subtitle">
              Upload a PDF of your resume and get a score out of 100 and a list
              of what to fix first.
            </p>

            {/* Hidden while analyzing: an edit then wouldn't reach the
                request that is already running. */}
            {!loading && (
              <JobDescriptionInput
                value={jobDescription}
                error={jobDescriptionError}
                onChange={onJobDescriptionChange}
                onClear={onJobDescriptionClear}
              />
            )}
          </div>

          <div className="home-upload">
            {/* Distinct keys stop React from reusing the dropzone's nodes for
                the loading sheet that replaces it. */}
            {loading ? (
              <AnalysisProgress key="loading" stage={stage} />
            ) : (
              <div
                key="dropzone"
                className={`upload-sheet dropzone-wrapper${isDragActive ? " is-drag-active" : ""}`}
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <div className="dropzone-inner">
                  <FileUp
                    size={40}
                    strokeWidth={2.5}
                    className="dropzone-icon"
                    aria-hidden="true"
                  />
                  <h2>Upload your resume</h2>
                  <p>
                    Drag a PDF here or choose a file.{" "}
                    <span className="dropzone-limits">
                      Up to {MAX_FILE_SIZE_MB}&nbsp;MB and {MAX_PAGES}&nbsp;pages.
                    </span>
                  </p>

                  <label
                    className="primary-btn choose-file-btn"
                    onPointerEnter={onUploadIntent}
                    onFocus={onUploadIntent}
                  >
                    Choose PDF File
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="visually-hidden"
                      accept="application/pdf,.pdf"
                      onChange={handleInputChange}
                      disabled={loading}
                    />
                  </label>
                </div>
                <ReportMarks />
              </div>
            )}

            {/* Outside the condition above: the region stays in the page,
                empty at rest, so the first step is announced too. */}
            <AnalysisStatus stage={stage} />

            {generalError && (
              <div ref={errorRef} className="upload-error" role="alert">
                <AlertTriangle
                  size={20}
                  strokeWidth={2.5}
                  className="upload-error-icon"
                  aria-hidden="true"
                />
                <p>{generalError.message}</p>
              </div>
            )}

            {!loading && (
              <p className="privacy-note">
                Your resume&apos;s text (and the job description, if you add
                one) is sent to an AI model through Puter.js to create your
                report. This app doesn&apos;t store it.
              </p>
            )}
          </div>
        </div>

        <HowItWorks />

        {/* After the upload controls, so Tab reaches the job description
            and the file input first. Hidden while analyzing, like the
            controls. It is not an upload intent: opening the sample never
            loads pdf.js. */}
        {!loading && (
          <div className="page-width sample-section">
            <button
              ref={sampleButtonRef}
              type="button"
              className="report-action-btn sample-open-btn"
              onClick={onOpenSample}
            >
              See a full sample report
            </button>
          </div>
        )}

        <PrivacySection />
      </main>

      <SiteFooter />
    </>
  );
}

export default UploadView;
