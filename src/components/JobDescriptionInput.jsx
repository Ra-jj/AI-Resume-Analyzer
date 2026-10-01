import { useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, Plus } from "lucide-react";

import { MAX_JOB_DESCRIPTION_CHARACTERS } from "../lib/limits.js";

const formatCount = (count) => count.toLocaleString("en-US");

/**
 * Optional job description. Collapsed to one button until the user asks for
 * it; opens on its own when a description is already set (for example after
 * "Analyze another resume"). Clear empties it and collapses it again.
 * `error` is the `{ code, message }` object for a problem with the text itself
 * (it is too short), shown under the field, or null. A new object arrives on
 * every rejection, so a repeated rejection scrolls and focuses again.
 */
function JobDescriptionInput({ value, error, onChange, onClear }) {
  const [isOpen, setIsOpen] = useState(value.length > 0);
  const textareaRef = useRef(null);
  const addButtonRef = useRef(null);
  const errorRef = useRef(null);
  // Which element to focus after the user opens or clears the field. Never
  // set on first render, so returning to this screen doesn't steal focus.
  const pendingFocusRef = useRef(null);
  const fieldId = useId();
  const textareaId = `${fieldId}-input`;
  const errorId = `${fieldId}-error`;
  const helpId = `${fieldId}-help`;
  const countId = `${fieldId}-count`;

  useEffect(() => {
    if (pendingFocusRef.current === "textarea") textareaRef.current?.focus();
    if (pendingFocusRef.current === "add-button") addButtonRef.current?.focus();
    pendingFocusRef.current = null;
  }, [isOpen]);

  useEffect(() => {
    if (!error) return;
    // Focus the field so screen readers announce the message (it is part of
    // the field's description). focus() alone only scrolls the caret into
    // view, so scroll the whole field, then its message, into view: together
    // they are short enough to fit on any phone screen.
    textareaRef.current?.focus({ preventScroll: true });
    textareaRef.current?.scrollIntoView({ block: "nearest" });
    errorRef.current?.scrollIntoView({ block: "nearest" });
  }, [error]);

  const handleOpen = () => {
    pendingFocusRef.current = "textarea";
    setIsOpen(true);
  };

  const handleClear = () => {
    onClear();
    pendingFocusRef.current = "add-button";
    setIsOpen(false);
  };

  if (!isOpen) {
    return (
      <div className="jd-section">
        <button
          ref={addButtonRef}
          type="button"
          className="jd-add-btn"
          onClick={handleOpen}
        >
          <Plus size={16} aria-hidden="true" />
          Add a job description (optional)
        </button>
      </div>
    );
  }

  const isAtLimit = value.length >= MAX_JOB_DESCRIPTION_CHARACTERS;
  const describedBy = error
    ? `${errorId} ${helpId} ${countId}`
    : `${helpId} ${countId}`;

  return (
    <div className="jd-section jd-panel">
      <div className="jd-header">
        <label htmlFor={textareaId} className="jd-label">
          Job description (optional)
        </label>
        <button
          type="button"
          className="jd-clear-btn"
          onClick={handleClear}
          aria-label="Clear job description"
        >
          Clear
        </button>
      </div>
      <textarea
        ref={textareaRef}
        id={textareaId}
        className="jd-textarea"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={MAX_JOB_DESCRIPTION_CHARACTERS}
        rows={6}
        placeholder="Paste the job posting here"
        aria-invalid={error ? "true" : undefined}
        aria-describedby={describedBy}
      />
      {error && (
        <p ref={errorRef} id={errorId} className="jd-error">
          <AlertTriangle size={16} className="jd-error-icon" aria-hidden="true" />
          <span>{error.message}</span>
        </p>
      )}
      <div className="jd-footer">
        <p id={helpId}>Get a match score and missing keywords for this role.</p>
        <p
          id={countId}
          className={`jd-count${isAtLimit ? " jd-count--full" : ""}`}
        >
          {formatCount(value.length)} / {formatCount(MAX_JOB_DESCRIPTION_CHARACTERS)}
        </p>
      </div>
    </div>
  );
}

export default JobDescriptionInput;
