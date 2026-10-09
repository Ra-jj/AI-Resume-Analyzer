const POINTS = [
  {
    lead: "Read on this page.",
    text: "Your PDF is opened in your browser to pull out its text. The file itself isn't uploaded.",
  },
  {
    lead: "Sent to an AI model.",
    text: "The text, and the job description if you add one, goes to an AI model through Puter.js to write the report. Puter may ask you to sign in.",
  },
  {
    lead: "Not kept by this app.",
    text: "There's no database, no analytics and no saved reports here.",
  },
];

/** "What happens to your resume": where the file and its text go. */
function PrivacySection() {
  return (
    <section
      className="page-width privacy-section"
      aria-labelledby="privacy-section-title"
    >
      <h2 id="privacy-section-title" className="section-title">
        What happens to your resume
      </h2>
      <dl className="privacy-points">
        {POINTS.map((point) => (
          <div className="privacy-point" key={point.lead}>
            <dt>{point.lead}</dt>
            <dd>{point.text}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export default PrivacySection;
