import { z } from 'zod';

export const foundationFeedbackSchema = z.object({
  name: z.string().trim().min(2, 'Enter at least 2 characters.'),
  goal: z.string().trim().min(8, 'Describe the goal in at least 8 characters.'),
});

export type FoundationFeedbackValues = z.infer<
  typeof foundationFeedbackSchema
>;

export const foundationFeedbackDefaults: FoundationFeedbackValues = {
  goal: '',
  name: '',
};
