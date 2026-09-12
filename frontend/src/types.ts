export interface GroundedAnswer {
  answer: string;
  is_answerable: boolean;
  citations: string[];
}

export interface BareAnswer {
  answer: string;
}

export interface AskResponse {
  question: string;
  airpilot: GroundedAnswer;
  bare_llm: BareAnswer;
}