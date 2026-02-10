export type ContentItemType = 'text' | 'video' | 'url' | 'audio' | 'table';

export type TableCell =
  | { type: 'text'; value: string }
  | { type: 'link'; label: string; url: string };

export type TableContent = {
  headers: string[];
  rows: { cells: TableCell[]; detailUrl?: string }[];
};

export type ContentItem = {
  id: string;
  type: ContentItemType;
  title?: string;
  text?: string;
  url?: string;
  storagePath?: string;
  table?: TableContent;
  createdAt?: string | Date | null;
};

export type PageSection = {
  id: string;
  title: string;
  items: ContentItem[];
};

export type PageDoc = {
  id: string;
  slug: string;
  title: string;
  description?: string;
  sections: PageSection[];
  published: boolean;
  detailPages?: PageDoc[];
  parentSlug?: string;
  sourceKey?: string;
  order?: number;
  updatedAt?: string | Date | null;
  createdAt?: string | Date | null;
};
