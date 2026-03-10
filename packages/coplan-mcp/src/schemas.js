import { z } from "zod";

export const planReviewInputSchema = z.object({
  plan: z.string().min(1, "plan is required"),
  rubric: z.string().optional()
});

export const planReviewOutputSchema = z.object({
  score: z.number().min(0).max(10),
  issues: z.array(z.string()),
  missing_steps: z.array(z.string()),
  improvements: z.array(z.string()),
  questions: z.array(z.string()),
  usage: z
    .object({
      input_tokens: z.number().int().nonnegative().optional(),
      output_tokens: z.number().int().nonnegative().optional(),
      total_tokens: z.number().int().nonnegative().optional()
    })
    .passthrough()
    .optional()
});

export function normalizeReview(review) {
  const parsed = planReviewOutputSchema.parse(review);
  return {
    score: parsed.score,
    issues: parsed.issues,
    missing_steps: parsed.missing_steps,
    improvements: parsed.improvements,
    questions: parsed.questions,
    ...(parsed.usage ? { usage: parsed.usage } : {})
  };
}
