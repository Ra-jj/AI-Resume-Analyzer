# AI Resume Analyzer

🔗 [Live Demo](https://ai-resume-analyzer-rajcodes.vercel.app/)

A modern, client-side React application that allows users to upload their PDF resumes for instant, AI-powered feedback. It evaluates the resume based on content quality, formatting, and ATS compatibility without relying on a traditional backend server.

## ✨ Key Features

- **Instant AI Feedback**: Leverages advanced AI to provide an executive-level summary and detailed analysis of resume quality and impact.
- **Comprehensive Analytics Dashboard**: Displays an overall score, ATS compatibility checklist, performance metrics, and targeted keyword recommendations.
- **100% Client-Side Parsing**: Parses PDF resumes directly in the browser using `pdfjs-dist` within a Web Worker, ensuring data privacy and maintaining a responsive UI.
- **Robust AI Integration**: Utilizes strict JSON-based AI prompting to ensure structured and reliable data extraction for the frontend dashboard.
- **Premium UI/UX**: Designed a highly responsive, animated user interface utilizing modern CSS techniques and `lucide-react` for an intuitive user experience.

## 🛠 Tech Stack

- **Frontend Framework**: React 19 + Vite
- **Styling**: Vanilla CSS with custom properties, flexbox/grid layouts, and animations
- **PDF Parsing**: `pdfjs-dist` (Mozilla's PDF library)
- **Icons**: `lucide-react`
- **AI Integration**: Puter.js

## 🚀 Getting Started

Follow these steps to run the project locally.

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/ai-resume-analyzer.git
   cd ai-resume-analyzer
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```

4. **Open your browser:**
   Navigate to `http://localhost:5173` to see the application in action.

## 💡 How it Works

1. **Upload**: Users upload their PDF resume.
2. **Parsing**: The app parses the PDF using a Web Worker to extract the text content without freezing the UI.
3. **Analysis**: The extracted text is securely analyzed via an AI prompt structured to return specific insights (score, strengths, ATS compatibility, etc.).
4. **Results**: The parsed JSON data is dynamically rendered on a comprehensive analytics dashboard.

---
*Built with ❤️ for better career opportunities.*
