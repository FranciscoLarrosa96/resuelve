/** Plantilla de presupuesto (GET /pro/quote-templates): privada del profesional. */
export interface QuoteTemplate {
  id: string;
  name: string;
  description: string;
  note: string | null;
  estimatedDuration: string | null;
  laborAmount: number;
  materialsAmount: number;
  createdAt: string;
}

export interface QuoteTemplateInput {
  name: string;
  description: string;
  note?: string;
  estimatedDuration?: string;
  laborAmount: number;
  materialsAmount: number;
}

export interface QuoteTemplateList {
  items: QuoteTemplate[];
  max: number;
}

/** Consulta antes de presupuestar y la respuesta del cliente. */
export interface RequestQuestion {
  id: string;
  question: string;
  answer: string | null;
  askedAt: string;
  answeredAt: string | null;
}

/** GET /pro/requests/:id/questions */
export interface ProQuestions {
  items: RequestQuestion[];
  canAsk: boolean;
  max: number;
}

/** GET /requests/:id/questions (cliente): agrupadas por profesional. */
export interface ClientQuestions {
  groups: { professional: { id: string; displayName: string }; items: RequestQuestion[] }[];
  canAnswer: boolean;
}

/** Límites que también valida el backend (`request-question-rules.ts`, `review-reply.ts`). */
export const QUESTION_MAX_LENGTH = 500;
export const REVIEW_REPLY_MAX_LENGTH = 500;
