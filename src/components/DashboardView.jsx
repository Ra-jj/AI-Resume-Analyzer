import {
  CheckCircle,
  AlertTriangle,
  Lightbulb,
  Target,
  BarChart2,
  ShieldCheck,
  ArrowLeft,
  ClipboardList,
  Briefcase,
  Star,
} from "lucide-react";

function DashboardView({ results, setView }) {
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
            {results.performanceMetrics?.map((metric, idx) => (
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
          {results.topStrengths?.map((str, idx) => (
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
          {results.mainImprovements?.map((imp, idx) => (
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

          {results.atsCompatibilityChecklist?.map((check, idx) => (
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
          {results.resumeInsights?.map((insight, idx) => (
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
            {results.recommendedKeywords?.map((kw, idx) => (
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

export default DashboardView;
