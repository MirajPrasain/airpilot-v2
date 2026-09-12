import { useState } from "react";
import type { AskResponse } from "../types";

const API_URL = "http://localhost:8000/ask";

function Tool() {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<AskResponse | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;

    setLoading(true);
    setResult(null);

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data: AskResponse = await response.json();
      setResult(data);
    } catch (err) {
      console.error("Request failed:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask a Part 91 question..."
        />
        <button type="submit" disabled={loading}>
          {loading ? "Thinking..." : "Ask"}
        </button>
      </form>

      {result && (
        <div>
          <div>
            <h3>AirPilot (grounded)</h3>
            <p>{result.airpilot.answer}</p>
            <p>Citations: {result.airpilot.citations.join(", ")}</p>
          </div>
          <div>
            <h3>Bare LLM (no retrieval)</h3>
            <p>{result.bare_llm.answer}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default Tool;