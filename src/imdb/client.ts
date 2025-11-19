import axios, { AxiosInstance } from 'axios';

interface OMDBSearchResult {
  Title: string;
  Year: string;
  imdbID: string;
  Type: string;
  Poster?: string;
}

interface OMDBResponse {
  Response: string;
  Search?: OMDBSearchResult[];
  totalResults?: string;
  Error?: string;
}

class IMDBClient {
  private client: AxiosInstance;
  private apiKey: string | null = null;

  constructor() {
    // OMDB API is free and doesn't require authentication for basic searches
    // But we can use an API key if provided for higher rate limits
    this.client = axios.create({
      baseURL: 'https://www.omdbapi.com',
    });
  }

  setApiKey(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Search for a movie by title and year using OMDB API
   * Returns the IMDB ID if found
   */
  async searchMovie(query: string, year?: number): Promise<{ imdbId: string; title: string; year: string } | null> {
    try {
      const params: any = {
        s: query,
        type: 'movie',
      };
      
      if (this.apiKey) {
        params.apikey = this.apiKey;
      }
      
      if (year) {
        params.y = year;
      }

      const response = await this.client.get<OMDBResponse>('/', { params });
      
      if (response.data.Response === 'True' && response.data.Search && response.data.Search.length > 0) {
        // If we have a year, prefer results that match the year exactly
        if (year) {
          const yearMatch = response.data.Search.find(movie => {
            const movieYear = parseInt(movie.Year.split('–')[0], 10); // Handle ranges like "2025–2026"
            return movieYear === year;
          });
          if (yearMatch) {
            return {
              imdbId: yearMatch.imdbID,
              title: yearMatch.Title,
              year: yearMatch.Year,
            };
          }
        }
        
        // Return first result
        const first = response.data.Search[0];
        return {
          imdbId: first.imdbID,
          title: first.Title,
          year: first.Year,
        };
      }
      
      return null;
    } catch (error) {
      console.error('IMDB/OMDB search error:', error);
      return null;
    }
  }

  /**
   * Search Google/DuckDuckGo for IMDB ID by movie title and year
   * Extracts IMDB ID from search results
   * Uses "clean title yyyy tmdb" format for better results
   */
  async searchGoogleForImdbId(query: string, year?: number): Promise<string | null> {
    try {
      // Construct search query - try "clean title yyyy imdb" format for better results
      const searchQuery = year 
        ? `${query} ${year} imdb`
        : `${query} imdb`;
      
      // Use DuckDuckGo HTML search (no API key needed, privacy-friendly)
      // DuckDuckGo doesn't require API keys and is more lenient with automated requests
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchQuery)}`;
      
      const response = await this.client.get(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Referer': 'https://duckduckgo.com/',
        },
        responseType: 'text',
        timeout: 15000, // 15 second timeout
        maxRedirects: 5,
      });
      
      const htmlContent = response.data;
      
      // Extract IMDB ID from search results - try multiple patterns
      // Pattern 1: Direct IMDB URL in href attributes
      const hrefPattern = /href=["']([^"']*imdb[^"']*\/title\/(tt\d{7,})[^"']*)["']/gi;
      let hrefMatch = hrefPattern.exec(htmlContent);
      if (hrefMatch && hrefMatch[2]) {
        console.log(`  Found IMDB ID ${hrefMatch[2]} via DuckDuckGo search (href pattern) for: "${query}"`);
        return hrefMatch[2];
      }
      
      // Pattern 2: IMDB URL anywhere in the HTML
      const imdbUrlPattern = /(?:www\.)?imdb\.com\/title\/(tt\d{7,})/gi;
      const urlMatches = htmlContent.match(imdbUrlPattern);
      if (urlMatches && urlMatches.length > 0) {
        const imdbIdMatch = urlMatches[0].match(/tt\d{7,}/i);
        if (imdbIdMatch) {
          console.log(`  Found IMDB ID ${imdbIdMatch[0]} via DuckDuckGo search (URL pattern) for: "${query}"`);
          return imdbIdMatch[0];
        }
      }
      
      // Pattern 3: Look for IMDB ID near "imdb" text in the HTML
      const imdbTextPattern = /imdb[^<]*?(tt\d{7,})/gi;
      const textMatches = htmlContent.match(imdbTextPattern);
      if (textMatches && textMatches.length > 0) {
        const idMatch = textMatches[0].match(/tt\d{7,}/i);
        if (idMatch) {
          console.log(`  Found IMDB ID ${idMatch[0]} via DuckDuckGo search (text pattern) for: "${query}"`);
          return idMatch[0];
        }
      }
      
      // Pattern 4: Find any tt\d{7,} pattern and check if it's in an IMDB-related context
      const allTtPattern = /\btt\d{7,}\b/gi;
      const allMatches: string[] = [];
      let match;
      while ((match = allTtPattern.exec(htmlContent)) !== null) {
        allMatches.push(match[0]);
      }
      
      if (allMatches.length > 0) {
        // Check each match to see if it's near "imdb" text
        for (const ttId of allMatches) {
          const contextStart = Math.max(0, htmlContent.indexOf(ttId) - 200);
          const contextEnd = Math.min(htmlContent.length, htmlContent.indexOf(ttId) + 200);
          const context = htmlContent.substring(contextStart, contextEnd).toLowerCase();
          
          if (context.includes('imdb') || context.includes('title')) {
            console.log(`  Found IMDB ID ${ttId} via DuckDuckGo search (context check) for: "${query}"`);
            return ttId;
          }
        }
        
        // If no context match but we have matches, use the first one (might be IMDB ID)
        console.log(`  Found potential IMDB ID ${allMatches[0]} via DuckDuckGo search (fallback) for: "${query}"`);
        return allMatches[0];
      }
      
      console.log(`  No IMDB ID found in DuckDuckGo search results for: "${query}" (response length: ${htmlContent.length})`);
      return null;
    } catch (error: any) {
      console.error(`  DuckDuckGo search for IMDB ID error for "${query}":`, error?.message || error);
      return null;
    }
  }

  /**
   * Get movie details by IMDB ID
   */
  async getMovieByImdbId(imdbId: string): Promise<any | null> {
    try {
      const params: any = {
        i: imdbId,
        type: 'movie',
      };
      
      if (this.apiKey) {
        params.apikey = this.apiKey;
      }

      const response = await this.client.get('/', { params });
      
      if (response.data.Response === 'True') {
        return response.data;
      }
      
      return null;
    } catch (error) {
      console.error('IMDB/OMDB get movie error:', error);
      return null;
    }
  }
}

export default new IMDBClient();

