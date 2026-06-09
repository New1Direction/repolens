import { createFromSource } from 'fumadocs-core/search/server';
import { source } from '@/lib/source';

// Builds the search index from the docs source (now that lib/source resolves files correctly).
export const { GET } = createFromSource(source);
