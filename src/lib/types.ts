export type Chapter = {
  id: string;
  title: string;
  slug: string;
  number: number;
  publishedAt: string;
  pages: string[];
  estimatedMinutes?: number;
};

export type Series = {
  id: string;
  slug: string;
  title: string;
  shortDescription: string;
  description: string;
  coverImage: string;
  bannerImage: string;
  author: string;
  artist: string;
  status: "Ongoing" | "Completed" | "Hiatus";
  type: "Manga" | "Manhwa" | "Manhua";
  featured: boolean;
  mature: boolean;
  updatedAt: string;
  tags: string[];
  genres: string[];
  chapters: Chapter[];
};

export type Library = {
  series: Series[];
};
