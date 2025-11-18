import { parseReleaseFromTitle, normalizeTitle } from '../scoring/parseFromTitle';
import { ParsedRelease } from '../types/QualitySettings';

export interface RSSItem {
  title: string;
  link: string;
  guid: string;
  pubDate?: string;
  content?: string;
  contentSnippet?: string;
  description?: string;
}

export function parseRSSItem(item: RSSItem, feedId: number, sourceSite: string) {
  const title = item.title || item.link || 'Unknown';
  const parsed = parseReleaseFromTitle(title);
  const normalized = normalizeTitle(title);

  // Try to extract year from title
  const yearMatch = title.match(/\b(19|20)\d{2}\b/);
  const year = yearMatch ? parseInt(yearMatch[0], 10) : undefined;

  // Try to extract TMDB ID from description
  let tmdbId: number | undefined;
  const description = item.description || item.content || '';
  const tmdbMatch = description.match(/themoviedb\.org\/movie\/(\d+)/i) || 
                    description.match(/TMDB.*?(\d{4,})/i);
  if (tmdbMatch) {
    tmdbId = parseInt(tmdbMatch[1], 10);
  }

  // Extract clean movie title (remove quality info, year, etc.)
  // Try to get just the movie name part before the year and quality info
  let cleanTitle = title;
  // Remove common patterns: year, resolution, codec, source tags, etc.
  cleanTitle = cleanTitle.replace(/\s+\d{4}\s+.*$/, ''); // Remove year and everything after
  cleanTitle = cleanTitle.replace(/\s*\(.*?\)\s*$/, ''); // Remove parenthetical info at end
  cleanTitle = cleanTitle.trim();

  return {
    guid: item.guid || item.link,
    title: title,
    clean_title: cleanTitle, // Clean title for searching
    normalized_title: normalized,
    year,
    tmdb_id: tmdbId,
    source_site: sourceSite,
    feed_id: feedId,
    link: item.link,
    resolution: parsed.resolution,
    source_tag: parsed.sourceTag,
    codec: parsed.codec,
    audio: parsed.audio,
    rss_size_mb: parsed.sizeMb,
    published_at: item.pubDate || new Date().toISOString(),
    audio_languages: parsed.audioLanguages ? JSON.stringify(parsed.audioLanguages) : undefined,
    parsed,
  };
}

