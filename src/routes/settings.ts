import { Router, Request, Response } from 'express';
import { feedsModel } from '../models/feeds';
import { settingsModel } from '../models/settings';
import { QualitySettings } from '../types/QualitySettings';
import { backfillRadarrLinks } from '../tasks/backfillRadarr';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const feeds = feedsModel.getAll();
    const qualitySettings = settingsModel.getQualitySettings();
    const allSettings = settingsModel.getAll();
    
    console.log('=== Loading Settings Page ===');
    console.log('Total settings:', allSettings.length);
    console.log('Settings keys:', allSettings.map(s => s.key).join(', '));
    
    const tmdbApiKey = allSettings.find(s => s.key === 'tmdb_api_key')?.value || '';
    const omdbApiKey = allSettings.find(s => s.key === 'omdb_api_key')?.value || '';
    const radarrApiUrl = allSettings.find(s => s.key === 'radarr_api_url')?.value || '';
    const radarrApiKey = allSettings.find(s => s.key === 'radarr_api_key')?.value || '';
    
    console.log('Radarr URL found:', radarrApiUrl ? 'Yes' : 'No');
    console.log('Radarr Key found:', radarrApiKey ? 'Yes' : 'No');
    console.log('Database path:', process.env.DB_PATH || './data/app.db');

    res.render('settings', {
      feeds,
      qualitySettings,
      tmdbApiKey,
      omdbApiKey,
      radarrApiUrl,
      radarrApiKey,
    });
  } catch (error) {
    console.error('Settings page error:', error);
    res.status(500).send('Internal server error');
  }
});

router.get('/feeds/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const feed = feedsModel.getById(id);
    
    if (!feed) {
      return res.status(404).json({ error: 'Feed not found' });
    }

    res.json({ success: true, feed });
  } catch (error) {
    console.error('Get feed error:', error);
    res.status(500).json({ error: 'Failed to get feed' });
  }
});

router.post('/feeds', async (req: Request, res: Response) => {
  try {
    const { name, url, enabled } = req.body;
    
    if (!name || !url) {
      return res.status(400).json({ error: 'Name and URL are required' });
    }

    const feed = feedsModel.create({
      name,
      url,
      enabled: enabled === 'true' || enabled === true,
    });

    res.json({ success: true, feed });
  } catch (error) {
    console.error('Create feed error:', error);
    res.status(500).json({ error: 'Failed to create feed' });
  }
});

router.put('/feeds/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name, url, enabled } = req.body;

    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (url !== undefined) updates.url = url;
    if (enabled !== undefined) {
      updates.enabled = typeof enabled === 'string' 
        ? (enabled === 'true' || enabled === '1') 
        : Boolean(enabled);
    }

    const feed = feedsModel.update(id, updates);

    if (!feed) {
      return res.status(404).json({ error: 'Feed not found' });
    }

    res.json({ success: true, feed });
  } catch (error) {
    console.error('Update feed error:', error);
    res.status(500).json({ error: 'Failed to update feed' });
  }
});

router.delete('/feeds/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const success = feedsModel.delete(id);

    if (!success) {
      return res.status(404).json({ error: 'Feed not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete feed error:', error);
    res.status(500).json({ error: 'Failed to delete feed' });
  }
});

router.post('/quality', async (req: Request, res: Response) => {
  try {
    const settings: QualitySettings = req.body;
    
    // Validate required fields
    if (!settings.resolutions || !settings.resolutionWeights) {
      return res.status(400).json({ error: 'Invalid quality settings' });
    }

    settingsModel.setQualitySettings(settings);
    res.json({ success: true });
  } catch (error) {
    console.error('Update quality settings error:', error);
    res.status(500).json({ error: 'Failed to update quality settings' });
  }
});

router.post('/refresh', async (req: Request, res: Response) => {
  try {
    // Import sync services
    const { syncRadarrMovies } = await import('../services/radarrSync');
    const { syncRssFeeds } = await import('../services/rssSync');
    const { runMatchingEngine } = await import('../services/matchingEngine');

    // Run full sync cycle in background
    (async () => {
      try {
        console.log('Manual sync triggered from UI');
        await syncRadarrMovies();
        await syncRssFeeds();
        await runMatchingEngine();
        console.log('Manual sync completed');
      } catch (error) {
        console.error('Manual sync error:', error);
      }
    })();

    res.json({ success: true, message: 'Full sync cycle started (Radarr → RSS → Matching)' });
  } catch (error) {
    console.error('Refresh error:', error);
    res.status(500).json({ error: 'Failed to start refresh' });
  }
});

router.get('/refresh/stats', (req: Request, res: Response) => {
  try {
    // Refresh stats are no longer used with the new sync architecture
    // Return empty stats for backward compatibility
    res.json({ success: true, stats: { isRunning: false, currentFeed: null, feedsProcessed: 0, totalFeeds: 0 } });
  } catch (error) {
    console.error('Get refresh stats error:', error);
    res.status(500).json({ error: 'Failed to get refresh stats' });
  }
});

router.post('/tmdb-api-key', (req: Request, res: Response) => {
  try {
    const { apiKey } = req.body;
    settingsModel.set('tmdb_api_key', apiKey || '');
    res.json({ success: true });
  } catch (error) {
    console.error('Save TMDB API key error:', error);
    res.status(500).json({ error: 'Failed to save TMDB API key' });
  }
});

