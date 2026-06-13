import { useState } from "react";
import {
  FileText,
  Sparkles,
  CheckCircle,
  AlertTriangle,
  Lightbulb,
  Target,
  BarChart2,
  ShieldCheck,
  ArrowLeft,
  Loader2,
  ClipboardList,
  Briefcase,
  Star,
} from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
import "./App.css";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

function App() {
  const [view, setView] = useState("upload"); // 'upload' or 'dashboard'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState(null);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      setError("Please upload a valid PDF file.");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = "";

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ");
        fullText += pageText + "\n\n";
      }

      await performAnalysis(fullText.trim());
    } catch (err) {
      console.error(err);
      setError(
        "Failed to extract text from the PDF. The file might be corrupted or protected.",
      );
      setLoading(false);
    }
  };

  const performAnalysis = async (resumeText) => {
    if (!resumeText) {
      setError("No text found in PDF.");
      setLoading(false);
      return;
    }

    try {
      const prompt = `
        You are a world-class Executive Resume Writer and ATS Expert.
        I will provide a RESUME. You must analyze this resume comprehensively.
        Do not compare it to a job description. Analyze its absolute quality, impact, and ATS readability.
        
        You must return the result STRICTLY as a valid JSON object. Do not include any markdown formatting like code blocks. Just return the raw JSON object.
        
        The JSON object must have this EXACT structure:
        {
          "overallScore": <number between 0 and 100>,
          "executiveSummary": "<A brief 2-3 sentence summary of the resume's overall impact>",
          "topStrengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
          "mainImprovements": ["<improvement 1>", "<improvement 2>", "<improvement 3>"],
          "performanceMetrics": [
            { "name": "Impact & Quantifiable Results", "score": <number 0-100> },
            { "name": "Brevity & Formatting", "score": <number 0-100> },
            { "name": "Action Verbs Usage", "score": <number 0-100> },
            { "name": "Grammar & Spelling", "score": <number 0-100> }
          ],
          "resumeInsights": ["<insight 1>", "<insight 2>", "<insight 3>"],
          "atsOptimization": "<A short paragraph summarizing how well this parses in an ATS>",
          "atsCompatibilityChecklist": [
            { "item": "Standard Section Headers", "passed": <boolean> },
            { "item": "No Complex Tables/Graphics", "passed": <boolean> },
            { "item": "Standard Font Usage", "passed": <boolean> },
            { "item": "Clear Contact Info", "passed": <boolean> }
          ],
          "recommendedKeywords": ["<kw1>", "<kw2>", "<kw3>", "<kw4>", "<kw5>"],
          "recommendedRoles": ["<role 1>", "<role 2>", "<role 3>"]
        }

        RESUME:
        ${resumeText}
      `;

      // @ts-ignore
      const response = await puter.ai.chat(prompt);

      let jsonStr =
        typeof response === "string"
          ? response
          : response?.message?.content ||
            response?.text ||
            JSON.stringify(response);

      jsonStr = jsonStr.trim();
      if (jsonStr.startsWith("\`\`\`json")) {
        jsonStr = jsonStr
          .replace(/\`\`\`json/g, "")
          .replace(/\`\`\`/g, "")
          .trim();
      } else if (jsonStr.startsWith("\`\`\`")) {
        jsonStr = jsonStr.replace(/\`\`\`/g, "").trim();
      }

      const parsedData = JSON.parse(jsonStr);
      setResults(parsedData);
      setView("dashboard");
    } catch (err) {
      console.error(err);
      setError("Analysis failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (view === "upload") {
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

  if (!results) return null;

  const scoreBadge =
    results.overallScore >= 80
      ? { text: "Excellent", color: "#10b981", bg: "rgba(16, 185, 129, 0.1)" }
      : results.overallScore >= 60
        ? { text: "Good", color: "#f59e0b", bg: "rgba(245, 158, 11, 0.1)" }
        : {
            text: "Needs Improvement",
            color: "#ef4444",
            bg: "rgba(239, 68, 68, 0.1)",
          };

  return (
    <div className="dashboard-container animate-slide-up">
      <div className="dashboard-header">
        <button className="back-btn" onClick={() => setView("upload")}>
          <ArrowLeft size={18} /> Analyze Another Resume
        </button>
        <h2 style={{ fontSize: "1.2rem", fontWeight: 600 }}>Analysis Report</h2>
      </div>

      <div className="grid grid-cols-12">
        {/* Overall Score */}
        <div className="col-span-12 card flex justify-center items-center py-8">
          <div className="flex flex-col items-center" style={{ width: "100%" }}>
            <div
              className="score-circle"
              style={{ "--score": `${results.overallScore}%` }}
            >
              <span className="score-value">{results.overallScore}</span>
            </div>
            <h3
              className="mt-4"
              style={{ fontSize: "1.25rem", color: "var(--text-muted)" }}
            >
              Overall Resume Score
            </h3>

            <div
              className="flex items-center gap-2 mt-8"
              style={{
                background: scoreBadge.bg,
                color: scoreBadge.color,
                padding: "6px 16px",
                borderRadius: "9999px",
                fontWeight: 600,
                fontSize: "0.95rem",
                border: `1px solid ${scoreBadge.color}40`,
              }}
            >
              <Star
                fill={scoreBadge.color}
                color={scoreBadge.color}
                size={16}
              />{" "}
              {scoreBadge.text}
            </div>

            <div
              style={{
                width: "100%",
                maxWidth: "800px",
                height: "14px",
                background: "rgba(255,255,255,0.05)",
                borderRadius: "9999px",
                marginTop: "16px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${results.overallScore}%`,
                  height: "100%",
                  background: scoreBadge.color,
                  borderRadius: "9999px",
                  transition: "width 1s ease-out",
                }}
              ></div>
            </div>

            <p
              style={{
                marginTop: "12px",
                fontSize: "0.85rem",
                color: "var(--text-muted)",
              }}
            >
              Score based on content quality, formatting, and keyword usage
            </p>
          </div>
        </div>

        {/* Executive Summary */}
        <div className="col-span-12 card">
          <h3 className="card-title">
            <ClipboardList size={20} /> Executive Summary
          </h3>
          <p
            style={{
              color: "var(--text-muted)",
              fontSize: "1.05rem",
              lineHeight: 1.7,
            }}
          >
            {results.executiveSummary}
          </p>
        </div>

        {/* Recommended Roles */}
        <div className="col-span-12 card">
          <h3 className="card-title">
            <Briefcase size={20} /> Recommended Roles to Apply For
          </h3>
          <div
            className="flex"
            style={{ gap: "20px", flexWrap: "wrap", marginTop: "12px" }}
          >
            {results.recommendedRoles?.map((role, idx) => (
              <span
                key={idx}
                style={{
                  background: "var(--border-glow)",
                  color: "var(--primary-light)",
                  border: "1px solid var(--border-color)",
                  padding: "8px 16px",
                  borderRadius: "9999px",
                  fontSize: "0.95rem",
                  fontWeight: 500,
                }}
              >
                {role}
              </span>
            ))}
          </div>
        </div>

        {/* Performance Metrics */}
        <div className="col-span-12 card">
          <h3 className="card-title">
            <BarChart2 size={20} /> Performance Metrics
          </h3>
          <div className="grid grid-cols-2" style={{ gap: "2rem" }}>
            {results.performanceMetrics.map((metric, idx) => (
              <div key={idx}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "4px",
                  }}
                >
                  <span>{metric.name}</span>
                  <span
                    style={{ color: "var(--primary-light)", fontWeight: 600 }}
                  >
                    {metric.score}/100
                  </span>
                </div>
                <div className="metric-bar-bg">
                  <div
                    className="metric-bar-fill"
                    style={{ width: `${metric.score}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Strengths & Improvements */}
        <div className="col-span-6 card">
          <h3 className="card-title" style={{ color: "var(--success)" }}>
            <CheckCircle size={20} /> Top Strengths
          </h3>
          {results.topStrengths.map((str, idx) => (
            <div className="list-item" key={idx}>
              <CheckCircle
                size={18}
                color="var(--success)"
                style={{ flexShrink: 0, marginTop: "2px" }}
              />
              <span>{str}</span>
            </div>
          ))}
        </div>

        <div className="col-span-6 card">
          <h3 className="card-title" style={{ color: "var(--warning)" }}>
            <AlertTriangle size={20} /> Main Improvements
          </h3>
          {results.mainImprovements.map((imp, idx) => (
            <div className="list-item" key={idx}>
              <AlertTriangle
                size={18}
                color="var(--warning)"
                style={{ flexShrink: 0, marginTop: "2px" }}
              />
              <span>{imp}</span>
            </div>
          ))}
        </div>

        {/* ATS Checklist & Insights */}
        <div className="col-span-6 card">
          <h3 className="card-title" style={{ color: "var(--primary-light)" }}>
            <ShieldCheck size={20} /> ATS Compatibility
          </h3>
          <p style={{ color: "var(--text-muted)", marginBottom: "1.5rem" }}>
            {results.atsOptimization}
          </p>

          {results.atsCompatibilityChecklist.map((check, idx) => (
            <div
              className="list-item"
              key={idx}
              style={{ alignItems: "center" }}
            >
              {check.passed ? (
                <CheckCircle size={18} color="var(--success)" />
              ) : (
                <AlertTriangle size={18} color="var(--danger)" />
              )}
              <span
                style={{
                  color: check.passed ? "var(--text-main)" : "var(--danger)",
                }}
              >
                {check.item}
              </span>
            </div>
          ))}
        </div>

        <div className="col-span-6 card">
          <h3 className="card-title" style={{ color: "var(--secondary)" }}>
            <Lightbulb size={20} /> Deep Insights
          </h3>
          {results.resumeInsights.map((insight, idx) => (
            <div className="list-item" key={idx}>
              <div
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  background: "var(--secondary)",
                  margin: "8px",
                  flexShrink: 0,
                }}
              ></div>
              <span>{insight}</span>
            </div>
          ))}

          <h3 className="card-title mt-8" style={{ color: "var(--secondary)" }}>
            <Target size={20} /> Recommended Keywords
          </h3>
          <div>
            {results.recommendedKeywords.map((kw, idx) => (
              <span className="badge" key={idx}>
                {kw}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
