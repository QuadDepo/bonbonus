export class AhScrapeError extends Error {
  name = 'AhScrapeError';
}

export class AhNetworkError extends AhScrapeError {
  name = 'AhNetworkError';
}

export class AhSourceChangedError extends AhScrapeError {
  name = 'AhSourceChangedError';
}
