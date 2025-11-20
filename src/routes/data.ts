import { Router, Request, Response } from 'express';
import { getSyncedRadarrMovies, getLastRadarrSync } from '../services/radarrSync';
import { getSyncedRssItems, getSyncedRssItemsByFeed, getLastRssSync } from '../services/rssSync';
import { feedsModel } from '../models/feeds';

const router = Router();

// Radarr Data page
router.get('/radarr', (req: Request, res: Response) => {
  try {
    const movies = getSyncedRadarrMovies();
    const lastSync = getLastRadarrSync();
    
    res.render('radarr-data', {
      movies,
      lastSync,
      totalMovies: movies.length,
      moviesWithFiles: movies.filter((m: any) => m.has_file).length,
    });
  } catch (error) {
    console.error('Radarr data page error:', error);
    res.status(500).send('Internal server error');
  }
});

// RSS Feed Data page
router.get('/rss', (req: Request, res: Response) => {
  try {
    const feedId = req.query.feedId ? parseInt(req.query.feedId as string, 10) : undefined;
    const feeds = feedsModel.getAll();
    const itemsByFeed = getSyncedRssItemsByFeed();
    const items = getSyncedRssItems(feedId);
    const lastSync = getLastRssSync();
    
    res.render('rss-data', {
      feeds,
      itemsByFeed,
      items,
      selectedFeedId: feedId,
      lastSync,
      totalItems: items.length,
    });
  } catch (error) {
    console.error('RSS data page error:', error);
    res.status(500).send('Internal server error');
  }
});

export default router;

