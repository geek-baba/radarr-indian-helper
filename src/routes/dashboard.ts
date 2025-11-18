import { Router, Request, Response } from 'express';
import { releasesModel } from '../models/releases';
import { feedsModel } from '../models/feeds';
import radarrClient from '../radarr/client';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    // Get all releases
    const allReleases = releasesModel.getAll();
    const feeds = feedsModel.getAll();
    
    // Get feed names for display
    const feedMap: { [key: number]: string } = {};
    for (const feed of feeds) {
      if (feed.id) {
        feedMap[feed.id] = feed.name;
      }
    }

    // Add feed names to releases
    for (const release of allReleases) {
      (release as any).feedName = feedMap[release.feed_id] || 'Unknown Feed';
    }

    // Group releases by movie (using TMDB ID as primary key, fallback to normalized title)
    const releasesByMovie: { [key: string]: any[] } = {};
    
    for (const release of allReleases) {
      // Create a unique key for the movie
      let movieKey: string;
      if (release.tmdb_id) {
        movieKey = `tmdb_${release.tmdb_id}`;
      } else if (release.radarr_movie_id) {
        movieKey = `radarr_${release.radarr_movie_id}`;
      } else {
        // Fallback to normalized title + year
        movieKey = `title_${release.normalized_title}_${release.year || 'unknown'}`;
      }
      
      if (!releasesByMovie[movieKey]) {
        releasesByMovie[movieKey] = [];
      }
      releasesByMovie[movieKey].push(release);
    }

    // Build movie groups with metadata
    const movieGroups: Array<{
      movieKey: string;
      movieTitle: string;
      tmdbId?: number;
      radarrMovieId?: number;
      posterUrl?: string;
      imdbId?: string;
      originalLanguage?: string;
      add: any[];
      existing: any[];
      upgrade: any[];
    }> = [];

    for (const movieKey in releasesByMovie) {
      const releases = releasesByMovie[movieKey];
      
      // Get the primary movie info (prefer from existing/upgrade releases as they have more metadata)
      const primaryRelease = releases.find(r => r.radarr_movie_id) || 
                            releases.find(r => r.tmdb_id) || 
                            releases[0];
      
      const movieTitle = primaryRelease.radarr_movie_title || 
                        primaryRelease.tmdb_title || 
                        primaryRelease.title.split(/\s+\d{4}/)[0]; // Extract title without year
      
      // Categorize releases by status
      const add = releases.filter(r => r.status === 'NEW');
      const existing = releases.filter(r => r.status === 'IGNORED' && r.radarr_movie_id);
      const upgrade = releases.filter(r => r.status === 'UPGRADE_CANDIDATE');
      
      movieGroups.push({
        movieKey,
        movieTitle,
        tmdbId: primaryRelease.tmdb_id,
        radarrMovieId: primaryRelease.radarr_movie_id,
        add,
        existing,
        upgrade,
      });
    }

    // Enrich with movie metadata (poster, IMDB, etc.)
    for (const movieGroup of movieGroups) {
      // Get movie metadata if we have TMDB ID or Radarr movie ID
      if (movieGroup.tmdbId || movieGroup.radarrMovieId) {
        try {
          let movie: any = null;
          if (movieGroup.radarrMovieId) {
            movie = await radarrClient.getMovie(movieGroup.radarrMovieId);
          } else if (movieGroup.tmdbId) {
            movie = await radarrClient.getMovie(movieGroup.tmdbId);
          }
          
          if (movie) {
            // Get poster URL (Radarr provides images array)
            if (movie.images && movie.images.length > 0) {
              const poster = movie.images.find((img: any) => img.coverType === 'poster');
              if (poster) {
                movieGroup.posterUrl = poster.remoteUrl || poster.url;
              }
            }
            
            // Get IMDB ID
            if (movie.imdbId) {
              movieGroup.imdbId = movie.imdbId;
            }
            
            // Get TMDB ID (already have it, but ensure it's set)
            if (movie.tmdbId) {
              movieGroup.tmdbId = movie.tmdbId;
            }
            
            // Get original language
            if (movie.originalLanguage) {
              movieGroup.originalLanguage = movie.originalLanguage.name || movie.originalLanguage;
            }
          }
        } catch (error) {
          // Silently fail - just don't add metadata
          console.error(`Error fetching movie metadata for ${movieGroup.movieTitle}:`, error);
        }
      }
      
      // Add poster/metadata to all releases in this group
      for (const release of [...movieGroup.add, ...movieGroup.existing, ...movieGroup.upgrade]) {
        if (movieGroup.posterUrl) {
          (release as any).posterUrl = movieGroup.posterUrl;
        }
        if (movieGroup.imdbId) {
          (release as any).imdbId = movieGroup.imdbId;
        }
        if (movieGroup.tmdbId) {
          (release as any).tmdbId = movieGroup.tmdbId;
        }
        if (movieGroup.originalLanguage) {
          (release as any).originalLanguage = movieGroup.originalLanguage;
        }
      }
    }

    // Sort movie groups by title
    movieGroups.sort((a, b) => a.movieTitle.localeCompare(b.movieTitle));

    res.render('dashboard', {
      movieGroups,
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).send('Internal server error');
  }
});

export default router;

