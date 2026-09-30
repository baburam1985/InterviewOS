import {z} from 'zod';
import {categories} from './interview';

export const recordKindSchema = z.enum(['profile', 'story', 'session']);
export const recordIdSchema = z.union([z.literal('profile'), z.string().uuid()]);
const categorySchema = z.enum(categories);
const nonBlankText = (max: number) => z.string().max(max).refine(value => value.trim().length > 0);

export const profileSchema = z.object({
  role: z.string().trim().max(150),
  company: z.string().trim().max(150),
  resume: z.string().max(30_000),
  job: z.string().max(30_000),
});

const storyContentSchema = z.object({
  title: z.string().trim().min(1).max(200),
  situation: z.string().max(6_000),
  task: z.string().max(6_000),
  action: z.string().max(6_000),
  result: z.string().max(6_000),
});

export const storySchema = storyContentSchema.extend({
  id: z.string().uuid(),
  tag: z.enum(['Leadership', 'Conflict', 'Impact', 'Failure', 'Growth', 'Collaboration', 'Technical']),
});

export const sessionSchema = z.object({
  id: z.string().uuid(),
  question: z.string().trim().min(1).max(3_000),
  // Preserve code indentation and newlines while rejecting whitespace-only answers.
  answer: nonBlankText(30_000),
  category: categorySchema,
  seconds: z.number().finite().min(0).max(86_400),
  createdAt: z.string().datetime({offset: true}),
  ai: z.string().max(20_000).optional(),
});

export const workspaceBodySchema = z.discriminatedUnion('kind', [
  z.object({kind: z.literal('profile'), data: profileSchema}),
  z.object({kind: z.literal('story'), data: storySchema}),
  z.object({kind: z.literal('session'), data: sessionSchema}),
]);

export const coachBodySchema = z.object({
  question: z.string().trim().min(1).max(3_000),
  // An empty answer requests an outline; it is intentionally valid here.
  answer: z.string().max(30_000),
  category: categorySchema,
  profile: profileSchema,
  stories: z.array(storyContentSchema).max(5),
});
