import axios, { AxiosInstance } from 'axios';
import { settingsModel } from '../models/settings';

class SonarrClient {
  private client: AxiosInstance | null = null;

  constructor() {
    this.initializeClient();
  }

  private initializeClient() {
    const allSettings = settingsModel.getAll();
    const sonarrApiUrl = allSettings.find((s) => s.key === 'sonarr_api_url')?.value;
    const sonarrApiKey = allSettings.find((s) => s.key === 'sonarr_api_key')?.value;

    console.log(
      'Sonarr client initialization - URL:',
      sonarrApiUrl ? 'Set' : 'Not set',
      'Key:',
      sonarrApiKey ? 'Set' : 'Not set'
    );

    if (sonarrApiUrl && sonarrApiKey) {
      this.client = axios.create({
        baseURL: sonarrApiUrl,
        headers: {
          'X-Api-Key': sonarrApiKey,
        },
        timeout: 30000,
      });
      console.log('Sonarr client initialized with URL:', sonarrApiUrl);
    } else {
      this.client = null;
      console.log('Sonarr client NOT initialized - missing URL or Key');
    }
  }

  updateConfig() {
    this.initializeClient();
  }

  private ensureClient(): AxiosInstance {
    this.initializeClient();

    if (!this.client) {
      const allSettings = settingsModel.getAll();
      const sonarrApiUrl = allSettings.find((s) => s.key === 'sonarr_api_url')?.value;
      const sonarrApiKey = allSettings.find((s) => s.key === 'sonarr_api_key')?.value;

      if (!sonarrApiUrl || !sonarrApiKey) {
        throw new Error('Sonarr API not configured. Please configure Sonarr API URL and Key in Settings page.');
      }

      throw new Error('Sonarr client initialization failed. Please check your Sonarr API URL and Key in Settings.');
    }

    if (!this.client.defaults.baseURL || !this.client.defaults.headers?.['X-Api-Key']) {
      throw new Error('Sonarr client configuration is invalid. Please check your Sonarr API URL and Key in Settings.');
    }

    return this.client;
  }

  async getSeries() {
    try {
      const response = await this.ensureClient().get('/series');
      return response.data || [];
    } catch (error) {
      console.error('Sonarr get series error:', error);
      return [];
    }
  }

  async lookupSeries(term: string) {
    try {
      const response = await this.ensureClient().get('/series/lookup', {
        params: { term },
      });
      return response.data || [];
    } catch (error) {
      console.error('Sonarr lookup series error:', error);
      return [];
    }
  }
}

export default new SonarrClient();


