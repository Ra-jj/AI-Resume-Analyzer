import { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";

import { isFileDrag } from "../lib/files.js";
import { MAX_FILE_SIZE_MB, MAX_PAGES } from "../lib/limits.js";
import JobDescriptionInput from "./JobDescriptionInput.jsx";

// onUploadIntent runs when the user looks about to choose a file (a file is
// dragged in, or the pointer or keyboard focus reaches the button), so the
// PDF reader can start loading early. It must be safe to call repeatedly.
function UploadView({
  loading,
  error,
  onFileSelected,
  onUploadIntent,
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
  // A too-short job description is shown on the field itself; every other
  // error goes in the card under the dropzone.
  const jobDescriptionError = error?.code === "JD_TOO_SHORT" ? error : null;
  const generalError = jobDescriptionError ? null : error;

  useEffect(() => {
    // On phones the error card renders below the fold, under the dropzone.
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
    <div className="upload-container">
      <h1 className="glow-title">AI Resume Analyzer</h1>
      <p className="upload-subtitle">
        Upload your PDF resume and get instant AI feedback
      </p>

      {/* Hidden while analyzing: an edit then wouldn't reach the request
          that is already running. */}
      {!loading && (
        <JobDescriptionInput
          value={jobDescription}
          error={jobDescriptionError}
          onChange={onJobDescriptionChange}
          onClear={onJobDescriptionClear}
        />
      )}

      {/* Distinct keys stop React from reusing the spinner's nodes as the
          dropzone, which would animate the spinner's cyan border into it. */}
      {loading ? (
        <div
          key="loading"
          className="loading-container animate-slide-up"
          role="status"
        >
          <div className="spinner-ring"></div>
          <h2 className="loading-title">Analyzing Your Resume</h2>
          <p className="loading-message">
            Please wait while AI reviews your resume...
          </p>
        </div>
      ) : (
        <div
          key="dropzone"
          className={`dropzone-wrapper${isDragActive ? " is-drag-active" : ""}`}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="dropzone-inner">
            <svg
              className="doc-icon"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
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
            <p>
              Drag a PDF here or choose a file. Up to {MAX_FILE_SIZE_MB}&nbsp;MB
              and {MAX_PAGES}&nbsp;pages.
            </p>

            <label
              className="gradient-btn"
              onPointerEnter={onUploadIntent}
              onFocus={onUploadIntent}
            >
              Choose PDF File
              <input
                type="file"
                className="visually-hidden"
                accept="application/pdf,.pdf"
                onChange={handleInputChange}
                disabled={loading}
              />
            </label>
          </div>
        </div>
      )}

      {generalError && (
        <div ref={errorRef} className="card mt-8 upload-error" role="alert">
          <AlertTriangle
            size={18}
            className="upload-error-icon"
            aria-hidden="true"
          />
          <p>{generalError.message}</p>
        </div>
      )}
    </div>
  );
}

export default UploadView;
