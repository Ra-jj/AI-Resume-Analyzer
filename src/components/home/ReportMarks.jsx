/**
 * The "In your report" column of the upload sheet: what the report will
 * contain, led by an empty score box waiting for its mark. Shown beside the
 * dropzone and, unchanged, beside the progress steps, so the sheet keeps its
 * size when an analysis starts.
 */
function ReportMarks() {
  return (
    <div className="report-marks">
      <p className="report-marks-title">In your report</p>
      <ul className="report-marks-list">
        <li className="report-marks-score">
          <span className="visually-hidden">A score out of 100</span>
          <span className="report-marks-score-box" aria-hidden="true">
            /100
          </span>
        </li>
        <li>Fix first</li>
        <li>Writing quality</li>
        <li>Resume and ATS checks</li>
        <li>Job match, with a job description</li>
      </ul>
    </div>
  );
}

export default ReportMarks;
