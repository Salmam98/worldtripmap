import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

/**
 * Guides: the "Travel inspiration" section. Each one is written and fact-checked by hand, lists
 * its sources, and links to the map tool it relates to. Add a Markdown file to publish a new one.
 */
const guides = defineCollection({
  loader: glob({ base: './src/content/guides', pattern: '**/*.md' }),
  schema: z.object({
    /** Search results cut titles at about 60 characters; the built-site tests hold every page to 62. */
    title: z.string().max(62),
    /** Meta description, about 150 characters. */
    description: z.string().max(170),
    /** One or two sentences shown under the headline and in listings. */
    deck: z.string(),
    published: z.coerce.date(),
    updated: z.coerce.date(),
    minutes: z.number().int().positive(),
    /** The map this guide leads to. */
    map: z.enum(['world', 'canada', 'canada-cities']),
    /** The shelf it sits on in the guides index: the world, Canada, or making and printing a map. */
    topic: z.enum(['world', 'canada', 'making']),
    cta: z.string(),
    /** Social image under /og/. */
    image: z.string().default('/og/guides.png'),
    order: z.number().default(10),
    sources: z.array(z.object({ title: z.string(), publisher: z.string(), url: z.url() })).default([]),
    /** Files to print, made by `npm run checklists:build` from the same data as the map. */
    downloads: z.array(z.object({ label: z.string(), href: z.string().startsWith('/downloads/') })).default([]),
    /** What the picture of the printed sheet shows, for people who cannot see it. Needed when there are downloads. */
    downloadsAlt: z.string().optional(),
  }),
});

export const collections = { guides };