router.post('/omdb-api-key', (req: Request, res: Response) => {
  try {
    const { apiKey } = req.body;
    settingsModel.set('omdb_api_key', apiKey || '');
    res.json({ success: true });
  } catch (error) {
    console.error('Save OMDB API key error:', error);
    res.status(500).json({ error: 'Failed to save OMDB API key' });
  }
});

router.post('/radarr-config', async (req: Request, res: Response) => {
  console.log('=== POST /settings/radarr-config RECEIVED ===');
  console.log('Request body keys:', Object.keys(req.body));
  console.log('Request body:', JSON.stringify({ ...req.body, apiKey: req.body.apiKey ? '***HIDDEN***' : undefined }));
  
  try {
    const { apiUrl, apiKey } = req.body;
    
    console.log('=== Saving Radarr Config ===');
    console.log('Received URL:', apiUrl ? `${apiUrl.substring(0, 20)}...` : 'Missing');
    console.log('Received Key:', apiKey ? `${apiKey.substring(0, 10)}...` : 'Missing');
    
    if (!apiUrl || !apiKey) {
      console.error('Radarr config validation failed: Missing URL or Key');
      return res.status(400).json({ success: false, error: 'Radarr API URL and Key are required' });
    }

    // Trim whitespace
    const trimmedUrl = apiUrl.trim();
    const trimmedKey = apiKey.trim();

    // Validate URL format
    try {
      new URL(trimmedUrl);
    } catch (error) {
      console.error('Radarr config validation failed: Invalid URL format', trimmedUrl);
      return res.status(400).json({ success: false, error: 'Invalid Radarr API URL format' });
    }

    console.log('Saving to database...');
    console.log('Database path:', process.env.DB_PATH || './data/app.db');
    
    // Save to database
    settingsModel.set('radarr_api_url', trimmedUrl);
    settingsModel.set('radarr_api_key', trimmedKey);
    
    console.log('Settings saved. Verifying...');
    
    // Immediately verify it was saved
    const allSettings = settingsModel.getAll();
    console.log('Total settings in database:', allSettings.length);
    console.log('All settings keys:', allSettings.map(s => s.key).join(', '));
    
    const savedUrl = allSettings.find(s => s.key === 'radarr_api_url')?.value;
    const savedKey = allSettings.find(s => s.key === 'radarr_api_key')?.value;
    
    console.log('Saved URL:', savedUrl ? `${savedUrl.substring(0, 20)}...` : 'NOT FOUND');
    console.log('Saved Key:', savedKey ? `${savedKey.substring(0, 10)}...` : 'NOT FOUND');
    
    if (!savedUrl || !savedKey) {
      console.error('ERROR: Settings were not found in database after saving!');
      return res.status(500).json({ 
        success: false, 
        error: 'Configuration was not saved correctly. Database may not be persisting. Check Docker volume mount.' 
      });
    }
    
    if (savedUrl !== trimmedUrl || savedKey !== trimmedKey) {
      console.error('ERROR: Saved values do not match input values!');
      console.error('Expected URL:', trimmedUrl);
      console.error('Got URL:', savedUrl);
      return res.status(500).json({ success: false, error: 'Configuration values do not match. Please try again.' });
    }

    console.log('✓ Settings verified in database');

    // Update Radarr client configuration
    console.log('Updating Radarr client configuration...');
    const radarrClient = (await import('../radarr/client')).default;
    radarrClient.updateConfig();
    
    // Verify client can read the settings
    const clientSettings = settingsModel.getAll();
    const clientUrl = clientSettings.find(s => s.key === 'radarr_api_url')?.value;
    const clientKey = clientSettings.find(s => s.key === 'radarr_api_key')?.value;
    console.log('Client can read URL:', clientUrl ? 'Yes' : 'No');
    console.log('Client can read Key:', clientKey ? 'Yes' : 'No');
    
    console.log('=== Radarr Config Save Complete ===');
    res.json({ success: true, message: 'Radarr configuration saved successfully' });
  } catch (error: any) {
    console.error('Save Radarr config error:', error);
    console.error('Error stack:', error?.stack);
    res.status(500).json({ success: false, error: 'Failed to save Radarr configuration: ' + (error?.message || 'Unknown error') });
  }
});

router.post('/maintenance/backfill-radarr', async (_req: Request, res: Response) => {
  try {
    const summary = await backfillRadarrLinks();
    res.json({ success: true, summary });
  } catch (error) {
    console.error('Backfill Radarr links error:', error);
    res.status(500).json({ error: 'Failed to backfill Radarr links' });
  }
});

// Debug endpoint to check database values
router.get('/debug/radarr-config', (req: Request, res: Response) => {
  try {
    const allSettings = settingsModel.getAll();
    const radarrApiUrl = allSettings.find(s => s.key === 'radarr_api_url');
    const radarrApiKey = allSettings.find(s => s.key === 'radarr_api_key');
    
    res.json({
      success: true,
      database: {
        radarr_api_url: radarrApiUrl ? {
          exists: true,
          value: radarrApiUrl.value ? `${radarrApiUrl.value.substring(0, 30)}...` : 'empty',
          length: radarrApiUrl.value?.length || 0
        } : { exists: false },
        radarr_api_key: radarrApiKey ? {
          exists: true,
          value: radarrApiKey.value ? `${radarrApiKey.value.substring(0, 10)}...` : 'empty',
          length: radarrApiKey.value?.length || 0
        } : { exists: false }
      },
      allSettingsKeys: allSettings.map(s => s.key),
      totalSettings: allSettings.length
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;

