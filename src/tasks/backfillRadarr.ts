import db from '../db';
import radarrClient from '../radarr/client';
import { parseReleaseFromTitle } from '../scoring/parseFromTitle';

interface BackfillRow {
  id: number;
  title: string;
  tmdb_id: number;
}

export interface BackfillRadarrSummary {
  totalCandidates: number;
  updated: number;
  skipped: number;
  notFound: number;
  errors: Array<{ id: number; title: string; error: string }>;
}

export async function backfillRadarrLinks(): Promise<BackfillRadarrSummary> {
  const rows = db
    .prepare(
      `SELECT id, title, tmdb_id
       FROM releases
       WHERE tmdb_id IS NOT NULL
         AND radarr_movie_id IS NULL`
    )
    .all() as BackfillRow[];

  const summary: BackfillRadarrSummary = {
    totalCandidates: rows.length,
    updated: 0,
    skipped: 0,
    notFound: 0,
    errors: [],
  };

  for (const row of rows) {
    if (!row.tmdb_id) {
      summary.skipped += 1;
      continue;
    }

    try {
      const movie = await radarrClient.getMovie(row.tmdb_id);
      if (movie && movie.id) {
        // Get full movie details with history (same as fetchFeeds)
        const movieWithHistory = await radarrClient.getMovieWithHistory(movie.id);
        const existingFile = movie.movieFile;
        const existingSizeMb = existingFile ? existingFile.size / (1024 * 1024) : undefined;

        // Parse existing file attributes (same logic as fetchFeeds)
        let existingParsed: any = null;
        if (existingFile) {
          existingParsed = parseReleaseFromTitle(existingFile.relativePath);
          // Also try to get info from mediaInfo if available
          if (existingFile.mediaInfo) {
            if (existingFile.mediaInfo.videoCodec) {
              existingParsed.videoCodecFromMediaInfo = existingFile.mediaInfo.videoCodec;
              if (existingParsed.codec === 'UNKNOWN') {
                const upper = existingFile.mediaInfo.videoCodec.toUpperCase();
                if (upper.includes('264') || upper.includes('AVC') || upper.includes('H.264')) {
                  existingParsed.codec = 'x264';
                } else if (upper.includes('265') || upper.includes('HEVC') || upper.includes('H.265')) {
                  existingParsed.codec = 'x265';
                }
              }
            }
            if (existingFile.mediaInfo.audioCodec) {
              existingParsed.audioFromMediaInfo = existingFile.mediaInfo.audioCodec;
              existingParsed.audioChannelsFromMediaInfo = existingFile.mediaInfo.audioChannels;
              if (existingParsed.audio === 'Unknown') {
                const upper = existingFile.mediaInfo.audioCodec.toUpperCase();
                const channels = existingFile.mediaInfo.audioChannels;
                if (upper.includes('EAC3') || upper.includes('E-AC-3') || upper.includes('DDP')) {
                  if (channels === 2) existingParsed.audio = 'DDP 2.0';
                  else if (channels === 6) existingParsed.audio = 'DDP 5.1';
                  else if (channels === 8) existingParsed.audio = 'DDP 7.1';
                  else existingParsed.audio = 'DDP';
                } else if (upper.includes('AC3') || upper.includes('AC-3')) {
                  if (channels === 2) existingParsed.audio = 'DD 2.0';
                  else if (channels === 6) existingParsed.audio = 'DD 5.1';
                  else existingParsed.audio = 'DD';
                } else if (upper.includes('TRUEHD')) {
                  existingParsed.audio = 'TrueHD';
                } else if (upper.includes('ATMOS')) {
                  existingParsed.audio = 'Atmos';
                } else if (upper.includes('AAC')) {
                  if (channels === 2) existingParsed.audio = 'AAC 2.0';
                  else if (channels === 6) existingParsed.audio = 'AAC 5.1';
                  else existingParsed.audio = 'AAC';
                } else {
                  existingParsed.audio = existingFile.mediaInfo.audioCodec;
                }
              }
            }
            if (existingFile.mediaInfo.audioLanguages) {
              existingParsed.audioLanguagesFromMediaInfo = existingFile.mediaInfo.audioLanguages;
            }
          }
        }

        // Get last download from history
        let lastDownload: any = null;
        if (movieWithHistory?.history && movieWithHistory.history.length > 0) {
          const downloadEvents = movieWithHistory.history.filter((h: any) => 
            h.eventType === 'downloadFolderImported' || 
            h.eventType === 'grabbed' ||
            h.data?.downloadUrl
          );
          if (downloadEvents.length > 0) {
            downloadEvents.sort((a: any, b: any) => 
              new Date(b.date).getTime() - new Date(a.date).getTime()
            );
            lastDownload = downloadEvents[0];
          }
        }

        // Parse last download to get source tag if available
        let lastDownloadSourceTag = existingParsed?.sourceTag || 'OTHER';
        if (lastDownload && lastDownload.sourceTitle) {
          const lastDownloadParsed = parseReleaseFromTitle(lastDownload.sourceTitle);
          if (lastDownloadParsed.sourceTag && lastDownloadParsed.sourceTag !== 'OTHER') {
            lastDownloadSourceTag = lastDownloadParsed.sourceTag;
          }
        }

        const existingFileAttributes = existingFile && existingParsed ? {
          path: existingFile.relativePath,
          resolution: existingParsed.resolution,
          codec: existingParsed.codec,
          sourceTag: lastDownloadSourceTag,
          audio: existingParsed.audio,
          audioFromMediaInfo: existingParsed.audioFromMediaInfo,
          audioChannelsFromMediaInfo: existingParsed.audioChannelsFromMediaInfo,
          audioLanguages: existingParsed.audioLanguagesFromMediaInfo,
          videoCodec: existingParsed.videoCodecFromMediaInfo,
          sizeMb: existingSizeMb,
          lastDownload: lastDownload ? {
            sourceTitle: lastDownload.sourceTitle,
            date: lastDownload.date,
            releaseGroup: lastDownload.data?.releaseGroup,
          } : null,
        } : null;

        db.prepare(
          `UPDATE releases
           SET radarr_movie_id = ?,
               radarr_movie_title = ?,
               existing_size_mb = ?,
               existing_file_path = ?,
               existing_file_attributes = ?,
               radarr_history = ?,
               last_checked_at = datetime('now')
           WHERE id = ?`
        ).run(
          movie.id,
          movie.title,
          existingSizeMb,
          existingFile?.relativePath || null,
          existingFileAttributes ? JSON.stringify(existingFileAttributes) : null,
          movieWithHistory?.history ? JSON.stringify(movieWithHistory.history.slice(0, 10)) : null,
          row.id
        );

        summary.updated += 1;
      } else {
        summary.notFound += 1;
      }
    } catch (error: any) {
      summary.errors.push({
        id: row.id,
        title: row.title,
        error: error?.message || 'Unknown error',
      });
    }
  }

  return summary;
}


