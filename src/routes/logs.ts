import { Router, Request, Response } from 'express';
import db from '../db';

const router = Router();

interface LogQuery {
  page?: number;
  limit?: number;
  level?: string;
  source?: string;
  search?: string;
  jobId?: string;
  hasErrorOnly?: boolean;
  dateFrom?: string;
  dateTo?: string;
}

// GET /api/logs - List logs with filtering and offset pagination
router.get('/', (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200); // Max 200 per page
    
    const query: LogQuery = {
      page,
      limit,
      level: req.query.level as string,
      source: req.query.source as string,
      search: req.query.search as string,
      jobId: req.query.jobId as string,
      hasErrorOnly: req.query.hasErrorOnly === 'true',
      dateFrom: req.query.dateFrom as string,
      dateTo: req.query.dateTo as string,
    };

    let sql = 'SELECT * FROM structured_logs WHERE 1=1';
    let countSql = 'SELECT COUNT(*) as total FROM structured_logs WHERE 1=1';
    const params: any[] = [];
    const countParams: any[] = [];

    // Level filter
    if (query.level) {
      sql += ' AND level = ?';
      countSql += ' AND level = ?';
      params.push(query.level);
      countParams.push(query.level);
    } else if (query.hasErrorOnly) {
      sql += ' AND (level = ? OR level = ?)';
      countSql += ' AND (level = ? OR level = ?)';
      params.push('ERROR', 'WARN');
      countParams.push('ERROR', 'WARN');
    }

    // Source filter
    if (query.source) {
      sql += ' AND source = ?';
      countSql += ' AND source = ?';
      params.push(query.source);
      countParams.push(query.source);
    }

    // Job ID filter
    if (query.jobId) {
      sql += ' AND job_id = ?';
      countSql += ' AND job_id = ?';
      params.push(query.jobId);
      countParams.push(query.jobId);
    }

    // Date range filter
    if (query.dateFrom) {
      sql += ' AND timestamp >= ?';
      countSql += ' AND timestamp >= ?';
      params.push(query.dateFrom);
      countParams.push(query.dateFrom);
    }
    if (query.dateTo) {
      sql += ' AND timestamp <= ?';
      countSql += ' AND timestamp <= ?';
      params.push(query.dateTo);
      countParams.push(query.dateTo);
    }

    // Text search (across message, release_title, file_path)
    if (query.search) {
      sql += ' AND (message LIKE ? OR release_title LIKE ? OR file_path LIKE ?)';
      countSql += ' AND (message LIKE ? OR release_title LIKE ? OR file_path LIKE ?)';
      const searchTerm = `%${query.search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
      countParams.push(searchTerm, searchTerm, searchTerm);
    }

    // Get total count for pagination
    const countResult = db.prepare(countSql).get(countParams) as any;
    const total = countResult?.total || 0;

    // Offset-based pagination
    const pageLimit = query.limit || 50;
    const currentPage = query.page || 1;
    const offset = (currentPage - 1) * pageLimit;
    sql += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    params.push(pageLimit, offset);

    const rows = db.prepare(sql).all(params) as any[];

    // Parse JSON details
    const processedLogs = rows.map(log => ({
      id: log.id,
      timestamp: log.timestamp,
      level: log.level,
      source: log.source,
      message: log.message,
      details: log.details ? JSON.parse(log.details) : null,
      filePath: log.file_path,
      releaseTitle: log.release_title,
      jobId: log.job_id,
      errorStack: log.error_stack,
    }));

    const totalPages = Math.ceil(total / pageLimit);

    res.json({
      success: true,
      logs: processedLogs,
      pagination: {
        page: currentPage,
        limit: pageLimit,
        total,
        totalPages,
        hasMore: currentPage < totalPages,
      },
      count: processedLogs.length,
    });
  } catch (error: any) {
    console.error('Error fetching logs:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch logs',
    });
  }
});

// GET /api/logs/:id - Get single log entry with full details
router.get('/:id', (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid log ID',
      });
    }

    const row = db.prepare('SELECT * FROM structured_logs WHERE id = ?').get(id) as any;

    if (!row) {
      return res.status(404).json({
        success: false,
        error: 'Log entry not found',
      });
    }

    const log = {
      id: row.id,
      timestamp: row.timestamp,
      level: row.level,
      source: row.source,
      message: row.message,
      details: row.details ? JSON.parse(row.details) : null,
      filePath: row.file_path,
      releaseTitle: row.release_title,
      jobId: row.job_id,
      errorStack: row.error_stack,
    };

    res.json({
      success: true,
      log,
    });
  } catch (error: any) {
    console.error('Error fetching log:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch log',
    });
  }
});

// GET /api/logs/job/:jobId - Get all logs for a specific job
router.get('/job/:jobId', (req: Request, res: Response) => {
  try {
    const jobId = req.params.jobId;
    const rows = db.prepare(`
      SELECT * FROM structured_logs 
      WHERE job_id = ? 
      ORDER BY timestamp ASC
    `).all(jobId) as any[];

    const logs = rows.map(log => ({
      id: log.id,
      timestamp: log.timestamp,
      level: log.level,
      source: log.source,
      message: log.message,
      details: log.details ? JSON.parse(log.details) : null,
      filePath: log.file_path,
      releaseTitle: log.release_title,
      jobId: log.job_id,
      errorStack: log.error_stack,
    }));

    res.json({
      success: true,
      logs,
      count: logs.length,
    });
  } catch (error: any) {
    console.error('Error fetching job logs:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch job logs',
    });
  }
});

// POST /api/logs/export - Export logs as JSON or CSV
router.post('/export', (req: Request, res: Response) => {
  try {
    const { format = 'json', filters } = req.body;
    
    // Build query similar to GET /api/logs
    let sql = 'SELECT * FROM structured_logs WHERE 1=1';
    const params: any[] = [];

    if (filters) {
      if (filters.level) {
        sql += ' AND level = ?';
        params.push(filters.level);
      }
      if (filters.source) {
        sql += ' AND source = ?';
        params.push(filters.source);
      }
      if (filters.jobId) {
        sql += ' AND job_id = ?';
        params.push(filters.jobId);
      }
      if (filters.search) {
        sql += ' AND (message LIKE ? OR release_title LIKE ? OR file_path LIKE ?)';
        const searchTerm = `%${filters.search}%`;
        params.push(searchTerm, searchTerm, searchTerm);
      }
      if (filters.dateFrom) {
        sql += ' AND timestamp >= ?';
        params.push(filters.dateFrom);
      }
      if (filters.dateTo) {
        sql += ' AND timestamp <= ?';
        params.push(filters.dateTo);
      }
    }

    sql += ' ORDER BY timestamp DESC LIMIT 10000'; // Max 10k for export

    const rows = db.prepare(sql).all(params) as any[];

    if (format === 'csv') {
      // Generate CSV
      const headers = ['timestamp', 'level', 'source', 'message', 'filePath', 'releaseTitle', 'jobId'];
      const csvRows = [
        headers.join(','),
        ...rows.map(row => [
          row.timestamp,
          row.level,
          row.source,
          `"${(row.message || '').replace(/"/g, '""')}"`,
          row.file_path || '',
          row.release_title || '',
          row.job_id || '',
        ].join(','))
      ];

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=logs.csv');
      res.send(csvRows.join('\n'));
    } else {
      // JSON export
      const logs = rows.map(log => ({
        id: log.id,
        timestamp: log.timestamp,
        level: log.level,
        source: log.source,
        message: log.message,
        details: log.details ? JSON.parse(log.details) : null,
        filePath: log.file_path,
        releaseTitle: log.release_title,
        jobId: log.job_id,
        errorStack: log.error_stack,
      }));

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename=logs.json');
      res.json(logs);
    }
  } catch (error: any) {
    console.error('Error exporting logs:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to export logs',
    });
  }
});

export default router;

