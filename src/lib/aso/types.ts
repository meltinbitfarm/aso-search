export interface ItunesApp {
  trackId: number;
  trackName: string;
  artistName: string;
  userRatingCount: number;
  averageUserRating: number;
  currentVersionReleaseDate: string;
  releaseDate?: string;
  price: number;
  formattedPrice?: string;
  currency?: string;
  artworkUrl60?: string;
  artworkUrl100?: string;
  artworkUrl512?: string;
  trackViewUrl?: string;
  primaryGenreName?: string;
  description?: string;
  screenshotUrls?: string[];
  ipadScreenshotUrls?: string[];
  version?: string;
}

export interface Distribution {
  monsters: number;
  strong: number;
  medium: number;
  weak: number;
  zombies: number;
}

export interface ScoreBundle {
  competition: number;
  strength: number;
  quality: number;
  freshness: number;
  saturation: number;
  zombie: number;
  top10gap: number;
  top10density: number;
}

export interface RelatedKeyword {
  word: string;
  count: number;
}

export interface AnalyzeResult {
  keyword: string;
  rawKeyword?: string;
  totalApps: number;
  validApps: number;
  zombies: number;
  stale: number;
  avgReviews: number;
  medianReviews: number;
  maxReviews: number;
  avgRating: string;
  avgAgeDays: number;
  nameMatches: number;
  top10exact: number;
  top10strong: number;
  paidApps: number;
  freeRatio: string;
  distribution: Distribution;
  opportunity: number;
  scores: ScoreBundle;
  relatedKeywords: RelatedKeyword[];
  apps: ItunesApp[];
  timestamp: string;
}

export interface TargetedKeyword {
  kw: string;
  type: string;
}

export interface SuggestionTip {
  type: "warning" | "tip";
  text: string;
}

export interface SuggestionBundle {
  suggestedTitle: string;
  suggestedSubtitle: string;
  targetedKeywords: TargetedKeyword[];
  tips: SuggestionTip[];
}

export interface Grade {
  letter: "A" | "B" | "C" | "D" | "F";
  color: string;
  bg: string;
  label: string;
}
