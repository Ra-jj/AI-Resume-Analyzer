import { MAX_FILE_SIZE_MB, MAX_PAGES } from "../../lib/limits.js";

// Step 2 says "Add your resume as a PDF", not "Upload your resume": the e2e
// tests find the upload sheet by a heading containing "upload your resume".
const STEPS = [
  {
    title: "Add a job description (optional)",
    text: (
      <>
        Paste the job posting to also get a match score and the keywords your
        resume is missing.
      </>
    ),
  },
  {
    title: "Add your resume as a PDF",
    text: (
      <>
        Drag it onto the sheet above or choose a file. It needs selectable text
        (a scanned image won&apos;t work), up to {MAX_FILE_SIZE_MB}&nbsp;MB and{" "}
        {MAX_PAGES}&nbsp;pages.
      </>
    ),
  },
  {
    title: "Read your report",
    text: (
      <>
        A score out of 100, what to fix first, writing scores, resume and ATS
        checks. Copy a summary or save it as a PDF.
      </>
    ),
  },
];

/** The ink band on the home page: the three steps of an analysis. */
function HowItWorks() {
  return (
    <section className="how-it-works" aria-labelledby="how-it-works-title">
      <div className="page-width how-it-works-inner">
        <h2 id="how-it-works-title" className="section-title">
          How it works
        </h2>
        <ol className="how-steps">
          {STEPS.map((step, index) => (
            <li className="how-step" key={step.title}>
              {/* The list already numbers the steps for screen readers. */}
              <span className="how-step-number" aria-hidden="true">
                {index + 1}
              </span>
              <div className="how-step-text">
                <h3 className="how-step-title">{step.title}</h3>
                <p>{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export default HowItWorks;
