import Parser from 'rss-parser';
import db from '../db';
import { feedsModel } from '../models/feeds';
import { parseRSSItem } from '../rss/parseRelease';

const parser = new Parser();

export interface RssSyncStats {
  totalFeeds: number;
  feedsProcessed: number;
  totalItems: number;
  itemsSynced: number;
  itemsUpdated: number;
  errors: Array<{ feedId: number; feedName: string; error: string }>;
  lastSyncAt: Date;
}

/**
 * Sync all RSS feeds and store items in rss_feed_items table
 */
export async function syncRssFeeds(): Promise<RssSyncStats> {
  const stats: RssSyncStats = {
    totalFeeds: 0,
    feedsProcessed: 0,
    totalItems: 0,
    itemsSynced: 0,
    itemsUpdated: 0,
    errors: [],
    lastSyncAt: new Date(),
  };

  try {
    console.log('Starting RSS feeds sync...');
    const feeds = feedsModel.getEnabled();
    stats.totalFeeds = feeds.length;

    console.log(`Found ${feeds.length} enabled RSS feeds`);

    for (const feed of feeds) {
      try {
        console.log(`Syncing feed: ${feed.name} (${feed.url})`);
        const feedData = await parser.parseURL(feed.url);

        if (!feedData.items || feedData.items.length === 0) {
          console.log(`No items found in feed: ${feed.name}`);
          stats.feedsProcessed++;
          continue;
        }

        console.log(`Found ${feedData.items.length} items in feed: ${feed.name}`);
        stats.totalItems += feedData.items.length;

        // Use transaction for better performance
        const transaction = db.transaction(() => {
          for (const item of feedData.items) {
            try {
              if (!item.title && !item.link) {
                continue; // Skip items without title or link
              }

              const parsed = parseRSSItem(item as any, feed.id!, feed.name);
              const guid = parsed.guid || item.link || '';

              // Check if item already exists
              const existing = db
                .prepare('SELECT id FROM rss_feed_items WHERE guid = ?')
                .get(guid) as { id: number } | undefined;

              const itemData = {
                guid,
                feed_id: feed.id!,
                feed_name: feed.name,
                title: parsed.title,
                normalized_title: parsed.normalized_title,
                clean_title: (parsed as any).clean_title || null,
                year: parsed.year || null,
                source_site: parsed.source_site,
                link: parsed.link,
                resolution: parsed.resolution,
                source_tag: parsed.source_tag,
                codec: parsed.codec,
                audio: parsed.audio,
                rss_size_mb: parsed.rss_size_mb || null,
                published_at: parsed.published_at,
                tmdb_id: (parsed as any).tmdb_id || null,
                imdb_id: (parsed as any).imdb_id || null,
                audio_languages: parsed.audio_languages || null,
                raw_data: JSON.stringify(item),
                synced_at: new Date().toISOString(),
              };

              if (existing) {
                // Update existing
                db.prepare(`
                  UPDATE rss_feed_items SET
                    feed_id = ?,
                    feed_name = ?,
                    title = ?,
                    normalized_title = ?,
                    clean_title = ?,
                    year = ?,
                    source_site = ?,
                    link = ?,
                    resolution = ?,
                    source_tag = ?,
                    codec = ?,
                    audio = ?,
                    rss_size_mb = ?,
                    published_at = ?,
                    tmdb_id = ?,
                    imdb_id = ?,
                    audio_languages = ?,
                    raw_data = ?,
                    synced_at = ?
                  WHERE guid = ?
                `).run(
                  itemData.feed_id,
                  itemData.feed_name,
                  itemData.title,
                  itemData.normalized_title,
                  itemData.clean_title,
                  itemData.year,
                  itemData.source_site,
                  itemData.link,
                  itemData.resolution,
                  itemData.source_tag,
                  itemData.codec,
                  itemData.audio,
                  itemData.rss_size_mb,
                  itemData.published_at,
                  itemData.tmdb_id,
                  itemData.imdb_id,
                  itemData.audio_languages,
                  itemData.raw_data,
                  itemData.synced_at,
                  guid
                );
                stats.itemsUpdated++;
              } else {
                // Insert new
                db.prepare(`
                  INSERT INTO rss_feed_items (
                    guid, feed_id, feed_name, title, normalized_title, clean_title,
                    year, source_site, link, resolution, source_tag, codec, audio,
                    rss_size_mb, published_at, tmdb_id, imdb_id, audio_languages,
                    raw_data, synced_at
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                  itemData.guid,
                  itemData.feed_id,
                  itemData.feed_name,
                  itemData.title,
                  itemData.normalized_title,
                  itemData.clean_title,
                  itemData.year,
                  itemData.source_site,
                  itemData.link,
                  itemData.resolution,
                  itemData.source_tag,
                  itemData.codec,
                  itemData.audio,
                  itemData.rss_size_mb,
                  itemData.published_at,
                  itemData.tmdb_id,
                  itemData.imdb_id,
                  itemData.audio_languages,
                  itemData.raw_data,
                  itemData.synced_at
                );
                stats.itemsSynced++;
              }
            } catch (itemError: any) {
              console.error(`Error processing RSS item: ${item.title || item.link}`, itemError);
              // Continue processing other items
            }
          }
        });

        transaction();
        stats.feedsProcessed++;
        console.log(`Feed ${feed.name}: Synced ${feedData.items.length} items`);
      } catch (feedError: any) {
        stats.errors.push({
          feedId: feed.id!,
          feedName: feed.name,
          error: feedError?.message || 'Unknown error',
        });
        console.error(`Error syncing feed: ${feed.name}`, feedError);
        stats.feedsProcessed++;
      }
    }

    // Update last sync timestamp
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('rss_last_sync', ?)").run(
      stats.lastSyncAt.toISOString()
    );

    console.log(`RSS sync completed: ${stats.feedsProcessed}/${stats.totalFeeds} feeds, ${stats.itemsSynced} new items, ${stats.itemsUpdated} updated items, ${stats.errors.length} errors`);
    return stats;
  } catch (error: any) {
    console.error('RSS sync error:', error);
    throw error;
  }
}

/**
 * Get all synced RSS feed items
 */
export function getSyncedRssItems(feedId?: number): any[] {
  if (feedId) {
    return db.prepare('SELECT * FROM rss_feed_items WHERE feed_id = ? ORDER BY published_at DESC').all(feedId);
  }
  return db.prepare('SELECT * FROM rss_feed_items ORDER BY published_at DESC').all();
}

/**
 * Get RSS items grouped by feed
 */
export function getSyncedRssItemsByFeed(): Array<{ feedId: number; feedName: string; itemCount: number; lastSync: string }> {
  return db.prepare(`
    SELECT 
      feed_id as feedId,
      feed_name as feedName,
      COUNT(*) as itemCount,
      MAX(synced_at) as lastSync
    FROM rss_feed_items
    GROUP BY feed_id, feed_name
    ORDER BY feed_name
  `).all() as any[];
}

/**
 * Get last sync timestamp
 */
export function getLastRssSync(): Date | null {
  const result = db.prepare("SELECT value FROM app_settings WHERE key = 'rss_last_sync'").get() as { value: string } | undefined;
  return result ? new Date(result.value) : null;
}

