/* global puter */
import { useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.mjs?url";

import UploadView from "./components/UploadView";
import DashboardView from "./components/DashboardView";

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
      
      // Robust JSON extraction regex
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch && jsonMatch[1]) {
        jsonStr = jsonMatch[1].trim();
      } else {
        // Fallback: try to find the first '{' and last '}' if not in a code block
        const firstBrace = jsonStr.indexOf('{');
        const lastBrace = jsonStr.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) {
            jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
        }
      }

      let parsedData;
      try {
        parsedData = JSON.parse(jsonStr);
      } catch (parseError) {
        console.error("Failed to parse JSON. Raw AI Response:", jsonStr);
        throw parseError;
      }

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
      <UploadView
        loading={loading}
        error={error}
        handleFileUpload={handleFileUpload}
      />
    );
  }

  return <DashboardView results={results} setView={setView} />;
}

export default App;
