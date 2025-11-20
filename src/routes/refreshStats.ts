// In-memory store for refresh progress (resets on server restart)
let refreshStats: {
  isRunning: boolean;
  startTime?: Date;
  currentFeed?: string;
  feedsProcessed: number;
  totalFeeds: number;
  itemsProcessed: number;
  newCount: number;
  upgradeCount: number;
  ignoredCount: number;
  errorCount: number;
  lastUpdate: Date;
} = {
  isRunning: false,
  feedsProcessed: 0,
  totalFeeds: 0,
  itemsProcessed: 0,
  newCount: 0,
  upgradeCount: 0,
  ignoredCount: 0,
  errorCount: 0,
  lastUpdate: new Date(),
};

export function getRefreshStats() {
  return { ...refreshStats };
}

export function setRefreshStats(updates: Partial<typeof refreshStats>) {
  refreshStats = {
    ...refreshStats,
    ...updates,
    lastUpdate: new Date(),
  };
}

export function resetRefreshStats() {
  refreshStats = {
    isRunning: false,
    feedsProcessed: 0,
    totalFeeds: 0,
    itemsProcessed: 0,
    newCount: 0,
    upgradeCount: 0,
    ignoredCount: 0,
    errorCount: 0,
    lastUpdate: new Date(),
  };
}

