import { Link } from "react-router-dom";

function Home() {
  return (
    <div>
      <header>
        <h1>AirPilot</h1>
        <p>
          Bare LLMs will confidently hallucinate a regulation citation.
          AirPilot won't — because it only answers from real, retrievable
          FAA text.
        </p>
        <Link to="/try">
          <button>Try it</button>
        </Link>
      </header>

      <section>
        <h2>How it works</h2>
        <ul>
          <li>
            Built on the real, complete text of 14 CFR Part 91 (General
            Operating and Flight Rules) — 261 regulation sections, pulled
            directly from the FAA's eCFR API.
          </li>
          <li>
            Regulation text is chunked along its own legal structure and
            embedded into a MongoDB Atlas vector index for semantic search.
          </li>
          <li>
            Every question is answered two ways side by side: a bare LLM
            with no grounding, and AirPilot's retrieval-grounded answer with
            real, verifiable citations.
          </li>
          <li>
            Validated against an 18-question hand-verified eval set covering
            numeric precision, nested regulation structure, cross-section
            reasoning, and out-of-scope rejection — scoring 17/18, with the
            one miss documented and understood.
          </li>
        </ul>
      </section>

      <section>
        <h2>Learn more</h2>
        <ul>
          <li>
            <a href="https://github.com/YOUR_USERNAME/airpilot-v2" target="_blank" rel="noopener noreferrer">
              View source on GitHub
            </a>
          </li>
        </ul>
      </section>
    </div>
  );
}

export default Home;